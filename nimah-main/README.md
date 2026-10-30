# Nimah v3 — voice-only phone control (React Native + Kotlin + Gemini)

You only **speak**. The AI does everything else — it looks at the screen, taps, types, scrolls and switches apps by itself until the job is done.

Flow: **mic → Android SpeechRecognizer → Gemini intent parser → fast action _or_ the AI agent loop (screen → Gemini → tap/type/scroll → repeat) → spoken reply**

## fix7 — fully hands-free
- **Calls**: "Kamal is calling. Answer or reject?" — say *answer / reject / speaker on / mute*.
- **Messages**: new WhatsApp/SMS read aloud (Settings → Read new messages), reply by voice.
- **Dictation**: say *dictate* → speak, then *new line / delete last word / done / send*.
- **Screen on**: saying "Nimah" wakes the screen (cannot unlock — see docs).
- **Numbers**: *show numbers* → *tap 5*. **Media**: *next song, pause, louder*. **Camera**: *take a selfie in 5 seconds*.
- **Describe screen** (Gemini vision, asks first). **Routines**: *create routine good morning: wifi on, brightness 80*, then say *good morning*.
- **Toggles**: airplane, Do-not-disturb, hotspot, location, auto-rotate, mobile data. **Alarm**: *stop alarm / snooze 5 minutes*.
- **Emergency**: say *help / උදව්* (set numbers in Settings) — 8 s to cancel, then SMS + location + call.
- Limits: `docs/CAPABILITIES.md`. Needs a physical-device test.

## fix6 — speech, multi-step, OCR, hardware, voice lock
- **Wake word + bilingual STT**: say "Nimah / නිමා …" (follow-ups within 25 s need no wake word); Sinhala/English n-best pick + auto retry in the other language; optional offline recognition. `hotword.ts`, `bilingual.ts`
- **Multi-step commands**: "open YouTube and then search lofi" / "… ඉන්පසු …" run in order. `multistep.ts`
- **UI automation**: `tap_text` (node tree → OCR), `tap_xy`, `swipe_xy`, `read_ocr` (ML Kit, Latin only), typing. `screenmatch.ts`, `NimahOcr.kt`
- **Hardware**: Wi-Fi, Bluetooth, brightness by voice (`wifi off`, `brightness 70`). `hardware.ts`, `NimahModule.kt`
- **Voice lock**: on-device voiceprint (Settings → Set up my voice) + fingerprint/PIN for messages and risky taps. `VoiceDsp.kt`, `voicelock.ts`
- Limits are listed honestly in `docs/CAPABILITIES.md`. Needs a physical-device test.

## fix5 (latest)
- **429 "quota exceeded" fixed**: Nimah now rotates through several Gemini models (`gemini-flash-latest` → flash-lite → 2.5 …) and any extra keys (`GEMINI_API_KEYS`, GitHub secrets `GEMINI_API_KEY_2/3`). A model that hits its quota sleeps for ~1 min and the next one is used automatically.
- **No mic button**: the mic opens by itself when the app opens and re-opens after every command (Settings → *Always listening*). A foreground service keeps it alive while YouTube / other apps are in front.
- **Talk inside any app**: say "YouTube open කරන්න", then (while YouTube is open) "search bar එකේ lofi songs search කරන්න" — the AI works in the app that is on screen.

## What's new in v3
| Feature | Where |
|---|---|
| **Full phone control**: any task in any app ("turn on Wi-Fi", "post a story on Facebook", "order the same thing on PickMe", "change my wallpaper") | `src/services/agent.ts`, `NimahAccessibilityService.kt` |
| Agent reads the screen as a numbered list; falls back to a screenshot for games / video / canvas apps | `NimahAccessibilityService.snapshot()`, `screenshotBase64()` |
| Taps, long-press, type (incl. Enter), scroll, swipe, back/home/recents, notification shade, quick settings, lock, screenshot, power menu | `NimahModule.kt` (`ui*` methods) |
| Read & dismiss notifications by voice | `NimahNotificationService.kt` |
| Volume, open URL, open any Settings page, time/date/battery answers | `NimahModule.kt` |
| General Q&A ("what's 15% of 2400?", translate, advice) | `answer` action |
| AI can **ask you** questions by voice and continue ("which photo?", "what should I write?") | `useAssistant.ts` → `ask` |
| **Safety**: voice yes/no before payments / deleting / buying / uninstalling (prompt rule + code-level check); never types passwords, PINs or OTPs | `prompt.js`, `agent.ts` |
| **Emergency stop**: hold **Volume Down**, press **Volume Up** — or tap the mic / Stop button | `onKeyEvent`, `stopTask` |
| Loop guard, 30-step limit, retry with backoff | `agent.ts` |
| Backend `/agent` endpoint (key stays off the phone) | `backend/server.js` |
| Fixed: Sinhala "දෙවන එක" ("the second one") was matched as option 1 | `contacts.ts` |

Everything from v2 still works (WhatsApp / SMS / call / alarm / timer / apps / maps / music / flashlight, Sinhala, "which Asanka?", memory, background mode, history, themes).

