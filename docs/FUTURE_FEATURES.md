# Nimah AI — Future features roadmap

L. ADVANCED FEATURES (ඉදිරි විශේෂාංග) — implement after A–K are stable. Each must be real, opt-in, and honestly documented in `docs/CAPABILITIES.md`.

L1. NATURAL CONVERSATIONAL FLOW (ස්වභාවික සංවාද හැකියාව)
- Continuous multi-turn dialogue: follow-up questions ("ඒක ආයෙ කියන්න", "ඊට පස්සේ?") resolve against conversation context; pronoun/reference handling; clarifying questions only when truly needed.
- Barge-in: user can interrupt while Nimah is speaking (stop TTS immediately, start listening). Short natural acknowledgements ("හරි සර්", "Okay sir"), varied phrasing (no repeated canned lines), short spoken answers with option to "tell me more".
- Mixed Sinhala / English / Singlish input understood; reply in the language the user used last; remember user preferences (name "සර්", tone, language) in local memory the user can view/edit/delete.
- Handle speech-recognition errors gracefully (ask "ඒක නැවත කියන්න" instead of failing).

L2. APP & UI AUTOMATION (මෘදුකාංග සහ යෙදුම් ස්වයංක්‍රීයව පාලනය)
- Build on the existing AccessibilityService agent (tap/type/scroll/back/home/open app). Add reliable multi-step task execution with step preview, live progress, "Stop" at any time (volume-key / notification / on-screen), max-step limit, retry on UI change.
- Reusable user-defined routines/macros ("Good morning": open X, set Y) that the user creates, edits, deletes and runs by voice.
- Safety: ALWAYS ask explicit confirmation before payments, deleting data, sending messages/emails, installing/uninstalling, changing security settings; never act in banking/password screens; never enter passwords; show an on-screen "Nimah is controlling the phone" indicator; AccessibilityService strictly opt-in with clear explanation (Google Play policy compliant wording).

L3. SCREEN UNDERSTANDING & OCR (බුද්ධිමත්ව තිරය කියවීම සහ සැකසීම)
- "What's on my screen?" — read the current screen using AccessibilityService node text first (fast, private), fall back to a user-approved screenshot (MediaProjection consent dialog each time) + on-device OCR (Google ML Kit Text Recognition; note: ML Kit does NOT support Sinhala script — document this and use Gemini vision with the user's explicit consent for Sinhala/complex images).
- Capabilities: read screen aloud, summarize screen, extract phone numbers/emails/URLs/dates, copy text, translate screen text, explain an error dialog, camera/gallery image OCR, fill text field from OCR result.
- Privacy: no screenshots/screen text stored or uploaded unless the user explicitly asks; show a clear indicator and ask before sending image data to any cloud AI.

L4. OFFLINE CAPABILITY (නොබැඳිව ක්‍රියාත්මක වීම)
- Detect connectivity; automatically switch to offline mode with a visible badge.
- Offline features that must work with NO internet: calculator/unit/date utilities, notes/tasks/reminders/timers/alarms, contacts calling, opening apps/settings, flashlight/volume, WhatsApp draft preview, local conversation history, TTS with installed voices, and speech recognition using Android's offline language packs where installed (guide the user to download packs; check `SpeechRecognizer.isOnDeviceRecognitionAvailable` / `EXTRA_PREFER_OFFLINE`).
- Rule-based local intent parser for common commands (Sinhala + English) so basic commands don't need Gemini.
- Optional on-device LLM (user-downloaded small model via MediaPipe LLM Inference / Gemma, or Gemini Nano via AICore where the device supports it). Must be optional, show model size before download, be deletable, and never be bundled in the APK. Document honestly that quality in Sinhala is limited.
- Queue online-only requests and offer to retry when the connection returns.

L5. VOICE BIOMETRICS & SECURITY (හඬින් අනන්‍යතාව හඳුනා ගැනීම)
- Optional "Voice lock": user enrolls their voice (several phrases, on-device only); verification uses an on-device speaker-embedding model (e.g. a small TFLite/ONNX speaker-verification model) with cosine-similarity threshold. Embeddings stored encrypted (Android Keystore via SecureStore), never uploaded, deletable at any time.
- HONEST LIMITS (must be shown in-app and in docs): Android has no built-in speaker-verification API; voice matching can be spoofed by recordings/deepfakes and is less reliable in noise. Therefore voice match may only act as a convenience/"soft" factor — sensitive actions (payments, sending messages, deleting data, changing security settings) additionally require device unlock (BiometricPrompt fingerprint/face or PIN) or explicit on-screen confirmation.
- Also: app lock with BiometricPrompt, "private mode" (no history saved), auto-lock timeout, hide notification content, panic "Stop everything" action, security/permission audit screen.
- Show False Accept / False Reject tuning (sensitivity slider) and a test screen. Never claim it is "secure authentication".

L6. PROACTIVE ASSISTANT (ක්‍රියාශීලී පුද්ගලික සහායකයා)
- Opt-in, user-controlled, local-first. Use WorkManager / AlarmManager (handle exact-alarm permission) / geofence-free logic; no hidden data collection.
- Features: morning briefing (date, weather if online, today's calendar events with READ_CALENDAR permission asked only when enabled, pending tasks/reminders), reminder follow-ups ("ඒක කළාද සර්?"), upcoming-event alerts, battery-low/charging tips, birthday/anniversary reminders from user-entered data, habit nudges the user configures, "do not disturb"/quiet hours, daily summary of what Nimah did.
- Every proactive notification type has its own on/off switch, frequency limit, and quiet hours; spoken proactive messages only when the user enabled them and headset/volume conditions allow; never speak sensitive content on the lock screen.
- Notification actions: Done / Snooze / Open.

L7. REQUIREMENTS FOR ALL L-FEATURES
- Each feature behind its own Settings toggle (default OFF for anything that listens, reads the screen, or notifies proactively) with a plain-language permission/privacy explanation in Sinhala + English.
- Add each feature to the capability registry + `docs/CAPABILITIES.md` with: implementation file, permission, offline/online, test status (unit-tested vs device-only).
- Add unit tests for all pure logic (intent parser, follow-up resolution, similarity threshold, routine runner, proactive scheduling rules).
- Do not bundle large models in the APK. Do not claim a feature works unless it was tested; mark device-only items "needs physical device test".
- Implement in tested batches, in this order: L4 (offline utilities + local parser) → L1 (natural flow + barge-in) → L6 (proactive) → L3 (screen reading + OCR) → L2 (automation macros) → L5 (voice lock). Keep the build green after every batch and update the workflow if new dependencies need it.
