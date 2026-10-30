ACT AS: senior Android engineer (React Native + Kotlin), voice/speech engineer, UI/UX designer and GitHub Actions DevOps engineer.

TASK: Fully upgrade my EXISTING "Nimah AI" repository (React Native 0.88 + TypeScript + Kotlin module `com.nimah`, Gemini AI). Work directly on the real repo and the real files. NO plan-only answers, NO demo projects, NO long explanations. Do every step below yourself, then commit + push to the repo, run the GitHub Actions workflow, fix every failure, and re-run until a Release APK artifact is produced. If you have a repo access token / write access, use it. When finished, also give me the full updated project as a ZIP and the APK artifact link. Report only: files changed, tests run + real results, commit link, workflow run link, artifact name.

NEVER claim anything was changed, built, pushed or tested unless you actually did it and saw the result.

KNOWN PROBLEMS (already verified — fix them):
1. `NimahModule.kt` `preferredMaleVoice()` matches voice names containing "male"/"man"/"voice 1" -> "female"/"woman" also match; real Google voice names have no gender, so it falls back to the default (often female) voice. Android has NO public voice-gender API; never invent one.
2. Gemini keys are baked into the APK via `src/config.ts` generated in the workflow. Remove this. Keys must come from the user typing them in-app (stored encrypted via Android Keystore-backed storage, not plain AsyncStorage) or from the existing `backend/` proxy. No secrets in source, logs, commits, or APK.
3. Release APK is signed with `debug.keystore`. Add release signing from GitHub secrets (KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD); if absent, build an unsigned/debug-signed APK and say so. Never commit keystores.
4. Workflow `.github/workflows/build-apk.yml`: outdated `android-actions/setup-android@v2`, uses `npm install`, no tsc/lint, no `permissions:`, no APK existence/size check, no logs on failure, artifact named `nimah-apk`.
5. `NimahService`: notification always says "Nimah is listening", no Stop action, wake lock without timeout, START_STICKY restart can be blocked from background on newer Android.
6. Lint error: unused `Text` import in `src/components/Bits.tsx`.
7. `App.tsx` hardcodes `palettes.dark`; home screen has only a voice orb, no text input, no conversation panel.
8. Baseline: tsc 0 errors, jest 39/39 pass. Keep them passing.

REQUIREMENTS

A. MALE VOICE (පිරිමි හඬ)
- Always prefer a male-sounding voice, never a female one when a male option exists. Enumerate `TextToSpeech.getVoices()` at runtime; pick by: user-chosen voice > curated list of known male voice names/variants per language (verify on device, don't guess) > name hints ("male", excluding "female"/"woman") > lower pitch (~0.8) and slightly slower rate on the default voice as fallback.
- Add Voice Settings: voice picker (list of installed voices with a "Preview" button), speech rate, pitch, "Test voice". Persist choice.
- Sinhala (si-LK) and English (en-US/en-GB) supported; if Sinhala TTS is not installed, fall back to English and show a button that opens the system TTS install/settings screen. Mixed Sinhala-English replies handled per sentence where possible.
- Address me as "සර්" naturally (greeting, confirmations, errors) — NOT in every sentence.
- Request audio focus while speaking; no overlapping or duplicate utterances; stop/repeat controls; sentence-level chunking with short pauses.

B. HOME SCREEN REDESIGN
Modern AI-dashboard look (light + dark + system theme, actually applied): Nimah logo/identity, big central mic button with permission/listening/processing/speaking/error states and animation, text input + send, conversation panel (user/AI bubbles, copy, repeat, share), quick-action chips (WhatsApp, call, alarm, notes, tasks, search, translate, open app, etc.), conversation history (search, export, delete), settings, network/AI-status badge, empty/loading/offline/error states, Stop-listening / Stop-speaking buttons, responsive layout, 48dp touch targets, good contrast. Every button must do something real. No placeholder controls.

C. ALWAYS-AVAILABLE VOICE WHILE USING OTHER APPS
- Foreground service (type microphone) with correct manifest permissions, started only from a user action; persistent notification with real state (Listening / Paused / Speaking), actions: Pause/Resume, Stop, Open app, "Talk now".
- Hands-free conversation loop: listen -> think -> speak -> listen again, with silence timeout, error recovery/restart of SpeechRecognizer, no duplicate service instances, wake lock with timeout, audio focus handling.
- Optional wake-phrase is NOT required; use the foreground-service loop plus a Quick Settings tile and home-screen/launcher shortcut as fallbacks.
- Onboarding: mic permission, notification permission (Android 13+), battery-optimization guidance (incl. OEM tips for Xiaomi/Samsung/Huawei/Oppo), clear in-app indicator whenever the mic is active, instant pause/stop. Never record secretly or bypass Android permission rules. Don't promise unrestricted background mic access; document the real limits per Android version.

D. WHATSAPP MESSAGING
Voice flow: "සර්ගේ යාළුවාට message එකක් යවන්න" -> ask recipient if unclear -> contact picker/search (READ_CONTACTS requested only when needed; handle several matches by asking) -> ask message if missing -> speech to editable text -> PREVIEW screen (recipient + full message, Edit / Cancel / Confirm) -> only after explicit confirmation open WhatsApp (`https://wa.me/<number>?text=` or the `whatsapp://send` intent, WhatsApp Business fallback, share-sheet fallback) -> report honestly: "WhatsApp opened / message prepared"; NEVER claim "delivered/sent" unless confirmed. Remove or make opt-in with explicit per-message confirmation the existing "Auto-send" that taps WhatsApp's Send button. Also: draft greetings, reminders, replies to pasted text, share generated text to WhatsApp.

E. AT LEAST 100 REAL, DISTINCT, TESTABLE CAPABILITIES
Implement and list in `docs/CAPABILITIES.md` (feature, implementation file, permission, test status — only genuinely working ones counted; no duplicates/fake). Groups:
1) Voice/conversation (start/stop listening, stop/repeat speech, rate, pitch, voice, language, silence timeout, resume, new conversation).
2) AI text (explain, summarize, rewrite, grammar, translate si/en/ta, message/email/caption/announcement, tone change, ideas, checklist, define words, key points, Q&A on pasted text).
3) Android controls (open apps, Settings/Wi-Fi/Bluetooth/sound/display/accessibility, camera, dialer, SMS, browser, URL, web search, share sheet, clipboard, torch, volume, battery/time/date).
4) Communication (WhatsApp drafts/preview/edit/cancel/open chat, email intent, SMS draft, call contact, share).
5) Productivity (notes CRUD+search, checklists, tasks CRUD, local reminders with notifications + AlarmManager/exact-alarm permission handling, calendar event intent, alarm/timer, stopwatch).
6) Calculator/utilities (arithmetic, percentage, unit/temperature/distance/time conversion, average, sum, word/char count, text formatting, date formats, random number) — work OFFLINE without AI.
7) Study/dev (explain concepts/code/errors, find likely bugs, flashcards, practice questions, study timetable, project plan, math/science explanations).
8) System (history search/export/delete, theme, privacy settings, voice prefs, service status, test mic/TTS, retry failed requests, network detection, diagnostics/version, permission status screen, battery guidance, quick-action manager, reset defaults).
Build a central capability registry in code (id, name, handler, permissions) so the app can show "Supported features".
If 100 can't be finished safely in one pass, ship in tested batches and document what remains — never pad the count.

