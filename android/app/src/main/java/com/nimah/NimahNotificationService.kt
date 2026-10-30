package com.nimah

import android.app.KeyguardManager
import android.app.Notification
import android.app.RemoteInput
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Lets Nimah read (and dismiss) notifications by voice: "what are my new messages?". */
class NimahNotificationService : NotificationListenerService() {

    override fun onListenerConnected() { instance = this }
    override fun onListenerDisconnected() { instance = null }

    private val messagingPkgs = setOf("com.whatsapp", "com.whatsapp.w4b", "com.google.android.apps.messaging", "com.android.mms",
        "com.samsung.android.messaging", "org.telegram.messenger", "com.facebook.orca", "org.thoughtcrime.securesms")

    /** New chat message -> JS (read aloud + voice reply). Group summaries and ongoing notifications are skipped. */
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val n = sbn.notification
            if (sbn.packageName == packageName || (n.flags and Notification.FLAG_GROUP_SUMMARY) != 0 || sbn.isOngoing) return
            if (n.category != Notification.CATEGORY_MESSAGE && sbn.packageName !in messagingPkgs) return
            val item = toItem(sbn) ?: return
            val canReply = n.actions?.any { a -> a.remoteInputs?.isNotEmpty() == true } == true
            val locked = (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
            onMessage?.invoke(item, sbn.packageName, canReply, locked)
        } catch (e: Exception) { /* never crash the listener */ }
    }

    /** Sends [text] through the notification's own "Reply" action (works for WhatsApp, SMS, Telegram ...). */
    fun reply(key: String, text: String): Boolean = try {
        val sbn = (activeNotifications ?: emptyArray()).firstOrNull { it.key == key } ?: return false
        val action = sbn.notification.actions?.firstOrNull { a -> a.remoteInputs?.isNotEmpty() == true } ?: return false
        val inputs = action.remoteInputs
        val bundle = Bundle()
        for (ri in inputs) bundle.putCharSequence(ri.resultKey, text)
        val intent = Intent()
        RemoteInput.addResultsToIntent(inputs, intent, bundle)
        action.actionIntent.send(applicationContext, 0, intent)
        true
    } catch (e: Exception) { false }

    data class Item(val key: String, val app: String, val title: String, val text: String)

    fun current(): List<Item> = try {
        (activeNotifications ?: emptyArray()).mapNotNull { sbn -> toItem(sbn) }.take(25)
    } catch (e: Exception) { emptyList() }

    private fun toItem(sbn: StatusBarNotification): Item? {
        if (sbn.packageName == packageName) return null
        val ex = sbn.notification.extras
        val title = ex.getCharSequence("android.title")?.toString().orEmpty()
        val text = (ex.getCharSequence("android.bigText") ?: ex.getCharSequence("android.text"))?.toString().orEmpty()
        if (title.isEmpty() && text.isEmpty()) return null
        val pm = applicationContext.packageManager
        val app = try { pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString() }
                  catch (e: Exception) { sbn.packageName }
        return Item(sbn.key, app, title.take(80), text.take(200))
    }

    companion object {
        @Volatile var instance: NimahNotificationService? = null
        /** item, package, canReply, deviceLocked */
        @Volatile var onMessage: ((Item, String, Boolean, Boolean) -> Unit)? = null

        fun isEnabled(ctx: Context): Boolean {
            val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: return false
            val me = ComponentName(ctx, NimahNotificationService::class.java)
            return flat.split(':').any { ComponentName.unflattenFromString(it) == me }
        }
    }
}
