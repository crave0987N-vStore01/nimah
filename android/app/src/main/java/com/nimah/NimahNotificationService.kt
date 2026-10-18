package com.nimah

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Lets Nimah read (and dismiss) notifications by voice: "what are my new messages?". */
class NimahNotificationService : NotificationListenerService() {

    override fun onListenerConnected() { instance = this }
    override fun onListenerDisconnected() { instance = null }

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

        fun isEnabled(ctx: Context): Boolean {
            val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: return false
            val me = ComponentName(ctx, NimahNotificationService::class.java)
            return flat.split(':').any { ComponentName.unflattenFromString(it) == me }
        }
    }
}
