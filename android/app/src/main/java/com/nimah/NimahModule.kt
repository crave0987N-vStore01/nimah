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
import android.provider.Settings
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
                val out = Arguments.createArray()
                rc.contentResolver.query(
                    Phone.CONTENT_URI, arrayOf(Phone.DISPLAY_NAME, Phone.NUMBER),
                    "${Phone.DISPLAY_NAME} LIKE ?", arrayOf("%$name%"),
                    "${Phone.DISPLAY_NAME} ASC"
                )?.use { c ->
                    while (c.moveToNext() && out.size() < 40) {
                        val n = c.getString(0) ?: continue
                        val num = c.getString(1) ?: continue
                        out.pushMap(Arguments.createMap().apply {
                            putString("name", n); putString("number", num)
                        })
                    }
                }
                promise.resolve(out)
            } catch (e: Exception) {
                promise.reject("CONTACTS_FAILED", e.message, e)
            }
        }.start()
    }

    // ---------------------------------------------------------------- messaging
    /** Opens a WhatsApp chat with [message]; sends it automatically if [autoSend] and the accessibility service is on. */
    @ReactMethod
    fun openWhatsApp(phone: String, message: String, countryCode: String, autoSend: Boolean, promise: Promise) {
        val number = normalizeNumber(phone, countryCode)
        val uri = Uri.parse("https://wa.me/$number?text=${Uri.encode(message)}")
        // Hands-free send: arm the accessibility service (user must have enabled it).
        if (autoSend && NimahAccessibilityService.isEnabled(rc)) NimahAccessibilityService.arm()
        // Try WhatsApp, then WhatsApp Business.
        val ok = listOf("com.whatsapp", "com.whatsapp.w4b").any { pkg ->
            launch(Intent(Intent.ACTION_VIEW, uri).setPackage(pkg))
        }
        if (ok) promise.resolve(true)
        else promise.reject("WHATSAPP_NOT_INSTALLED", "WhatsApp is not installed")
    }

    /** Sends directly (SEND_SMS granted + autoSend), otherwise opens the SMS app pre-filled. */
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
        val ok = launch(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        if (ok) promise.resolve(true) else promise.reject("NO_SETTINGS", "Cannot open settings")
    }

    /**
     * Turns the Nimah accessibility + notification services ON by itself (no tapping) — possible only after the
     * one-time grant:  adb shell pm grant com.nimah android.permission.WRITE_SECURE_SETTINGS
     * Resolves true when the accessibility service is on afterwards, false when the person must switch it on manually.
     */
    @ReactMethod
    fun enableAccessibilityService(promise: Promise) {
        try {
            if (NimahAccessibilityService.isEnabled(rc)) { promise.resolve(true); return }
            if (!granted("android.permission.WRITE_SECURE_SETTINGS")) { promise.resolve(false); return }
            val cr = rc.contentResolver
            fun addTo(key: String, component: String) {
                val cur = android.provider.Settings.Secure.getString(cr, key).orEmpty()
                if (cur.split(':').any { it.equals(component, ignoreCase = true) }) return
                val next = if (cur.isBlank()) component else "$cur:$component"
                android.provider.Settings.Secure.putString(cr, key, next)
            }
            addTo("enabled_accessibility_services", "${rc.packageName}/${rc.packageName}.NimahAccessibilityService")
            android.provider.Settings.Secure.putInt(cr, "accessibility_enabled", 1)
            try { addTo("enabled_notification_listeners", "${rc.packageName}/${rc.packageName}.NimahNotificationService") } catch (_: Exception) {}
            promise.resolve(true)
        } catch (e: Exception) { promise.resolve(false) }
    }

    @ReactMethod
    fun canWriteSecureSettings(promise: Promise) { promise.resolve(granted("android.permission.WRITE_SECURE_SETTINGS")) }

    /** Asks Android not to kill Nimah in the background (shows a system dialog once). */
    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val pm = rc.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            if (pm.isIgnoringBatteryOptimizations(rc.packageName)) { promise.resolve(true); return }
            val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${rc.packageName}"))
            promise.resolve(launch(i))
        } catch (e: Exception) { promise.resolve(false) }
    }

    /** Places the call if CALL_PHONE is granted, otherwise opens the dialer. */
    @ReactMethod
    fun callNumber(phone: String, countryCode: String, promise: Promise) {
        val number = normalizeNumber(phone, countryCode)
        val action = if (granted(Manifest.permission.CALL_PHONE)) Intent.ACTION_CALL else Intent.ACTION_DIAL
        if (launch(Intent(action, Uri.parse("tel:+$number")))) promise.resolve(true)
        else promise.reject("NO_DIALER", "No phone app found")
    }

    // ------------------------------------------------------------ clock / apps
    @ReactMethod
    fun setAlarm(hour: Int, minute: Int, label: String, promise: Promise) {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour)
            .putExtra(AlarmClock.EXTRA_MINUTES, minute)
            .putExtra(AlarmClock.EXTRA_MESSAGE, label)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_CLOCK_APP", "No clock app found")
    }

    @ReactMethod
    fun setTimer(seconds: Int, label: String, promise: Promise) {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
            .putExtra(AlarmClock.EXTRA_MESSAGE, label)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        if (launch(intent)) promise.resolve(true) else promise.reject("NO_CLOCK_APP", "No clock app found")
    }

    /** Launches an installed app by (partial) label, e.g. "camera", "youtube". */
    @ReactMethod
    fun openApp(name: String, promise: Promise) {
        val pm = rc.packageManager
        // Forgiving match: ignore case, spaces and punctuation ("tik tok" finds "TikTok").
        fun norm(x: String) = x.lowercase().filter { it.isLetterOrDigit() }
        val q = norm(name)
        if (q.isEmpty()) { promise.reject("APP_NOT_FOUND", "No app name given"); return }
        val apps = pm.queryIntentActivities(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0
        ).map { Triple(it.activityInfo.packageName, it.loadLabel(pm).toString(), norm(it.loadLabel(pm).toString())) }
        val match = apps.firstOrNull { it.third == q }
            ?: apps.firstOrNull { it.third.startsWith(q) }
            ?: apps.firstOrNull { q.isNotEmpty() && it.third.contains(q) }
            ?: apps.firstOrNull { q.isNotEmpty() && q.contains(it.third) && it.third.length >= 3 }
            ?: apps.firstOrNull { q.isNotEmpty() && norm(it.first).contains(q) }
        val launchIntent = match?.let { pm.getLaunchIntentForPackage(it.first) }
        if (launchIntent != null && launch(launchIntent)) promise.resolve(true)
        else promise.reject("APP_NOT_FOUND", "No app named $name")
    }

    // ---------------------------------------------------------- maps / media
    @ReactMethod
    fun navigate(destination: String, promise: Promise) {
        val q = Uri.encode(destination)
        val nav = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$q"))
            .setPackage("com.google.android.apps.maps")
        val ok = launch(nav) || launch(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=$q")))
        if (ok) promise.resolve(true) else promise.reject("NO_MAPS_APP", "No maps app found")
    }

    /** Asks the default music app to play; falls back to a YouTube search. */
    @ReactMethod
    fun playMusic(query: String, promise: Promise) {
        val play = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
            .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
            .putExtra(SearchManager.QUERY, query)
        val yt = Intent(Intent.ACTION_VIEW,
            Uri.parse("https://www.youtube.com/results?search_query=${Uri.encode(query)}"))
        if (launch(play) || launch(yt)) promise.resolve(true)
        else promise.reject("NO_MUSIC_APP", "No music app found")
    }

    @ReactMethod
    fun setFlashlight(on: Boolean, promise: Promise) {
        try {
            val cm = rc.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val id = cm.cameraIdList.firstOrNull {
                cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
            if (id == null) { promise.reject("NO_FLASH", "No flashlight on this device"); return }
            cm.setTorchMode(id, on)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FLASH_FAILED", e.message, e)
        }
    }

    // ======================================================== FULL PHONE CONTROL
    // Everything below needs the Nimah Accessibility Service to be switched on.

    private fun a11y(promise: Promise): NimahAccessibilityService? {
        val s = NimahAccessibilityService.instance
        if (s == null) promise.reject("A11Y_NOT_ENABLED", "Nimah accessibility service is not enabled")
        return s
    }

    /** Reads the screen: {package, text, count, width, height}. */
    @ReactMethod
    fun screenRead(promise: Promise) {
        val s = a11y(promise) ?: return
        Thread {
            try {
                val snap = s.snapshot()
                promise.resolve(Arguments.createMap().apply {
                    putString("package", snap.pkg); putString("text", snap.text)
                    putInt("count", snap.count); putInt("width", snap.width); putInt("height", snap.height)
                })
            } catch (e: Exception) { promise.reject("SCREEN_FAILED", e.message, e) }
        }.start()
    }

    /** base64 JPEG of the screen, or null (Android < 11 / blocked window). */
    @ReactMethod
    fun screenshot(promise: Promise) {
        val s = a11y(promise) ?: return
        main.post { s.screenshotBase64 { promise.resolve(it) } }
    }

    @ReactMethod
    fun uiClick(id: Int, long: Boolean, promise: Promise) {
        val s = a11y(promise) ?: return
        Thread { promise.resolve(s.clickNode(id, long)) }.start()
    }

    /** id = -1 -> the currently focused input. */
    @ReactMethod
    fun uiType(id: Int, text: String, submit: Boolean, promise: Promise) {
        val s = a11y(promise) ?: return
        Thread { promise.resolve(s.setText(if (id >= 0) id else null, text, submit)) }.start()
    }

    /** id = -1 -> first scrollable area. direction: up | down | left | right (where the content should go). */
    @ReactMethod
    fun uiScroll(direction: String, id: Int, promise: Promise) {
        val s = a11y(promise) ?: return
        Thread { promise.resolve(s.scroll(direction, if (id >= 0) id else null)) }.start()
    }

    @ReactMethod
    fun uiGesture(x1: Double, y1: Double, x2: Double, y2: Double, durationMs: Int, promise: Promise) {
        val s = a11y(promise) ?: return
        Thread { promise.resolve(s.gesture(x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), durationMs.toLong())) }.start()
    }

    /** back | home | recents | notifications | quick_settings | power_menu | lock_screen | take_screenshot */
    @ReactMethod
    fun uiGlobal(name: String, promise: Promise) {
        val s = a11y(promise) ?: return
        promise.resolve(s.global(name))
    }

    /** Resolves when the UI has been quiet for [quietMs] (or after [timeoutMs]). */
    @ReactMethod
    fun waitForIdle(quietMs: Int, timeoutMs: Int, promise: Promise) {
        Thread {
            val end = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < end) {
                if (System.currentTimeMillis() - NimahAccessibilityService.lastEventAt >= quietMs) break
                try { Thread.sleep(60) } catch (e: InterruptedException) { break }
            }
            promise.resolve(true)
        }.start()
    }

    /** Emergency stop (Volume Down held + Volume Up). Returns true once, then resets. */
    @ReactMethod
    fun consumeStopRequest(promise: Promise) {
        val v = NimahAccessibilityService.stopRequested
        NimahAccessibilityService.stopRequested = false
        promise.resolve(v)
    }

    // ------------------------------------------------------------ system helpers
    /** level 0..100 on the music stream (or "ring"/"alarm"). */
    @ReactMethod
    fun setVolume(percent: Int, stream: String, promise: Promise) {
        try {
            val am = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val type = when (stream) {
                "ring" -> AudioManager.STREAM_RING
                "alarm" -> AudioManager.STREAM_ALARM
                "call" -> AudioManager.STREAM_VOICE_CALL
                else -> AudioManager.STREAM_MUSIC
            }
            val max = am.getStreamMaxVolume(type)
            am.setStreamVolume(type, (percent.coerceIn(0, 100) * max / 100), AudioManager.FLAG_SHOW_UI)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("VOLUME_FAILED", e.message, e) }
    }

    /** {time, date, battery, charging, musicVolume} — lets the AI answer "what time is it?" etc. */
    @ReactMethod
    fun deviceInfo(promise: Promise) {
        try {
            val bm = rc.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            val am = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val now = java.util.Calendar.getInstance()
            promise.resolve(Arguments.createMap().apply {
                putString("time", java.text.SimpleDateFormat("h:mm a", Locale.US).format(now.time))
                putString("date", java.text.SimpleDateFormat("EEEE, d MMMM yyyy", Locale.US).format(now.time))
                putInt("battery", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
                putBoolean("charging", bm.isCharging)
                putInt("musicVolume", am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 /
                    am.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            })
        } catch (e: Exception) { promise.reject("INFO_FAILED", e.message, e) }
    }

    @ReactMethod
    fun openUrl(url: String, promise: Promise) {
        val u = if (url.startsWith("http://") || url.startsWith("https://")) url else "https://$url"
        if (launch(Intent(Intent.ACTION_VIEW, Uri.parse(u)))) promise.resolve(true)
        else promise.reject("NO_BROWSER", "No browser found")
    }

    /** page: wifi | bluetooth | display | sound | battery | apps | location | airplane | data | storage | date | accessibility | main */
    @ReactMethod
    fun openSettings(page: String, promise: Promise) {
        val action = when (page) {
            "wifi" -> Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "display" -> Settings.ACTION_DISPLAY_SETTINGS
            "sound" -> Settings.ACTION_SOUND_SETTINGS
            "battery" -> Intent.ACTION_POWER_USAGE_SUMMARY
            "apps" -> Settings.ACTION_APPLICATION_SETTINGS
            "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
            "airplane" -> Settings.ACTION_AIRPLANE_MODE_SETTINGS
            "data" -> Settings.ACTION_DATA_ROAMING_SETTINGS
            "storage" -> Settings.ACTION_INTERNAL_STORAGE_SETTINGS
            "date" -> Settings.ACTION_DATE_SETTINGS
            "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        if (launch(Intent(action))) promise.resolve(true) else promise.reject("NO_SETTINGS", "Cannot open settings")
    }

    // ------------------------------------------------------------ notifications
    @ReactMethod
    fun isNotificationAccessEnabled(promise: Promise) { promise.resolve(NimahNotificationService.isEnabled(rc)) }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        if (launch(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))) promise.resolve(true)
        else promise.reject("NO_SETTINGS", "Cannot open settings")
    }

    /** [{key, app, title, text}] — newest first as reported by Android. */
    @ReactMethod
    fun getNotifications(promise: Promise) {
        val svc = NimahNotificationService.instance
        if (svc == null) { promise.reject("NOTIF_NOT_ENABLED", "Notification access is not enabled"); return }
        val out = Arguments.createArray()
        svc.current().forEach {
            out.pushMap(Arguments.createMap().apply {
                putString("key", it.key); putString("app", it.app)
                putString("title", it.title); putString("text", it.text)
            })
        }
        promise.resolve(out)
    }

    @ReactMethod
    fun dismissNotification(key: String, promise: Promise) {
        val svc = NimahNotificationService.instance
        if (svc == null) { promise.reject("NOTIF_NOT_ENABLED", "Notification access is not enabled"); return }
        svc.cancelNotification(key); promise.resolve(true)
    }

    // -------------------------------------------------------- background mode
    @ReactMethod
    fun startBackgroundService(promise: Promise) {
        try {
            ContextCompat.startForegroundService(rc, Intent(rc, NimahService::class.java))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("SERVICE_FAILED", e.message, e) }
    }

    @ReactMethod
    fun stopBackgroundService(promise: Promise) {
        rc.stopService(Intent(rc, NimahService::class.java)); promise.resolve(true)
    }

    // --------------------------------------------------------------- lifecycle
    override fun invalidate() {
        main.post { recognizer?.destroy(); recognizer = null }
        tts?.stop(); tts?.shutdown(); tts = null
        super.invalidate()
    }
}