## Quick start (සිංහලෙන්)
1. `npm install` කරන්න (project එක සම්පූර්ණයි, files copy කරන්න ඕනේ නැහැ).
2. `src/config.ts` එකේ `GEMINI_API_KEY` දාන්න.
3. App එක run කරලා **Settings → "ෆෝන් පාලනය සක්‍රීය කරන්න"** ඔබන්න → Accessibility list එකේ **Nimah** → ON.
   - Android 13+ වල ON වෙන්නේ නැත්නම්: *Settings → Apps → Nimah → ⋮ → Allow restricted settings*, ඊට පස්සේ ආයෙත් ON කරන්න.
4. (optional) **"Notification access සක්‍රීය කරන්න"** → Nimah ON (notifications කියවන්න).
5. Phone එක unlock කරලා mic එක ඔබලා කතා කරන්න. නවත්වන්න: **Volume Down අල්ලාගෙන Volume Up ඔබන්න**.

Try saying:
- "Wi-Fi off කරන්න" · "Brightness අඩු කරන්න" · "Screenshot එකක් ගන්න"
- "YouTube එකේ lofi music search කරලා පළමු video එක play කරන්න"
- "Chrome එකෙන් Colombo weather බලලා කියන්න"
- "මගේ notifications මොනවද?" · "අලුත් messages කියවන්න"
- "Camera එකෙන් photo එකක් ගන්න"

## Build the APK on GitHub (no computer needed)
1. Push this folder to a **private** GitHub repo.
2. Repo → Settings → Secrets and variables → Actions → New secret: `GEMINI_API_KEY`.
3. Actions tab → "Build APK" → Run workflow (it also runs on every push to `main`).
4. When it finishes (~10-15 min) open the run → Artifacts → `nimah-apk` → download, unzip, install `app-release.apk` (allow "install unknown apps").

`src/config.ts` is git-ignored; the workflow creates it from `src/config.example.ts` + your secrets. For local runs copy `config.example.ts` to `config.ts` and put your keys in.

## 1. Install (project is already complete)
This zip is a full React Native project: manifest, permissions, services, `MainApplication` (NimahPackage registered) and `package.json` are all set up. You only need:
```bash
npm install
```
(Needs Node 22+, Android Studio / SDK.)

## 2. Configure `src/config.ts`
- **Quick start:** put your Gemini key in `GEMINI_API_KEY` (dev only).
- **Production:** deploy `backend/`, set `GEMINI_PROXY_URL` + `PROXY_TOKEN`, and clear `GEMINI_API_KEY`.
  ```bash
  cd backend && npm install
  GEMINI_API_KEY=... NIMAH_TOKEN=long-random-string npm start
  ```
  Deploy the whole project folder (server.js imports `../src/services/prompt.js`). For stronger protection add Firebase App Check in front.

## 3. Run & test
```bash
npx react-native run-android      # use a real phone
npm test                          # validation, agent helpers, yes/no, contact-matching tests
```

## Hands-free Send (Settings → Auto-send)
- **WhatsApp:** the accessibility service taps WhatsApp's Send button. Turn on *Auto-send*; enable **Nimah** in Accessibility (one time).
- **SMS:** sent directly via `SmsManager` (allow the SMS permission).
- With **Full phone control** on, the AI can also finish the send itself in any messaging app.

## How the agent works
1. You speak → Gemini decides: quick action (WhatsApp, alarm…), `answer`, or `phone_task`.
2. For `phone_task` the agent loops (max 30 steps): read screen → ask Gemini for ONE action → perform it → wait until the UI settles → repeat → `done` / `fail`.
3. Risky taps (pay, buy, delete, uninstall, transfer…) always trigger a spoken **yes / no** first (Settings → *Ask before risky actions*).
4. It will not type passwords, PINs or OTPs; it asks you instead.

## Honest limitations
- **The phone must be unlocked** (and the screen on). Nimah does not and should not enter your PIN/pattern.
- **Speed/cost:** each step is one Gemini call (~2–4 s). A 10-step task ≈ 30 s and 10 API calls.
- **Some screens can't be read or captured:** banking apps, password fields and DRM video block accessibility/screenshots on purpose. Nimah will say it is stuck.
- **It can still make mistakes.** Keep *Ask before risky actions* on, and know the emergency stop (Volume Down + Volume Up).
- **Android 13+** needs "Allow restricted settings" once for sideloaded apps (see Quick start). **Google Play** restricts apps that use Accessibility like this — fine for personal/sideloaded use, likely rejected for a store release.
- **Screenshots fallback** needs Android 11+. Android 9–10 relies on the text tree only.
- **Background mode:** a foreground service keeps the mic + JS alive while the AI works in other apps (a notification is shown). The mic can only be used while that service runs.
- **Sinhala voice:** STT/TTS need the Google language packs; if the Sinhala TTS voice is missing, English speech is used.
- **Sinhala names:** Gemini transliterates names to Latin letters to match contacts; contacts saved in Sinhala script may not match.
- **Not included:** Gemini Live API (real-time audio streaming) and Google Cloud TTS.
- **Security:** a key inside an APK can be extracted. For anything beyond personal use deploy `backend/` and set `GEMINI_PROXY_URL` (the proxy now serves `/nimah` and `/agent`). **If your key was ever shared or posted publicly, create a new one in Google AI Studio and delete the old key.**
- This code has not been compiled on a device — expect to fix small version-specific issues on first build (the Kotlin files could not be compiled here; the TypeScript type-checks and all 31 unit tests pass).
