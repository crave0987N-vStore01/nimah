package com.nimah

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Foreground service (type: microphone). It keeps Nimah's process alive with a visible
 * notification so the JS runtime (which runs the speech loop) can keep working while another app
 * is in front. The notification has a real Stop action.
 *
 * Honest limits: Android 14+ only lets a microphone foreground service START while the app is
 * visible (or another allowed state), so it is NOT restarted automatically (START_NOT_STICKY).
 * Some phone makers also kill background apps unless battery optimisation is turned off.
 */
class NimahService : Service() {

    private var wake: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val renewWake = object : Runnable {
        override fun run() { holdWake(); handler.postDelayed(this, WAKE_MS - 60_000L) }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wake = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nimah:listening").apply { setReferenceCounted(false) }
    }

    /** Wake lock always has a timeout; it is renewed only while the service is alive. */
    private fun holdWake() { wake?.acquire(WAKE_MS) }

    override fun onDestroy() {
        handler.removeCallbacks(renewWake)
        wake?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            running = false
            onUserStop?.invoke()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIF_ID, notification)
            }
        } catch (e: Exception) {
            // Android refused to start a microphone foreground service from here (background start,
            // missing permission, ...). Stop cleanly instead of crashing.
            running = false
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        handler.removeCallbacks(renewWake)
        holdWake()
        handler.postDelayed(renewWake, WAKE_MS - 60_000L)
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Nimah background voice", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Shown while Nimah can listen in the background"
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        val open = packageManager.getLaunchIntentForPackage(packageName)
        val openPending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE)
        val stop = Intent(this, NimahService::class.java).setAction(ACTION_STOP)
        val stopPending = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Nimah is running in the background")
            .setContentText("The microphone is used only while Nimah is listening. Tap to open.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopPending)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        const val ACTION_STOP = "com.nimah.action.STOP_SERVICE"
        private const val CHANNEL_ID = "nimah_background"
        private const val NOTIF_ID = 4242
        private const val WAKE_MS = 10 * 60 * 1000L
        @Volatile var running = false
        /** Set by NimahModule so JS can stop its listening loop when the user taps Stop. */
        @Volatile var onUserStop: (() -> Unit)? = null
    }
}
