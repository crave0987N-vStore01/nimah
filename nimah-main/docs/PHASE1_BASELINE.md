# Nimah AI — Phase 1: Inspection & Baseline (no source files modified)

## Environment limits (verified)
- The upload has **no .git directory** and no GitHub credentials are available; unauthenticated GitHub API returns 403. Commit/push/PR/workflow trigger are NOT possible from here.
- The sandbox cannot reach services.gradle.org or dl.google.com (HTTP 000). **No Gradle/Android SDK build and no APK can be produced here.** Kotlin code is uncompiled in this environment.

## Baseline actually run
| Check | Result |
|---|---|
| npm install (Node 22.22) | OK, 861 packages |
| tsc --noEmit | 0 errors |
| jest | 5 suites, 39/39 pass |
| eslint | 1 error (unused `Text` import, src/components/Bits.tsx:3), 32 warnings |
| Gradle / assembleRelease | NOT RUN (unreachable) |

## Project facts
React Native 0.88 / React 19 / TypeScript + Kotlin native module (com.nimah). Gemini via @google/generative-ai. minSdk 24, targetSdk 36, compileSdk 37, Gradle 9.4.1, AGP 9 opt-outs. Existing actions: send_whatsapp, send_sms, call_contact, set_alarm, set_timer, open_app, navigate, play_music, flashlight, enable_accessibility, phone_task (AI agent over AccessibilityService), answer.

## Findings
1. **Male voice heuristic is broken** (NimahModule.kt `preferredMaleVoice`): matches voice-name substrings "male"/"man"/"voice 1". "female" and "woman" both contain these substrings; real Google TTS names (e.g. `en-us-x-xxx-local`) contain no gender, so it usually returns null -> default (often female) voice. Android has no public gender API. No pitch, no voice picker, no audio focus.
2. **API keys are compiled into the APK**: workflow writes GEMINI keys into src/config.ts, which is bundled. Violates "no keys in APK". Runtime keys in KeyModal are stored in plain AsyncStorage.
3. **Release APK signed with debug.keystore**; workflow has no signing-secret path.
4. **Workflow**: android-actions/setup-android@v2 (outdated, continue-on-error), `npm install` not `npm ci`, no tsc/lint, no `permissions:` block, no APK existence/size check, no upload-on-failure logs, artifact named `nimah-apk`, no version stamping.
5. **Foreground service** (NimahService): notification always says "Nimah is listening" even when not; no Stop action; wake lock acquired with no timeout; START_STICKY restart from background can be blocked on Android 12+/14+ for microphone-type FGS; actual recognition runs in the app process, not the service.
6. **Sensitive permissions**: WRITE_SECURE_SETTINGS, QUERY_ALL_PACKAGES, SEND_SMS, CALL_PHONE, AccessibilityService, NotificationListener. "Auto-send" taps WhatsApp Send automatically; must be reconciled with the "never send without explicit confirmation" requirement (Phase 5).
7. **UI**: single voice orb screen; `App.tsx` hardcodes `palettes.dark` (theme setting unused there); no text input / conversation panel on home; TextInput exists only in settings/key modal.
8. Lint error above.

## Plan
P2 baseline fixes (lint, workflow, keys out of APK, signing via secrets) -> P3 home redesign + voice (picker, pitch, audio focus) -> P4 service/notification controls -> P5 WhatsApp review-and-confirm flow -> P6 settings/notes/tasks/reminders -> P7 capability registry (honest count) -> P8 CI -> P9 validation.

## Batch 1 changes (applied; Kotlin/Gradle NOT compiled here)
- Voice: Kotlin `getVoices()`, `speak(text, locale, rate, pitch, voiceName)` with sentence chunking, generation-safe callbacks (no overlap/duplicate), audio focus, language fallback. JS: `services/voice.ts` (tested), `speech.ts`, `VoicePicker` + pitch in Settings.
- Security: `SecureStore.kt` (Android Keystore AES-GCM) for API keys; legacy AsyncStorage keys migrated. Workflow no longer embeds any key.
- Service: real Stop action, honest notification text, wake lock with timeout, START_NOT_STICKY, JS stops listening when Stop is tapped.
- CI: workflow rewritten (v3 SDK action, npm ci, tsc, eslint, jest, optional release signing from secrets, APK verify, artifact `Nimah-AI-Release-APK`, logs on failure). Gradle: versionCode from run number, release signing via env.
- Tests: tsc 0 errors, eslint 0 errors, jest 48/48.
## Still TODO: home redesign, text input/conversation panel, WhatsApp preview/confirm flow (remove auto-send), notes/tasks/reminders, capability registry, permission trimming, Quick Settings tile.

## Batch 2 (applied; Kotlin/Gradle/UI NOT compiled or run here)
- Home dashboard: light/dark/system theme, chat panel (Speak/Share per reply), text input + mic, quick-action chips, stop-listening/stop-speaking/stop-task, network + AI-key badge, offline banner, Notes/Tasks/Reminders screen, Features + Diagnostics screen, History.
- Offline engine (`services/local.ts`, `utilities.ts`, `parseTime.ts`, `notes.ts`): calculator, units, notes, tasks, checklists, reminders (native notification via `ReminderReceiver.kt`), timer/alarm, settings pages, web search, volume, briefing, screen read + extract phones/emails/links.
- WhatsApp/SMS: preview with Send / Edit / Cancel (voice or tap) before anything opens; honest hand-off wording; "auto tap Send" only after that confirmation and is OFF by default.
- Optional 8:00 daily briefing notification (Settings). Reminders are lost after a phone reboot (no boot receiver yet).
- Tests: tsc 0 errors, eslint 0 errors, jest 70/70.
## NOT implemented yet (be honest)
- Voice biometrics / voice lock (needs an on-device speaker model; Android has no API). 
- ML Kit OCR of screenshots/images (Sinhala not supported by ML Kit); screen reading uses the accessibility tree only.
- On-device LLM for offline AI answers; true barge-in (interrupt by voice while speaking); Quick Settings tile; permission trimming (SEND_SMS, CALL_PHONE, WRITE_SECURE_SETTINGS, QUERY_ALL_PACKAGES still declared).
- Anything requiring Gradle/device verification.
