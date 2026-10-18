package com.nimah

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.view.Display
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream

/**
 * Nimah's "hands". Lets the AI see the current screen as a compact text list and
 * operate ANY app: tap, long-press, type, scroll, swipe, back / home / recents, etc.
 *
 * Also keeps the old hands-free "Send" for WhatsApp.
 *
 * Kill switch: hold VOLUME DOWN and press VOLUME UP -> [stopRequested] becomes true
 * and the JS agent loop stops at once.
 */
class NimahAccessibilityService : AccessibilityService() {

    /** Nodes of the last snapshot; the id the AI sees is the index in this list. */
    private val nodes = ArrayList<AccessibilityNodeInfo>()
    private val lock = Any()

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {}

    // ------------------------------------------------------------------ events
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        lastEventAt = System.currentTimeMillis()
        // Hands-free WhatsApp Send (armed for ~15 s after Nimah opens a pre-filled chat).
        if (System.currentTimeMillis() > armedUntil) return
        val pkg = event?.packageName?.toString() ?: return
        if (!pkg.startsWith("com.whatsapp")) return
        val root = rootInActiveWindow ?: return
        if (tryClickSend(root)) armedUntil = 0L
    }

    // Kill switch: VOLUME_DOWN held + VOLUME_UP pressed.
    private var volDownHeld = false
    override fun onKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_DOWN -> volDownHeld = event.action == KeyEvent.ACTION_DOWN
            KeyEvent.KEYCODE_VOLUME_UP ->
                if (event.action == KeyEvent.ACTION_DOWN && volDownHeld) {
                    stopRequested = true
                    return true
                }
        }
        return false // never swallow normal volume presses
    }

    // ---------------------------------------------------------------- snapshot
    class Snapshot(val pkg: String, val text: String, val count: Int, val width: Int, val height: Int)

    /** Reads the active window into numbered lines the AI can refer to. */
    fun snapshot(): Snapshot {
        val dm = resources.displayMetrics
        val root = rootInActiveWindow
        synchronized(lock) {
            nodes.clear()
            if (root == null) return Snapshot("unknown", "(screen not readable)", 0, dm.widthPixels, dm.heightPixels)
            val sb = StringBuilder()
            walk(root, sb, 0)
            return Snapshot(root.packageName?.toString() ?: "unknown", sb.toString(), nodes.size,
                dm.widthPixels, dm.heightPixels)
        }
    }

    private fun walk(n: AccessibilityNodeInfo, sb: StringBuilder, depth: Int) {
        if (nodes.size >= MAX_NODES || depth > 40) return
        if (!n.isVisibleToUser) return

        val text = n.text?.toString()?.trim().orEmpty()
        val desc = n.contentDescription?.toString()?.trim().orEmpty()
        val hint = if (Build.VERSION.SDK_INT >= 26) n.hintText?.toString()?.trim().orEmpty() else ""
        val interactive = n.isClickable || n.isLongClickable || n.isEditable ||
            n.isScrollable || n.isCheckable
        val useful = interactive || text.isNotEmpty() || desc.isNotEmpty()

        if (useful) {
            val id = nodes.size
            nodes.add(n)
            val r = Rect(); n.getBoundsInScreen(r)
            val kind = (n.className?.toString() ?: "View").substringAfterLast('.')
            val label = when {
                n.isPassword -> "[password field - hidden]"
                text.isNotEmpty() -> text
                desc.isNotEmpty() -> desc
                else -> hint
            }.replace('\n', ' ').take(90)
            val flags = ArrayList<String>()
            if (n.isClickable) flags += "tap"
            if (n.isLongClickable) flags += "long"
            if (n.isEditable) flags += "edit"
            if (n.isFocused) flags += "focused"
            if (n.isScrollable) flags += "scroll"
            if (n.isCheckable) flags += if (n.isChecked) "checked" else "unchecked"
            if (n.isSelected) flags += "selected"
            if (!n.isEnabled) flags += "disabled"
            val rid = n.viewIdResourceName?.substringAfterLast('/')?.take(30)
            sb.append('[').append(id).append("] ").append(kind)
            if (label.isNotEmpty()) sb.append(" \"").append(label).append('"')
            if (n.isEditable && hint.isNotEmpty() && text.isNotEmpty()) sb.append(" hint=\"").append(hint.take(40)).append('"')
            if (flags.isNotEmpty()) sb.append(" (").append(flags.joinToString(",")).append(')')
            if (rid != null) sb.append(" #").append(rid)
            sb.append(" @").append(r.centerX()).append(',').append(r.centerY()).append('\n')
        }
        for (i in 0 until n.childCount) {
            val c = n.getChild(i) ?: continue
            walk(c, sb, depth + 1)
        }
    }

    private fun nodeAt(id: Int): AccessibilityNodeInfo? = synchronized(lock) { nodes.getOrNull(id) }

    // ----------------------------------------------------------------- actions
    /** Clicks node [id] (or its nearest clickable parent); falls back to a real tap on its centre. */
    fun clickNode(id: Int, long: Boolean = false): Boolean {
        val node = nodeAt(id) ?: return false
        node.refresh()
        var n: AccessibilityNodeInfo? = node
        val action = if (long) AccessibilityNodeInfo.ACTION_LONG_CLICK else AccessibilityNodeInfo.ACTION_CLICK
        while (n != null) {
            if ((if (long) n.isLongClickable else n.isClickable) && n.performAction(action)) return true
            n = n.parent
        }
        val r = Rect(); node.getBoundsInScreen(r)
        return gesture(r.centerX().toFloat(), r.centerY().toFloat(), r.centerX().toFloat(), r.centerY().toFloat(),
            if (long) 700 else 60)
    }

    /** Replaces the text of node [id] (or the focused input). Optionally presses the keyboard's action key. */
    fun setText(id: Int?, text: String, submit: Boolean): Boolean {
        val node = (if (id != null) nodeAt(id) else null)
            ?: rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: return false
        node.refresh()
        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (ok && submit && Build.VERSION.SDK_INT >= 30) {
            Thread.sleep(250)
            node.refresh()
            node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
        }
        return ok
    }

    /** direction = the way the CONTENT should move into view: "down" shows what is below. */
    fun scroll(direction: String, id: Int?): Boolean {
        val target = (if (id != null) nodeAt(id) else null) ?: firstScrollable()
        val vertical = direction == "up" || direction == "down"
        if (target != null && vertical) {
            val act = if (direction == "down") AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                      else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            if (target.performAction(act)) return true
        }
        val dm = resources.displayMetrics
        val w = dm.widthPixels.toFloat(); val h = dm.heightPixels.toFloat()
        return when (direction) {
            "down" -> gesture(w / 2, h * 0.75f, w / 2, h * 0.30f, 350)
            "up" -> gesture(w / 2, h * 0.30f, w / 2, h * 0.75f, 350)
            "left" -> gesture(w * 0.80f, h / 2, w * 0.20f, h / 2, 300)   // next page
            "right" -> gesture(w * 0.20f, h / 2, w * 0.80f, h / 2, 300)
            else -> false
        }
    }

    private fun firstScrollable(): AccessibilityNodeInfo? = synchronized(lock) { nodes.firstOrNull { it.isScrollable } }

    /** Straight-line swipe / tap. Blocks (max ~2 s) until the gesture finishes. */
    fun gesture(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
        val path = Path().apply { moveTo(x1, y1); if (x1 != x2 || y1 != y2) lineTo(x2, y2) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1))
        val latch = java.util.concurrent.CountDownLatch(1)
        var done = false
        val sent = dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(),
            object : GestureResultCallback() {
                override fun onCompleted(g: GestureDescription?) { done = true; latch.countDown() }
                override fun onCancelled(g: GestureDescription?) { latch.countDown() }
            }, null)
        if (!sent) return false
        latch.await(durationMs + 1500, java.util.concurrent.TimeUnit.MILLISECONDS)
        return done
    }

    fun global(name: String): Boolean = when (name) {
        "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
        "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
        "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
        "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
        "quick_settings" -> performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
        "power_menu" -> performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)
        "lock_screen" -> Build.VERSION.SDK_INT >= 28 && performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
        "take_screenshot" -> Build.VERSION.SDK_INT >= 28 && performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT)
        else -> false
    }

    /** JPEG (base64, ~720 px wide) of the screen, for apps whose UI tree is empty (games, canvas, video). Android 11+. */
    fun screenshotBase64(callback: (String?) -> Unit) {
        if (Build.VERSION.SDK_INT < 30) { callback(null); return }
        takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
            override fun onSuccess(result: ScreenshotResult) {
                try {
                    val hw = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                    val soft = hw?.copy(Bitmap.Config.ARGB_8888, false)
                    result.hardwareBuffer.close()
                    if (soft == null) { callback(null); return }
                    val scale = 720f / soft.width
                    val small = Bitmap.createScaledBitmap(soft, 720, (soft.height * scale).toInt(), true)
                    val out = ByteArrayOutputStream()
                    small.compress(Bitmap.CompressFormat.JPEG, 60, out)
                    callback(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
                } catch (e: Exception) { callback(null) }
            }
            override fun onFailure(errorCode: Int) { callback(null) }
        })
    }

    // --------------------------------------------------- WhatsApp hands-free send
    private fun tryClickSend(root: AccessibilityNodeInfo): Boolean {
        for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            val node = root.findAccessibilityNodeInfosByViewId("$pkg:id/send").firstOrNull()
            if (node != null && clickUp(node)) return true
        }
        return findByLabel(root)
    }

    private fun findByLabel(node: AccessibilityNodeInfo): Boolean {
        val desc = node.contentDescription?.toString()?.trim()?.lowercase()
        if (desc != null && desc in SEND_LABELS && clickUp(node)) return true
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (findByLabel(child)) return true
        }
        return false
    }

    private fun clickUp(node: AccessibilityNodeInfo): Boolean {
        var n: AccessibilityNodeInfo? = node
        while (n != null) {
            if (n.isClickable) return n.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            n = n.parent
        }
        return false
    }

    companion object {
        private const val MAX_NODES = 160
        @Volatile var instance: NimahAccessibilityService? = null
        @Volatile var armedUntil = 0L
        @Volatile var lastEventAt = 0L
        @Volatile var stopRequested = false
        private val SEND_LABELS = setOf("send", "යවන්න")

        fun arm(windowMs: Long = 15_000) { armedUntil = System.currentTimeMillis() + windowMs }

        fun isEnabled(ctx: Context): Boolean {
            val enabled = Settings.Secure.getString(
                ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return enabled.split(':').any {
                it.startsWith(ctx.packageName + "/") && it.endsWith("NimahAccessibilityService")
            }
        }
    }
}
