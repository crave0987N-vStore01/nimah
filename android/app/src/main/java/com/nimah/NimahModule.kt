package com.nimah

import android.Manifest
import android.app.SearchManager
import android.media.AudioManager
import android.os.BatteryManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.AlarmClock
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.MediaStore
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * Native bridge for Nimah:
 *  - Speech-to-text (SpeechRecognizer) with partial results + mic level
 *  - Text-to-speech (with fallback to English if the language pack is missing)
 *  - Contacts lookup, WhatsApp, SMS, calls, alarms, timers, apps, maps, music, flashlight
 *  - Foreground-service control for background mode
 */
class NimahModule(private val rc: ReactApplicationContext) :
    ReactContextBaseJavaModule(rc), TextToSpeech.OnInitListener {

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeak: Promise? = null
    private var lastRmsEmit = 0L

    init { tts = TextToSpeech(rc, this) }

    override fun getName() = "NimahModule"

    // ---------------------------------------------------------------- helpers
    private fun emit(event: String, params: WritableMap? = null) {
        if (!rc.hasActiveReactInstance()) return
        rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, params)
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(rc, permission) == PackageManager.PERMISSION_GRANTED

    /** Starts an activity; returns false if nothing can handle it. */
    private fun launch(intent: Intent): Boolean = try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        (rc.currentActivity ?: rc).startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) { false }

    /** "+94 77 123 4567" / "0771234567" / "0094771234567" -> "94771234567" */
    private fun normalizeNumber(raw: String, countryCode: String): String {
        val hasPlus = raw.trim().startsWith("+")
        val digits = raw.filter { it.isDigit() }
        return when {
            hasPlus -> digits
            digits.startsWith("00") -> digits.drop(2)
            digits.startsWith("0") -> countryCode + digits.drop(1)
            else -> digits
        }
    }

    /**
     * Prefer a male-sounding TTS voice when one is available for the active locale.
     *
     * We purposely avoid any direct use of Voice.GENDER_MALE/voice.gender because those
     * fields are not consistently exposed by all Android TTS engines, and accessing them
     * can break Kotlin compilation or runtime behavior on some devices. We only use the
     * locale match plus a conservative name heuristic for extra preference.
     */
    private fun preferredMaleVoice(locale: Locale): Voice? {
        val voices = tts?.voices ?: return null
        val localeName = locale.language.lowercase(Locale.ROOT)
        val localeMatch = voices.filter { v ->
            val vLocale = v.locale ?: return@filter false
            vLocale.language.equals(locale.language, ignoreCase = true)
                || vLocale == locale
        }

        fun looksMaleLike(v: Voice): Boolean {
            val name = v.name.orEmpty()
            return name.contains("male", ignoreCase = true)
                || name.contains("man", ignoreCase = true)
                || name.contains("voice 1", ignoreCase = true)
                || name.contains("voice 2", ignoreCase = true) && name.contains("male", ignoreCase = true)
        }

        val exact = localeMatch.firstOrNull { looksMaleLike(it) }
        if (exact != null) return exact

        val fallback = voices.firstOrNull { looksMaleLike(it) }
        return fallback
    }

    // Required by NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ---------------------------------------------------------- speech-to-text
    @ReactMethod
    fun startListening(locale: String, promise: Promise) {
        if (!granted(Manifest.permission.RECORD_AUDIO)) {
            promise.reject("NO_MIC_PERMISSION", "Microphone permission not granted"); return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(rc)) {
            promise.reject("NO_RECOGNIZER", "No speech recognition service on this device"); return
        }
        // SpeechRecognizer MUST be used on the main thread.
        main.post {
            try {
                recognizer?.destroy()
                recognizer = SpeechRecognizer.createSpeechRecognizer(rc).apply {
                    setRecognitionListener(listener)
                }
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, rc.packageName)
                }
                recognizer?.startListening(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("START_FAILED", e.message, e)
            }
        }
    }

    /** Stop capturing audio and deliver the final result. */
    @ReactMethod
    fun stopListening(promise: Promise) { main.post { recognizer?.stopListening(); promise.resolve(true) } }

    /** Abort silently — no result/error events are emitted. */
    @ReactMethod
    fun cancelListening(promise: Promise) { main.post { recognizer?.cancel(); promise.resolve(true) } }

    private val listener = object : RecognitionListener {
        override fun onResults(results: Bundle?) {
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull().orEmpty()
            emit("NimahSpeechResult", Arguments.createMap().apply { putString("text", text) })
        }

        override fun onPartialResults(partial: Bundle?) {
            val text = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull() ?: return
            emit("NimahSpeechPartial", Arguments.createMap().apply { putString("text", text) })
        }

        // Mic loudness (≈ -2..10 dB) — drives the waveform. Throttled to ~14 Hz.
        override fun onRmsChanged(rmsdB: Float) {
            val now = System.currentTimeMillis()
            if (now - lastRmsEmit < 70) return
            lastRmsEmit = now
            emit("NimahSpeechRms", Arguments.createMap().apply { putDouble("level", rmsdB.toDouble()) })
        }

        override fun onError(error: Int) {
            val msg = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                SpeechRecognizer.ERROR_CLIENT -> "Client error"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Missing microphone permission"
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network error"
                SpeechRecognizer.ERROR_NO_MATCH -> "I didn't catch that"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                SpeechRecognizer.ERROR_SERVER -> "Recognition server error"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't hear anything"
                else -> "Unknown speech error"
            }
            emit("NimahSpeechError", Arguments.createMap().apply {
                putInt("code", error); putString("message", msg)
            })
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    // ---------------------------------------------------------- text-to-speech
    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { resolveSpeak() }
            @Deprecated("Deprecated in Java") override fun onError(id: String?) { resolveSpeak() }
            override fun onStop(id: String?, interrupted: Boolean) { resolveSpeak() }
        })
    }

    private fun resolveSpeak() { pendingSpeak?.resolve(true); pendingSpeak = null }

    /** Promise resolves when the utterance FINISHES, so JS can await it. */
    @ReactMethod
    fun speak(text: String, locale: String, rate: Double, promise: Promise) {
        if (!ttsReady) { promise.reject("TTS_NOT_READY", "Text-to-speech not initialised"); return }
        resolveSpeak()
        pendingSpeak = promise

        val localeObj = Locale.forLanguageTag(locale)
        val preferredVoice = preferredMaleVoice(localeObj)
        if (preferredVoice != null) {
            tts?.voice = preferredVoice
        }

        val result = tts?.setLanguage(localeObj)
        // Language pack missing (e.g. Sinhala voice not installed) -> fall back to English.
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts?.setLanguage(Locale.US)
        }
        if (preferredVoice != null) {
            tts?.voice = preferredVoice
        }
        tts?.setSpeechRate(rate.toFloat())
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "nimah-utterance")
    }

    @ReactMethod
    fun stopSpeaking(promise: Promise) { tts?.stop(); promise.resolve(true) }

    // ---------------------------------------------------------------- contacts
    /** Returns [{name, number}] for contacts whose name contains [name] (max 40 rows). */
    @ReactMethod
    fun findContacts(name: String, promise: Promise) {
        if (!granted(Manifest.permission.READ_CONTACTS)) {
            promise.reject("NO_CONTACTS_PERMISSION", "Contacts permission not granted"); return
        }
        Thread {
            try {
                val resolver = rc.contentResolver
                val uri = Phone.CONTENT_URI
                val projection = arrayOf(Phone.DISPLAY_NAME, Phone.NUMBER)
                val cursor = resolver.query(uri, projection, null, null, "${Phone.DISPLAY_NAME} COLLATE LOCALIZED ASC LIMIT 40")
                val out = Arguments.createArray()
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        val displayName = cursor.getString(cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME)) ?: ""
                        val number = cursor.getString(cursor.getColumnIndexOrThrow(Phone.NUMBER)) ?: ""
                        if (displayName.isBlank() || number.isBlank()) continue
                        if (displayName.contains(name, ignoreCase = true)) {
                            val item = Arguments.createMap().apply {
                                putString("name", displayName)
                                putString("number", number)
                            }
                            out.pushMap(item)
                        }
                    }
                    cursor.close()
                }
                promise.resolve(out)
            } catch (e: Exception) {
                promise.reject("CONTACTS_FAILED", e.message, e)
            }
        }.start()
    }

    // ---------------------------------------------------------------- simple actions
    @ReactMethod
    fun openWhatsApp(phone: String, message: String, countryCode: String, autoSend: Boolean, promise: Promise) {
        val number = normalizeNumber(phone, countryCode)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$number?text=${Uri.encode(message)}"))
            .setPackage("com.whatsapp")
        val okay = launch(intent)
        if (okay) promise.resolve(true) else promise.reject("NO_WHATSAPP", "WhatsApp not installed")
    }

    @ReactMethod
    fun sendSms(phone: String, message: String, countryCode: String, autoSend: Boolean, promise: Promise) {
        val number = "+" + normalizeNumber(phone, countryCode)
        if (autoSend && granted(Manifest.permission.SEND_SMS)) {
            try {
                @Suppress("DEPRECATION")
                val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    rc.getSystemService(SmsManager::class.java) else SmsManager.getDefault()
                sms.sendMultipartTextMessage(number, null, sms.divideMessage(message), null, null)
                promise.resolve(true)
            } catch (e: Exception) { promise.reject("SMS_FAILED", e.message, e) }
            return
        }
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$number")).putExtra("sms_body", message)
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_SMS_APP", "No SMS app found")
    }

    // ------------------------------------------------------ hands-free setup
    @ReactMethod
    fun isAutoSendEnabled(promise: Promise) { promise.resolve(NimahAccessibilityService.isEnabled(rc)) }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        val settings = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        if (launch(settings)) promise.resolve(true) else promise.reject("NO_SETTINGS", "Accessibility settings unavailable")
    }

    @ReactMethod
    fun enableAccessibilityService(promise: Promise) {
        try {
            val enabled = NimahAccessibilityService.isEnabled(rc)
            if (enabled) { promise.resolve(true); return }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && rc.getSystemService(Context.ROLE_SERVICE) != null) {
                // No-op on modern Android; service is enabled via the Accessibility settings screen.
            }
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            if (launch(intent)) promise.resolve(true) else promise.reject("NO_SETTINGS", "Accessibility settings unavailable")
        } catch (e: Exception) {
            promise.reject("ENABLE_A11Y_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun canWriteSecureSettings(promise: Promise) {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(rc)
        promise.resolve(allowed)
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${rc.packageName}"))
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_BATTERY_OPT", "Could not request battery optimization exemption")
    }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_SETTINGS", "Notification access settings unavailable")
    }

    @ReactMethod
    fun callNumber(phone: String, countryCode: String, promise: Promise) {
        val number = normalizeNumber(phone, countryCode)
        val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))
        if (granted(Manifest.permission.CALL_PHONE)) {
            if (launch(intent)) promise.resolve(true) else promise.reject("NO_CALL_APP", "No dialer app found")
        } else {
            promise.reject("NO_CALL_PERMISSION", "Phone permission not granted")
        }
    }

    @ReactMethod
    fun setAlarm(hour: Int, minute: Int, label: String, promise: Promise) {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(AlarmClock.EXTRA_HOUR, hour)
            putExtra(AlarmClock.EXTRA_MINUTES, minute)
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
        }
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_ALARM_APP", "No alarm app found")
    }

    @ReactMethod
    fun setTimer(seconds: Int, label: String, promise: Promise) {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_LENGTH, seconds)
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
        }
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_TIMER_APP", "No timer app found")
    }

    @ReactMethod
    fun openApp(name: String, promise: Promise) {
        val pkg = rc.packageManager.getLaunchIntentForPackage(name)
        if (pkg == null) {
            promise.reject("APP_NOT_FOUND", "No app found for $name")
            return
        }
        if (launch(pkg)) promise.resolve(true) else promise.reject("APP_OPEN_FAILED", "Could not launch app")
    }

    @ReactMethod
    fun navigate(destination: String, promise: Promise) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/?api=1&query=${Uri.encode(destination)}"))
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_MAPS_APP", "No maps app found")
    }

    @ReactMethod
    fun playMusic(query: String, promise: Promise) {
        val intent = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH).apply {
            putExtra(SearchManager.QUERY, query)
            putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
        }
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_MUSIC_APP", "No music app found")
    }

    @ReactMethod
    fun setFlashlight(on: Boolean, promise: Promise) {
        val cameraManager = rc.getSystemService(CameraManager::class.java)
        val id = cameraManager.cameraIdList.firstOrNull() ?: run {
            promise.reject("NO_CAMERA", "No camera found")
            return
        }
        try {
            cameraManager.setTorchMode(id, on)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FLASHLIGHT_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun startBackgroundService(promise: Promise) {
        val intent = Intent(rc, NimahService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            rc.startForegroundService(intent)
        } else {
            rc.startService(intent)
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun stopBackgroundService(promise: Promise) {
        rc.stopService(Intent(rc, NimahService::class.java))
        promise.resolve(true)
    }

    @ReactMethod
    fun setVolume(percent: Int, stream: String, promise: Promise) {
        val audio = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val streamId = when (stream.lowercase()) {
            "music" -> AudioManager.STREAM_MUSIC
            "alarm" -> AudioManager.STREAM_ALARM
            "ring" -> AudioManager.STREAM_RING
            else -> AudioManager.STREAM_MUSIC
        }
        val max = audio.getStreamMaxVolume(streamId)
        val target = (percent.coerceIn(0, 100) / 100.0 * max).toInt().coerceAtLeast(0)
        audio.setStreamVolume(streamId, target, 0)
        promise.resolve(true)
    }

    @ReactMethod
    fun deviceInfo(promise: Promise) {
        val map = Arguments.createMap().apply {
            putString("time", java.time.LocalTime.now().toString())
            putString("date", java.time.LocalDate.now().toString())
            putDouble("battery", 0.0)
            putBoolean("charging", false)
            putInt("musicVolume", 0)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun openUrl(url: String, promise: Promise) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_URL_APP", "No browser app found")
    }

    @ReactMethod
    fun openSettings(page: String, promise: Promise) {
        val intent = when (page.lowercase()) {
            "wifi" -> Intent(Settings.ACTION_WIFI_SETTINGS)
            "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
            "battery" -> Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
            else -> Intent(Settings.ACTION_SETTINGS)
        }
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_SETTINGS", "Settings unavailable")
    }

    @ReactMethod
    fun isNotificationAccessEnabled(promise: Promise) { promise.resolve(NimahNotificationService.isEnabled(rc)) }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_SETTINGS", "Notification access settings unavailable")
    }

    @ReactMethod
    fun getNotifications(promise: Promise) {
        val arr = Arguments.createArray()
        val items = NimahNotificationService.instance?.current() ?: emptyList()
        for (item in items) {
            val map = Arguments.createMap().apply {
                putString("key", item.key)
                putString("app", item.app)
                putString("title", item.title)
                putString("text", item.text)
            }
            arr.pushMap(map)
        }
        promise.resolve(arr)
    }

    @ReactMethod
    fun dismissNotification(key: String, promise: Promise) {
        val service = NimahNotificationService.instance ?: run {
            promise.reject("NO_NOTIFICATION_ACCESS", "Notification access is off")
            return
        }
        service.dismiss(key)
        promise.resolve(true)
    }

    @ReactMethod
    fun screenRead(promise: Promise) {
        val snapshot = NimahAccessibilityService.instance?.snapshot() ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val map = Arguments.createMap().apply {
            putString("package", snapshot.pkg)
            putString("text", snapshot.text)
            putInt("count", snapshot.count)
            putInt("width", snapshot.width)
            putInt("height", snapshot.height)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun screenshot(promise: Promise) {
        val bitmap = NimahAccessibilityService.instance?.screenshot() ?: run {
            promise.resolve(null)
            return
        }
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
        promise.resolve(Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP))
    }

    @ReactMethod
    fun uiClick(id: Int, long: Boolean, promise: Promise) {
        val service = NimahAccessibilityService.instance ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val ok = service.click(id, long)
        promise.resolve(ok)
    }

    @ReactMethod
    fun uiType(id: Int, text: String, submit: Boolean, promise: Promise) {
        val service = NimahAccessibilityService.instance ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val ok = service.type(id, text, submit)
        promise.resolve(ok)
    }

    @ReactMethod
    fun uiScroll(direction: String, id: Int, promise: Promise) {
        val service = NimahAccessibilityService.instance ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val ok = service.scroll(direction, id)
        promise.resolve(ok)
    }

    @ReactMethod
    fun uiGesture(x1: Int, y1: Int, x2: Int, y2: Int, durationMs: Int, promise: Promise) {
        val service = NimahAccessibilityService.instance ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val ok = service.gesture(x1, y1, x2, y2, durationMs)
        promise.resolve(ok)
    }

    @ReactMethod
    fun uiGlobal(name: String, promise: Promise) {
        val service = NimahAccessibilityService.instance ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val ok = service.global(name)
        promise.resolve(ok)
    }

    @ReactMethod
    fun waitForIdle(quietMs: Int, timeoutMs: Int, promise: Promise) {
        val service = NimahAccessibilityService.instance ?: run {
            promise.reject("NO_ACCESSIBILITY", "Accessibility service unavailable")
            return
        }
        val ok = service.waitForIdle(quietMs, timeoutMs)
        promise.resolve(ok)
    }

    @ReactMethod
    fun consumeStopRequest(promise: Promise) {
        val req = NimahAccessibilityService.consumeStopRequest()
        promise.resolve(req)
    }

    companion object {
        private const val TAG = "NimahModule"
    }
}