F. AI BACKEND + MEMORY
Keep the Gemini integration (model/key rotation already exists). Real generated answers only, conversation context window, "New conversation" button, handle timeouts / network / 429 / 401 with clear messages in Sinhala + English, helpful error if no key is configured, offline utilities still work.

G. SETTINGS / PRIVACY / SECURITY
Dedicated settings screen (voice, language, theme, history, privacy, permissions, service, API key), encrypted storage for key, local history with delete, request permissions only when needed with explanations, input validation, request timeouts, no hidden data collection. Review and justify or remove risky permissions (WRITE_SECURE_SETTINGS, QUERY_ALL_PACKAGES, SEND_SMS, CALL_PHONE); keep AccessibilityService/NotificationListener strictly opt-in with explanations. Use `<queries>` instead of QUERY_ALL_PACKAGES where possible. Keep the emergency-stop and "confirm before risky actions" safety rules.

H. FIX BUILD/RUNTIME ISSUES
Fix every compile/runtime/manifest/gradle problem you find (inspect real logs). Keep `npx tsc --noEmit`, `npx eslint .` (0 errors) and `npx jest` green; add unit tests for new logic (voice selection, calculator/converters, message parsing, registry, WhatsApp URL building, reminders).

I. GITHUB ACTIONS — AUTO APK BUILD
Rewrite `.github/workflows/build-apk.yml`: triggers push to main + workflow_dispatch; `permissions: contents: read`; Node 22 with npm cache, Java 17 (Temurin), `android-actions/setup-android@v3`, `npm ci`, `tsc`, `eslint`, `jest`, decode keystore from secrets if present, `./gradlew assembleRelease`, verify APK exists and is non-empty (print size + sha256), set versionName/versionCode from run number, upload artifact named `Nimah-AI-Release-APK`, and upload build reports/logs on failure (`if: always()`). No secrets printed. Trigger it, read the real result, fix, and re-run until green.

J. REPO UPDATE (CRITICAL)
Make all changes in the real repo, review the diff, commit in meaningful steps, push to the correct branch (or open a PR), trigger the workflow, and give me: repo link, commit/PR link, workflow run link, APK artifact location. Do not delete unrelated files or overwrite my work. Also deliver the full updated project as a ZIP (excluding node_modules, build dirs and secrets).

K. WORK STYLE
Do it in phases (baseline -> fixes -> UI+voice -> background service -> WhatsApp -> tools/settings -> capabilities -> CI -> final validation) without stopping to ask questions. After each phase print a short report (files changed, tests actually run, results, remaining issues). If you hit a usage limit, save progress and resume when I send "CONTINUE". Clearly separate what you tested from what needs a physical Android device. If something can't be done (no repo access, no signing keys, device-only test), say exactly why — never fake it.

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

START NOW.
