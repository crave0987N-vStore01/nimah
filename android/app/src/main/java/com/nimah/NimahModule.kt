package com.nimah

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.SearchManager
import android.app.KeyguardManager
import android.app.NotificationManager
import android.location.LocationManager
import android.os.PowerManager
import android.telecom.TelecomManager
import android.view.KeyEvent
import android.bluetooth.BluetoothManager
import android.net.wifi.WifiManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import android.media.AudioAttributes
import android.media.AudioFocusRequest
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
    @Volatile private var speakGen = 0
    @Volatile private var lastUtteranceId = ""
    private var focusRequest: AudioFocusRequest? = null
    private var lastRmsEmit = 0L
    private var capture: VoiceCapture? = null   // parallel owner-voice capture while the recogniser runs

    init {
        tts = TextToSpeech(rc, this)
        NimahService.onUserStop = { emit("NimahServiceStopped") }
        CallState.onChange = { state, number, name ->
            emit("NimahCall", Arguments.createMap().apply { putString("state", state); putString("number", number); putString("name", name) })
        }
        NimahNotificationService.onMessage = { item, pkg, canReply, locked ->
            emit("NimahMessage", Arguments.createMap().apply {
                putString("key", item.key); putString("app", item.app); putString("pkg", pkg)
                putString("sender", item.title); putString("text", item.text)
                putBoolean("locked", locked); putBoolean("canReply", canReply)
            })
        }
    }

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

    // Required by NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ---------------------------------------------------------- speech-to-text
    @ReactMethod
    fun startListening(locale: String, promise: Promise) = beginListening(locale, false, false, "", promise)

    /**
     * [preferOffline] asks Android for its on-device speech pack; [extraLocale] lets the recogniser also hear a
     * second language; [voiceCheck] records the same audio in parallel and scores it against the owner's voiceprint
     * (needs the OS to allow two recorders — device test needed).
     */
    @ReactMethod
    fun startListeningEx(locale: String, preferOffline: Boolean, voiceCheck: Boolean, extraLocale: String, promise: Promise) =
        beginListening(locale, preferOffline, voiceCheck, extraLocale, promise)

    private fun beginListening(locale: String, preferOffline: Boolean, voiceCheck: Boolean, extraLocale: String, promise: Promise) {
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
                capture?.stop(); capture = null
                if (voiceCheck && VoicePrint.isEnrolled(rc)) {
                    val c = VoiceCapture(12)
                    capture = if (c.start()) c else null
                }
                recognizer = SpeechRecognizer.createSpeechRecognizer(rc).apply {
                    setRecognitionListener(listener)
                }
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, rc.packageName)
                    if (preferOffline) putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                    if (extraLocale.isNotEmpty()) putExtra("android.speech.extra.ADDITIONAL_LANGUAGES", arrayOf(extraLocale))
                }
                recognizer?.startListening(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                capture?.stop(); capture = null
                promise.reject("START_FAILED", e.message, e)
            }
        }
    }

    /** Stop capturing audio and deliver the final result. */
    @ReactMethod
    fun stopListening(promise: Promise) { main.post { recognizer?.stopListening(); promise.resolve(true) } }

    /** Abort silently — no result/error events are emitted. */
    @ReactMethod
    fun cancelListening(promise: Promise) { main.post { recognizer?.cancel(); capture?.stop(); capture = null; promise.resolve(true) } }

    private val listener = object : RecognitionListener {
        override fun onResults(results: Bundle?) {
            val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
            val conf = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
            val pcm = capture?.stop()
            capture = null
            fun send(score: Double?) {
                emit("NimahSpeechResult", Arguments.createMap().apply {
                    putString("text", texts.firstOrNull().orEmpty())
                    putArray("alternatives", Arguments.createArray().apply { texts.forEach { pushString(it) } })
                    if (conf != null) putArray("confidences", Arguments.createArray().apply { conf.forEach { pushDouble(it.toDouble()) } })
                    if (score != null) putDouble("voiceScore", score)
                })
            }
            if (pcm != null) Thread { send(VoicePrint.score(rc, pcm)) }.start() else send(null)
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
            capture?.stop(); capture = null
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
        if (!ttsReady) return
        try {
            tts?.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
            )
        } catch (_: Exception) {}
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { if (id != null && id == lastUtteranceId) finishSpeak(id) }
            @Deprecated("Deprecated in Java") override fun onError(id: String?) { finishSpeak(id) }
            override fun onStop(id: String?, interrupted: Boolean) { finishSpeak(id) }
        })
    }

    /** Ids look like "nimah-<generation>-<chunk>"; callbacks from an older generation are ignored. */
    private fun finishSpeak(id: String?) {
        val gen = id?.split("-")?.getOrNull(1)?.toIntOrNull() ?: return
        if (gen != speakGen) return
        resolveSpeak()
    }

    private fun resolveSpeak() {
        pendingSpeak?.resolve(true); pendingSpeak = null
        abandonFocus()
    }

    private fun requestFocus() {
        try {
            val am = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val r = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
                    ).build()
                focusRequest = r
                am.requestAudioFocus(r)
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
        } catch (_: Exception) {}
    }

    private fun abandonFocus() {
        try {
            val am = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { am.abandonAudioFocusRequest(it) }
                focusRequest = null
            } else {
                @Suppress("DEPRECATION") am.abandonAudioFocus(null)
            }
        } catch (_: Exception) {}
    }

    /** Lists the voices the installed TTS engine reports. JS decides which one is "male-sounding". */
    @ReactMethod
    fun getVoices(promise: Promise) {
        if (!ttsReady) { promise.reject("TTS_NOT_READY", "Text-to-speech not initialised"); return }
        try {
            val out = Arguments.createArray()
            for (v in (tts?.voices ?: emptySet<android.speech.tts.Voice>())) {
                val m = Arguments.createMap()
                m.putString("name", v.name)
                m.putString("locale", v.locale?.toLanguageTag() ?: "")
                m.putInt("quality", v.quality)
                m.putInt("latency", v.latency)
                m.putBoolean("requiresNetwork", v.isNetworkConnectionRequired)
                m.putBoolean("installed", v.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) != true)
                out.pushMap(m)
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("VOICES_ERROR", e.message ?: "Could not list voices")
        }
    }

    /**
     * Speaks [text] (split into sentence chunks). Resolves when the LAST chunk finishes, or when
     * speech is stopped/replaced. [voiceName] "" = engine default for [locale].
     */
    @ReactMethod
    fun speak(text: String, locale: String, rate: Double, pitch: Double, voiceName: String, promise: Promise) {
        if (!ttsReady) { promise.reject("TTS_NOT_READY", "Text-to-speech not initialised"); return }
        val engine = tts ?: run { promise.reject("TTS_NOT_READY", "Text-to-speech not initialised"); return }
        val clean = text.trim()
        if (clean.isEmpty()) { promise.resolve(true); return }

        // Replace whatever is playing: bump the generation so old callbacks are ignored.
        pendingSpeak?.resolve(true); pendingSpeak = null
        speakGen += 1
        val gen = speakGen
        pendingSpeak = promise

        try {
            val localeObj = Locale.forLanguageTag(locale)
            val langResult = engine.setLanguage(localeObj)
            // Language pack missing (e.g. Sinhala voice not installed) -> fall back to English.
            if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                engine.setLanguage(Locale.US)
            }
            // setLanguage() resets the voice, so choose the voice AFTER it.
            if (voiceName.isNotEmpty()) {
                engine.voices?.firstOrNull { it.name == voiceName }?.let { engine.voice = it }
            }
            engine.setPitch(pitch.toFloat().coerceIn(0.5f, 1.5f))
            engine.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2.0f))

            val max = TextToSpeech.getMaxSpeechInputLength() - 100
            val chunks = clean.split(Regex("(?<=[.!?।])\\s+"))
                .flatMap { it.chunked(max) }.filter { it.isNotBlank() }
            lastUtteranceId = "nimah-$gen-${chunks.size - 1}"
            requestFocus()
            chunks.forEachIndexed { i, c ->
                val mode = if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
                val r = engine.speak(c, mode, null, "nimah-$gen-$i")
                if (r == TextToSpeech.ERROR) { resolveSpeak(); return }
                if (i < chunks.size - 1) engine.playSilentUtterance(150, TextToSpeech.QUEUE_ADD, "nimah-$gen-p$i")
            }
        } catch (e: Exception) {
            resolveSpeak()
            return
        }
    }

    @ReactMethod
    fun stopSpeaking(promise: Promise) { tts?.stop(); resolveSpeak(); promise.resolve(true) }

    // ------------------------------------------------------ encrypted storage
    @ReactMethod fun secureSet(name: String, value: String, promise: Promise) {
        try { SecureStore.put(rc, name, value); promise.resolve(true) }
        catch (e: Exception) { promise.reject("SECURE_STORE_ERROR", "Could not save securely") }
    }
    @ReactMethod fun secureGet(name: String, promise: Promise) { promise.resolve(SecureStore.get(rc, name)) }
    @ReactMethod fun secureRemove(name: String, promise: Promise) { SecureStore.remove(rc, name); promise.resolve(true) }

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

    // ------------------------------------------------------------------ OCR
    /** On-device OCR of the current screen: [{text, x, y, w, h}] in screen pixels (Latin script only). */
    @ReactMethod
    fun ocrScreen(promise: Promise) {
        val s = a11y(promise) ?: return
        main.post {
            s.screenshotBitmap { bmp ->
                if (bmp == null) { promise.resolve(Arguments.createArray()); return@screenshotBitmap }
                NimahOcr.recognize(bmp) { lines ->
                    bmp.recycle()
                    promise.resolve(Arguments.createArray().apply {
                        lines?.forEach { l ->
                            pushMap(Arguments.createMap().apply {
                                putString("text", l.text); putInt("x", l.x); putInt("y", l.y); putInt("w", l.w); putInt("h", l.h)
                            })
                        }
                    })
                }
            }
        }
    }

    // ------------------------------------------------ hardware: Wi-Fi / Bluetooth / brightness
    private fun waitUntil(ms: Long, cond: () -> Boolean): Boolean {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) { if (cond()) return true; try { Thread.sleep(200) } catch (e: InterruptedException) { break } }
        return cond()
    }

    /**
     * Android 10+ forbids apps from flipping Wi-Fi / Bluetooth directly. Opens the system screen and flips
     * the switch with the Accessibility service. Returns done | already | needs_accessibility | failed.
     */
    private fun toggleViaSettings(action: String, keywords: List<String>, on: Boolean, isOn: (() -> Boolean)?): String {
        val s = NimahAccessibilityService.instance ?: return "needs_accessibility"
        if (!launch(Intent(action))) return "failed"
        val t0 = System.currentTimeMillis()
        while (System.currentTimeMillis() - t0 < 2500) {
            if (System.currentTimeMillis() - NimahAccessibilityService.lastEventAt >= 450) break
            try { Thread.sleep(80) } catch (e: InterruptedException) { break }
        }
        var res = s.toggleSwitch(keywords, on)
        if (res == "failed") { try { Thread.sleep(900) } catch (e: InterruptedException) {}; res = s.toggleSwitch(keywords, on) }
        val reached = res != "failed" && (isOn == null || waitUntil(3000) { isOn() == on })
        s.global("back")
        return when { res == "failed" -> "failed"; reached -> "done"; else -> "failed" }
    }

    @ReactMethod
    fun setWifi(on: Boolean, promise: Promise) {
        Thread {
            try {
                val wm = rc.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                if (wm.isWifiEnabled == on) { promise.resolve("already"); return@Thread }
                @Suppress("DEPRECATION")
                if (Build.VERSION.SDK_INT < 29 && wm.setWifiEnabled(on)) { promise.resolve("done"); return@Thread }
                val action = if (Build.VERSION.SDK_INT >= 30) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
                promise.resolve(toggleViaSettings(action, listOf("wi-fi", "wifi", "internet"), on) { wm.isWifiEnabled })
            } catch (e: Exception) { promise.reject("WIFI_FAILED", e.message, e) }
        }.start()
    }

    @ReactMethod
    fun setBluetooth(on: Boolean, promise: Promise) {
        Thread {
            try {
                val adapter = (rc.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
                if (adapter == null) { promise.resolve("failed"); return@Thread }
                if (adapter.isEnabled == on) { promise.resolve("already"); return@Thread }
                // Direct enable()/disable() still works on Android 12 and below (needs BLUETOOTH_CONNECT on 12).
                var direct = false
                if (Build.VERSION.SDK_INT < 33 && (Build.VERSION.SDK_INT < 31 || granted(Manifest.permission.BLUETOOTH_CONNECT))) {
                    try {
                        @Suppress("DEPRECATION")
                        direct = if (on) adapter.enable() else adapter.disable()
                    } catch (e: SecurityException) { direct = false }
                }
                if (direct && waitUntil(4000) { adapter.isEnabled == on }) { promise.resolve("done"); return@Thread }
                promise.resolve(toggleViaSettings(Settings.ACTION_BLUETOOTH_SETTINGS, listOf("bluetooth"), on) { adapter.isEnabled })
            } catch (e: Exception) { promise.reject("BT_FAILED", e.message, e) }
        }.start()
    }

    @ReactMethod
    fun getBrightness(promise: Promise) {
        try {
            val v = Settings.System.getInt(rc.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128)
            promise.resolve(v * 100 / 255)
        } catch (e: Exception) { promise.reject("BRIGHTNESS_FAILED", e.message, e) }
    }

    /** Needs "Modify system settings" (Settings.System.canWrite). Resolves done | needs_permission. */
    @ReactMethod
    fun setBrightness(percent: Int, promise: Promise) {
        try {
            if (!Settings.System.canWrite(rc)) { promise.resolve("needs_permission"); return }
            Settings.System.putInt(rc.contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
            Settings.System.putInt(rc.contentResolver, Settings.System.SCREEN_BRIGHTNESS, percent.coerceIn(1, 100) * 255 / 100)
            promise.resolve("done")
        } catch (e: Exception) { promise.reject("BRIGHTNESS_FAILED", e.message, e) }
    }

    @ReactMethod
    fun openWriteSettings(promise: Promise) {
        val i = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + rc.packageName))
        if (launch(i)) promise.resolve(true) else promise.reject("NO_SETTINGS", "Cannot open settings")
    }

    // ------------------------------------------------ calls
    @ReactMethod
    fun answerCall(promise: Promise) {
        try {
            if (!granted(Manifest.permission.ANSWER_PHONE_CALLS)) { promise.resolve(false); return }
            (rc.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).acceptRingingCall()
            promise.resolve(true)
        } catch (e: Exception) { promise.resolve(false) }
    }

    @ReactMethod
    fun endCall(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < 28 || !granted(Manifest.permission.ANSWER_PHONE_CALLS)) { promise.resolve(false); return }
            promise.resolve((rc.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).endCall())
        } catch (e: Exception) { promise.resolve(false) }
    }

    @ReactMethod
    fun setSpeaker(on: Boolean, promise: Promise) {
        try {
            val am = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = on
            @Suppress("DEPRECATION")
            promise.resolve(am.isSpeakerphoneOn == on)
        } catch (e: Exception) { promise.resolve(false) }
    }

    @ReactMethod
    fun setMute(on: Boolean, promise: Promise) {
        try {
            (rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager).isMicrophoneMute = on
            promise.resolve(true)
        } catch (e: Exception) { promise.resolve(false) }
    }

    // ------------------------------------------------ media keys / volume
    @ReactMethod
    fun mediaKey(name: String, promise: Promise) {
        try {
            val am = rc.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            when (name) {
                "volume_up" -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
                "volume_down" -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
                "mute" -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
                "unmute" -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI)
                else -> {
                    val code = when (name) {
                        "play" -> KeyEvent.KEYCODE_MEDIA_PLAY; "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
                        "next" -> KeyEvent.KEYCODE_MEDIA_NEXT; "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
                        "stop" -> KeyEvent.KEYCODE_MEDIA_STOP; else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                    }
                    am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
                    am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
                }
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.resolve(false) }
    }

    // ------------------------------------------------ camera / alarm / screen wake / location
    @ReactMethod
    fun openCamera(mode: String, promise: Promise) {
        val action = if (mode == "video") MediaStore.INTENT_ACTION_VIDEO_CAMERA else MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA
        promise.resolve(launch(Intent(action)))
    }

    /** action: dismiss | snooze. Uses the clock app's public alarm intents. */
    @ReactMethod
    fun alarmControl(action: String, minutes: Int, promise: Promise) {
        val i = if (action == "snooze")
            Intent(AlarmClock.ACTION_SNOOZE_ALARM).putExtra(AlarmClock.EXTRA_ALARM_SNOOZE_DURATION, minutes)
        else Intent(AlarmClock.ACTION_DISMISS_ALARM).putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_NEXT)
        promise.resolve(try { launch(i) } catch (e: Exception) { false })
    }

    /** Turns the screen on (it does NOT unlock the phone). */
    @ReactMethod
    fun wakeScreen(promise: Promise) {
        try {
            val pm = rc.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isInteractive) {
                @Suppress("DEPRECATION")
                val wl = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE, "nimah:wake")
                wl.acquire(4000)
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.resolve(false) }
    }

    /** Last known location {lat, lng} or null (needs ACCESS_FINE_LOCATION). */
    @ReactMethod
    fun getLocation(promise: Promise) {
        try {
            if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) { promise.resolve(null); return }
            val lm = rc.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            var best: android.location.Location? = null
            for (p in lm.getProviders(true)) {
                val l = try { lm.getLastKnownLocation(p) } catch (e: SecurityException) { null } ?: continue
                if (best == null || l.time > best.time) best = l
            }
            if (best == null) { promise.resolve(null); return }
            promise.resolve(Arguments.createMap().apply { putDouble("lat", best.latitude); putDouble("lng", best.longitude) })
        } catch (e: Exception) { promise.resolve(null) }
    }

    // ------------------------------------------------ numbered overlay
    @ReactMethod
    fun showNumbers(promise: Promise) {
        val s = a11y(promise) ?: return
        Thread { try { promise.resolve(s.showNumbers()) } catch (e: Exception) { promise.reject("OVERLAY_FAILED", e.message, e) } }.start()
    }

    @ReactMethod
    fun hideNumbers(promise: Promise) { NimahAccessibilityService.instance?.hideNumbers(); promise.resolve(true) }

    @ReactMethod
    fun tapNumber(n: Int, long: Boolean, promise: Promise) {
        val s = a11y(promise) ?: return
        Thread { promise.resolve(s.clickNode(n, long)) }.start()
    }

    // ------------------------------------------------ more toggles
    /** kind: airplane | dnd | hotspot | location | rotate | mobiledata. Resolves done | already | needs_permission | needs_accessibility | failed. */
    @ReactMethod
    fun setToggle(kind: String, on: Boolean, promise: Promise) {
        Thread {
            try {
                when (kind) {
                    "rotate" -> {
                        if (!Settings.System.canWrite(rc)) { promise.resolve("needs_permission"); return@Thread }
                        Settings.System.putInt(rc.contentResolver, Settings.System.ACCELEROMETER_ROTATION, if (on) 1 else 0)
                        promise.resolve("done")
                    }
                    "dnd" -> {
                        val nm = rc.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                        if (!nm.isNotificationPolicyAccessGranted) {
                            launch(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)); promise.resolve("needs_permission"); return@Thread
                        }
                        nm.setInterruptionFilter(if (on) NotificationManager.INTERRUPTION_FILTER_PRIORITY else NotificationManager.INTERRUPTION_FILTER_ALL)
                        promise.resolve("done")
                    }
                    "airplane" -> promise.resolve(toggleViaSettings(Settings.ACTION_AIRPLANE_MODE_SETTINGS, listOf("airplane", "flight"), on) {
                        Settings.Global.getInt(rc.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1 })
                    "location" -> {
                        val lm = rc.getSystemService(Context.LOCATION_SERVICE) as LocationManager
                        promise.resolve(toggleViaSettings(Settings.ACTION_LOCATION_SOURCE_SETTINGS, listOf("location"), on) {
                            if (Build.VERSION.SDK_INT >= 28) lm.isLocationEnabled else lm.isProviderEnabled(LocationManager.GPS_PROVIDER) })
                    }
                    "hotspot" -> promise.resolve(toggleViaSettings("android.settings.TETHER_SETTINGS", listOf("hotspot", "tethering"), on, null))
                    "mobiledata" -> {
                        val action = if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_DATA_ROAMING_SETTINGS
                        promise.resolve(toggleViaSettings(action, listOf("mobile data", "mobile network", "cellular"), on, null))
                    }
                    else -> promise.resolve("failed")
                }
            } catch (e: Exception) { promise.reject("TOGGLE_FAILED", e.message, e) }
        }.start()
    }

    // ------------------------------------------------ reply to a notification
    @ReactMethod
    fun replyNotification(key: String, text: String, promise: Promise) {
        promise.resolve(NimahNotificationService.instance?.reply(key, text) ?: false)
    }

    // ------------------------------------------------ voice lock (on-device voiceprint)
    @ReactMethod fun voiceIsEnrolled(promise: Promise) { promise.resolve(VoicePrint.isEnrolled(rc)) }
    @ReactMethod fun voiceEnrollReset(promise: Promise) { VoicePrint.reset(); promise.resolve(true) }
    @ReactMethod fun voiceDelete(promise: Promise) { VoicePrint.delete(rc); promise.resolve(true) }
    @ReactMethod fun voiceEnrollFinish(promise: Promise) { promise.resolve(VoicePrint.finish(rc)) }

    /** Records [seconds] of the owner's voice (JS stops the recogniser first). Audio stays in memory only. */
    @ReactMethod
    fun voiceEnrollSample(seconds: Int, promise: Promise) {
        if (!granted(Manifest.permission.RECORD_AUDIO)) { promise.reject("NO_MIC_PERMISSION", "Microphone permission not granted"); return }
        Thread {
            val cap = VoiceCapture(seconds.coerceIn(1, 8))
            if (!cap.start()) { promise.reject("NO_AUDIO", "Could not open the microphone"); return@Thread }
            try { Thread.sleep(seconds.coerceIn(1, 8) * 1000L) } catch (e: InterruptedException) {}
            val n = VoicePrint.addSample(cap.stop())
            promise.resolve(Arguments.createMap().apply { putInt("voicedFrames", n); putInt("totalVoiced", VoicePrint.total()) })
        }.start()
    }

    /** Records [seconds] and returns the similarity to the enrolled voice (-1 = no voiceprint / not enough speech). */
    @ReactMethod
    fun voiceTest(seconds: Int, promise: Promise) {
        if (!granted(Manifest.permission.RECORD_AUDIO)) { promise.reject("NO_MIC_PERMISSION", "Microphone permission not granted"); return }
        Thread {
            val cap = VoiceCapture(seconds.coerceIn(1, 8))
            if (!cap.start()) { promise.reject("NO_AUDIO", "Could not open the microphone"); return@Thread }
            try { Thread.sleep(seconds.coerceIn(1, 8) * 1000L) } catch (e: InterruptedException) {}
            val score = VoicePrint.score(rc, cap.stop())
            promise.resolve(Arguments.createMap().apply { putDouble("score", score) })
        }.start()
    }

    /** Fingerprint / face / PIN. Resolves ok | failed | cancelled | unavailable (e.g. Nimah is not in front). */
    @ReactMethod
    fun authenticate(reason: String, promise: Promise) {
        val act = rc.currentActivity as? FragmentActivity
        if (act == null || !act.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) { promise.resolve("unavailable"); return }
        main.post {
            try {
                val authenticators = if (Build.VERSION.SDK_INT >= 30)
                    BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                else BiometricManager.Authenticators.BIOMETRIC_WEAK
                if (BiometricManager.from(rc).canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
                    promise.resolve("unavailable"); return@post
                }
                var settled = false
                val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(rc), object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        if (!settled) { settled = true; promise.resolve("ok") }
                    }
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (settled) return
                        settled = true
                        promise.resolve(
                            if (errorCode == BiometricPrompt.ERROR_USER_CANCELED || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                                errorCode == BiometricPrompt.ERROR_CANCELED) "cancelled" else "failed")
                    }
                })
                val info = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Nimah")
                    .setSubtitle(reason)
                    .setAllowedAuthenticators(authenticators)
                if (Build.VERSION.SDK_INT < 30) info.setNegativeButtonText("Cancel")
                prompt.authenticate(info.build())
            } catch (e: Exception) { promise.resolve("unavailable") }
        }
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
            "tts" -> "com.android.settings.TTS_SETTINGS"
            else -> Settings.ACTION_SETTINGS
        }
        if (launch(Intent(action))) promise.resolve(true) else promise.reject("NO_SETTINGS", "Cannot open settings")
    }

    // ------------------------------------------------------------ reminders
    private fun reminderIntent(id: String, title: String, text: String): PendingIntent {
        val i = Intent(rc, ReminderReceiver::class.java).setAction("com.nimah.REMINDER.$id")
            .putExtra(ReminderReceiver.EXTRA_TITLE, title).putExtra(ReminderReceiver.EXTRA_TEXT, text)
        return PendingIntent.getBroadcast(rc, id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Local notification at [atMillis] (inexact, battery friendly; needs no special permission). Lost after a phone reboot. */
    @ReactMethod
    fun scheduleReminder(id: String, atMillis: Double, text: String, promise: Promise) {
        try {
            val am = rc.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis.toLong(), reminderIntent(id, "Nimah reminder", text))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("REMINDER_FAILED", e.message) }
    }

    @ReactMethod
    fun cancelReminder(id: String, promise: Promise) {
        try {
            val am = rc.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(reminderIntent(id, "Nimah reminder", ""))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("REMINDER_FAILED", e.message) }
    }

    /** Opt-in daily "good morning" notification. */
    @ReactMethod
    fun scheduleDailyBriefing(hour: Int, minute: Int, promise: Promise) {
        try {
            val cal = java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, hour); set(java.util.Calendar.MINUTE, minute)
                set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) add(java.util.Calendar.DAY_OF_YEAR, 1)
            }
            val am = rc.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.timeInMillis, AlarmManager.INTERVAL_DAY,
                reminderIntent("daily", "Good morning, sir", "Tap to hear your briefing: say \"briefing\"."))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("REMINDER_FAILED", e.message) }
    }

    @ReactMethod
    fun cancelDailyBriefing(promise: Promise) {
        try {
            val am = rc.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(reminderIntent("daily", "", ""))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("REMINDER_FAILED", e.message) }
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
        NimahService.onUserStop = null
        CallState.onChange = null
        NimahNotificationService.onMessage = null
        main.post { recognizer?.destroy(); recognizer = null }
        tts?.stop(); tts?.shutdown(); tts = null
        super.invalidate()
    }
}
