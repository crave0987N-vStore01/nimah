# Nimah AI — Capability registry

Generated from src/capabilities.ts. Only features that are implemented in code are listed.

- Total: 129
- Offline / pure logic (unit-tested in CI): 38
- Need Android APIs or permissions (device test required, NOT run in CI): 67
- Need internet + Gemini key (NOT tested in CI): 24

Honest status: Kotlin, Gradle and the UI have not been compiled or run on a device in the authoring environment (the voiceprint maths was compiled and checked on synthetic audio only). TypeScript type-check, ESLint and the Jest suites pass.

| Group | Capability | Kind | Implementation | Permission | Test status | Example |
|---|---|---|---|---|---|---|
| Voice | Start voice conversation | device | hooks/useAssistant.ts | RECORD_AUDIO | device-needed | `tap the mic` |
| Voice | Stop listening | device | hooks/useAssistant.ts | - | device-needed | `tap the mic while listening` |
| Voice | Stop speaking | device | NimahModule.kt | - | device-needed | `tap Stop` |
| Voice | Repeat the previous reply | local | services/local.ts | - | unit | `repeat` |
| Voice | Adjust speech rate | device | components/SettingsModal.tsx | - | device-needed | `Settings → Speech speed` |
| Voice | Adjust voice pitch | device | components/SettingsModal.tsx | - | device-needed | `Settings → Voice pitch` |
| Voice | Choose an installed voice (male preferred) | local | services/voice.ts | - | unit | `Settings → Voice` |
| Voice | Preview a voice | device | components/VoicePicker.tsx | - | device-needed | `Settings → Voice → Preview` |
| Voice | Switch Sinhala / English | device | components/SettingsModal.tsx | - | device-needed | `Settings → Language` |
| Voice | English fallback when Sinhala TTS is missing | local | services/voice.ts | - | unit | `automatic` |
| Voice | Hands-free listen → answer → listen loop | device | hooks/useAssistant.ts | - | device-needed | `Settings → Auto listen` |
| Voice | Recognizer error recovery with back-off | device | hooks/useAssistant.ts | - | device-needed | `automatic` |
| Voice | Start a new conversation | local | services/local.ts | - | unit | `new conversation` |
| Voice | Type instead of speaking | device | components/InputBar.tsx | - | device-needed | `type in the box` |
| Voice | Always-on wake word: react only to "Nimah ..." (25 s follow-up window) | local | services/hotword.ts + hooks/useAssistant.ts | RECORD_AUDIO | unit | `hey Nimah, battery` |
| Voice | Sinhala / English: n-best pick by confidence + script, retry in the other language | local | services/bilingual.ts + NimahModule.kt | - | unit | `automatic` |
| Voice | Prefer Android's on-device speech pack (when installed) | device | NimahModule.kt | RECORD_AUDIO | device-needed | `Settings → Prefer offline speech recognition` |
| AI text | Explain a topic | ai | services/gemini.ts | - | online-needed | `explain photosynthesis` |
| AI text | Summarize supplied text | ai | services/gemini.ts | - | online-needed | `summarize: <text>` |
| AI text | Rewrite text | ai | services/gemini.ts | - | online-needed | `rewrite: <text>` |
| AI text | Correct grammar | ai | services/gemini.ts | - | online-needed | `fix grammar: <text>` |
| AI text | Translate (Sinhala/English/Tamil) | ai | services/gemini.ts | - | online-needed | `translate to Sinhala: <text>` |
| AI text | Generate a message | ai | services/gemini.ts | - | online-needed | `write a birthday message` |
| AI text | Draft an email | ai | services/gemini.ts | - | online-needed | `draft an email about leave` |
| AI text | Social media caption | ai | services/gemini.ts | - | online-needed | `caption for a beach photo` |
| AI text | Short announcement | ai | services/gemini.ts | - | online-needed | `announcement for a meeting` |
| AI text | Change writing tone | ai | services/gemini.ts | - | online-needed | `make this more formal: <text>` |
| AI text | Generate ideas | ai | services/gemini.ts | - | online-needed | `ideas for a school project` |
| AI text | Explain a word | ai | services/gemini.ts | - | online-needed | `what does "ephemeral" mean` |
| AI text | Key points from long text | ai | services/gemini.ts | - | online-needed | `key points: <text>` |
| AI text | Answer questions about supplied text | ai | services/gemini.ts | - | online-needed | `from this text: <text> question` |
| Android | Open an installed app | device | services/quick.ts + NimahModule.kt | - | device-needed | `open YouTube` |
| Android | Open Wi-Fi settings | device | services/local.ts | - | device-needed | `open wifi settings` |
| Android | Open Bluetooth settings | device | services/local.ts | - | device-needed | `open bluetooth settings` |
| Android | Open sound settings | device | services/local.ts | - | device-needed | `open sound settings` |
| Android | Open display settings | device | services/local.ts | - | device-needed | `open display settings` |
| Android | Open accessibility settings | device | services/local.ts | - | device-needed | `open accessibility settings` |
| Android | Open battery/location/date/apps/storage settings | device | services/local.ts | - | device-needed | `open battery settings` |
| Android | Flashlight on/off | device | services/quick.ts | CAMERA (flash) | device-needed | `torch on` |
| Android | Set media volume | device | services/local.ts | - | device-needed | `volume 40` |
| Android | Search the web | device | services/local.ts | - | device-needed | `search for weather` |
| Android | Open a website | device | services/local.ts | - | device-needed | `open example.com` |
| Android | Navigate to a place | device | services/actions.ts | - | device-needed | `navigate to Kandy` |
| Android | Play music | device | services/actions.ts | - | device-needed | `play music Imagine` |
| Android | Share the last reply (share sheet) | device | services/local.ts | - | device-needed | `share that` |
| Android | Battery level | device | services/local.ts | - | device-needed | `battery` |
| Android | Current time | local | services/local.ts | - | unit | `what time is it` |
| Android | Current date | local | services/local.ts | - | unit | `today's date` |
| Android | Set an alarm (system clock) | device | services/local.ts | - | device-needed | `alarm at 6:30 am` |
| Android | Set a timer (system clock) | device | services/local.ts | - | device-needed | `timer 5 minutes` |
| Android | Call a contact | device | services/actions.ts | READ_CONTACTS, CALL_PHONE | device-needed | `call Amma` |
| Communication | WhatsApp message with preview / edit / cancel / confirm | device | hooks/useAssistant.ts + services/review.ts | READ_CONTACTS | device-needed | `send a WhatsApp to Kamal` |
| Communication | Pick among several matching contacts | device | services/actions.ts | - | device-needed | `automatic` |
| Communication | Open the WhatsApp chat with the message prefilled | device | NimahModule.kt | - | device-needed | `after confirming` |
| Communication | Honest hand-off report (never claims delivery) | local | services/review.ts | - | unit | `automatic` |
| Communication | SMS with preview / confirm | device | services/actions.ts | SEND_SMS | device-needed | `text Kamal hello` |
| Communication | Understands send / edit / cancel (Sinhala + English) | local | services/review.ts | - | unit | `යවන්න` |
| Productivity | Create a note | local | services/local.ts | - | unit | `note: buy milk` |
| Productivity | Read notes | local | services/local.ts | - | unit | `show notes` |
| Productivity | Search notes | local | services/local.ts | - | unit | `search notes milk` |
| Productivity | Edit a note | local | services/local.ts | - | unit | `edit note 1 to buy tea` |
| Productivity | Delete a note (with confirmation) | local | services/local.ts | - | unit | `delete note 1` |
| Productivity | Create a task | local | services/local.ts | - | unit | `add task pay bill` |
| Productivity | List open tasks | local | services/local.ts | - | unit | `my tasks` |
| Productivity | Complete a task | local | services/local.ts | - | unit | `complete task 1` |
| Productivity | Edit a task | local | services/local.ts | - | unit | `edit task 1 to pay rent` |
| Productivity | Delete a task (with confirmation) | local | services/local.ts | - | unit | `delete task 1` |
| Productivity | Create a checklist | local | services/local.ts | - | unit | `checklist: eggs, bread, tea` |
| Productivity | Set a reminder with a notification | device | services/local.ts + ReminderReceiver.kt | POST_NOTIFICATIONS | device-needed | `remind me to call Kamal in 10 minutes` |
| Productivity | View upcoming reminders | local | services/local.ts | - | unit | `my reminders` |
| Productivity | Cancel a reminder | device | services/local.ts | - | device-needed | `cancel reminder 1` |
| Productivity | Daily briefing (date, tasks, reminders) | local | services/local.ts | - | unit | `briefing` |
| Productivity | Optional 8:00 daily briefing notification | device | NimahModule.kt | POST_NOTIFICATIONS | device-needed | `Settings → Daily briefing` |
| Calculator | Arithmetic (+ − × ÷ ^ %, brackets) | local | services/utilities.ts | - | unit | `calculate 12 * (3 + 4)` |
| Calculator | Percentage of a number | local | services/utilities.ts | - | unit | `15% of 240` |
| Calculator | Unit conversion (length, mass, volume, speed, data) | local | services/utilities.ts | - | unit | `convert 5 km to miles` |
| Calculator | Temperature conversion | local | services/utilities.ts | - | unit | `30 c to f` |
| Calculator | Time-unit conversion | local | services/utilities.ts | - | unit | `2 hours to minutes` |
| Calculator | Sum of numbers | local | services/utilities.ts | - | unit | `sum of 4 8 15` |
| Calculator | Average of numbers | local | services/utilities.ts | - | unit | `average of 4 8 15` |
| Calculator | Count words | local | services/utilities.ts | - | unit | `count words in hello big world` |
| Calculator | Count characters | local | services/utilities.ts | - | unit | `count characters in hello` |
| Calculator | Text case formatting | local | services/utilities.ts | - | unit | `title case: hello world` |
| Calculator | Date format conversion | local | services/utilities.ts | - | unit | `format date 2026-10-30` |
| Calculator | Random number | local | services/utilities.ts | - | unit | `random number between 1 and 10` |
| Study & dev | Explain code | ai | services/gemini.ts | - | online-needed | `explain this code: <code>` |
| Study & dev | Find likely bugs | ai | services/gemini.ts | - | online-needed | `find bugs: <code>` |
| Study & dev | Explain an error message | ai | services/gemini.ts | - | online-needed | `explain error: <text>` |
| Study & dev | Flashcards from material | ai | services/gemini.ts | - | online-needed | `flashcards: <text>` |
| Study & dev | Practice questions | ai | services/gemini.ts | - | online-needed | `practice questions on algebra` |
| Study & dev | Study timetable | ai | services/gemini.ts | - | online-needed | `study timetable for 5 subjects` |
| Study & dev | Project plan | ai | services/gemini.ts | - | online-needed | `project plan for a mobile app` |
| Study & dev | Explain math / science concepts | ai | services/gemini.ts | - | online-needed | `explain Newton’s laws` |
| System | Conversation history (view) | device | components/HistoryModal.tsx | - | device-needed | `History button` |
| System | Delete history | device | hooks/useHistory.ts | - | device-needed | `History → Clear` |
| System | Light / dark / system theme | device | theme.ts | - | device-needed | `Settings → Theme` |
| System | Encrypted API key storage | device | SecureStore.kt | - | device-needed | `key icon` |
| System | Background service with Stop action | device | NimahService.kt | - | device-needed | `Settings → Background service` |
| System | Network / AI status badge | device | hooks/useOnline.ts | - | device-needed | `top bar` |
| System | Supported-features list | device | components/FeaturesModal.tsx | - | device-needed | `Features button` |
| System | App version and diagnostics | device | components/FeaturesModal.tsx | - | device-needed | `Features → Diagnostics` |
| System | Battery-optimization request | device | NimahModule.kt | - | device-needed | `first launch` |
| Advanced | Control other apps by voice (accessibility agent) | ai | services/agent.ts | Accessibility service | online-needed | `open Settings and turn on dark mode` |
| Advanced | Ask before risky actions | device | services/agent.ts | - | device-needed | `automatic` |
| Advanced | Read the screen aloud | device | services/local.ts | Accessibility service | device-needed | `read my screen` |
| Advanced | Find phone numbers / emails / links on screen | device | services/utilities.ts | Accessibility service | device-needed | `find emails on screen` |
| Advanced | Offline command mode (no Gemini needed) | local | services/local.ts | - | unit | `automatic when offline` |
| Advanced | Read notifications | device | services/agent.ts | Notification access | device-needed | `read my notifications` |
| Advanced | Multi-step commands: "A and then B" runs as ordered steps (stops on failure / Stop) | local | services/multistep.ts + hooks/useAssistant.ts | - | unit | `open YouTube and then search lofi` |
| Advanced | Tap by visible label: UI node tree first, OCR fallback | device | services/agent.ts + services/screenmatch.ts | Accessibility service | device-needed | `tap Subscribe` |
| Advanced | Tap and swipe at exact coordinates | device | services/agent.ts + NimahAccessibilityService.kt | Accessibility service | device-needed | `swipe the slider to the right` |
| Advanced | On-device OCR of the screen (Latin only — NO Sinhala) | device | NimahOcr.kt | Accessibility service (screenshot) | device-needed | `read the text on this screen` |
| Advanced | Wi-Fi on/off (direct on Android 9-, system panel + Accessibility on 10+) | device | NimahModule.kt + services/hardware.ts | ACCESS_WIFI_STATE, Accessibility service | device-needed | `wifi off` |
| Advanced | Bluetooth on/off (direct on Android 12-, Settings screen + Accessibility on 13+) | device | NimahModule.kt + services/hardware.ts | BLUETOOTH_CONNECT, Accessibility service | device-needed | `bluetooth on` |
| Advanced | Screen brightness set / up / down | device | NimahModule.kt + services/hardware.ts | WRITE_SETTINGS (Modify system settings) | device-needed | `brightness 70` |
| Advanced | Voice lock: on-device MFCC voiceprint, soft factor only | device | VoiceDsp.kt + VoicePrint.kt + services/voicelock.ts | RECORD_AUDIO | device-needed | `Settings → Set up / test my voice` |
| Advanced | Fingerprint / face / PIN before messages and risky taps (when Voice lock is on) | device | NimahModule.kt (BiometricPrompt) + hooks/useAssistant.ts | USE_BIOMETRIC | device-needed | `send a WhatsApp to Kamal` |
| Advanced | Incoming call: say who is calling; answer / reject / speaker / mute by voice | device | services/calls.ts + CallReceiver.kt + NimahModule.kt | READ_PHONE_STATE, ANSWER_PHONE_CALLS | device-needed | `answer` |
| Advanced | Read new messages aloud and reply by voice (text never read on a locked phone) | device | services/incoming.ts + NimahNotificationService.kt | Notification access | device-needed | `Settings → Read new messages` |
| Advanced | Dictate into any text field (punctuation, new line, delete, send) | device | services/dictation.ts + services/commands.ts | Accessibility service | device-needed | `dictate` |
| Advanced | Turn the screen on when Nimah is addressed (does NOT unlock) | device | NimahModule.kt | WAKE_LOCK | device-needed | `hey Nimah` |
| Advanced | Numbered overlay: "show numbers", "tap 5" | device | NimahAccessibilityService.kt + services/numbers.ts | Accessibility service | device-needed | `show numbers` |
| Advanced | Media keys and volume: play / pause / next / previous / louder / mute | device | services/media.ts + NimahModule.kt | - | device-needed | `next song` |
| Advanced | Camera by voice: photo, selfie, video, countdown | device | services/camera.ts | Accessibility service | device-needed | `take a selfie in 5 seconds` |
| Advanced | Describe the screen with Gemini vision (asks first; reads Sinhala) | ai | services/gemini.ts + services/commands.ts | Accessibility service (screenshot) | online-needed | `describe my screen` |
| Advanced | Voice-made routines ("good morning": wifi on, brightness 80 ...) | local | services/routines.ts + services/routineStore.ts | - | unit | `create routine good morning: wifi on, brightness 80` |
| Advanced | Airplane, Do-not-disturb, hotspot, location, auto-rotate, mobile data on/off | device | NimahModule.kt + services/hardware.ts | Accessibility service, WRITE_SETTINGS, DND access | device-needed | `airplane mode on` |
| Advanced | Stop / snooze a ringing alarm | device | services/alarmctl.ts + NimahModule.kt | SET_ALARM | device-needed | `snooze 5 minutes` |
| Advanced | Say "help" / "උදව්": cancel window, then SMS with location to your contacts and call the first | device | services/emergency.ts | SEND_SMS, CALL_PHONE, ACCESS_FINE_LOCATION | device-needed | `help` |

## Honest limits of the speech / automation / security features

1. **Wake word** — Android has no low-power keyword-spotting API for third-party apps. Nimah keeps Android's SpeechRecognizer cycling and *filters* sentences that do not start with "Nimah" (or arrive within 25 s of the last exchange). Cost: battery, a possible system "listening" sound on some phones, and Google's recogniser may send audio to the cloud unless an offline pack is installed and "Prefer offline" is on. Needs a physical-device test.
2. **Sinhala STT** — quality depends on the phone's Google speech service; Sinhala offline packs are not available on every device. Nimah asks for the 5 best hypotheses, picks by confidence + script, and retries once in the other language when nothing was understood.
3. **Multi-step** — the splitter only cuts on explicit connectors ("and then", "ඉන්පසු", "ඊට පස්සේ"); anything ambiguous stays one command for the AI agent. No on-device LLM is bundled (planned as an optional download, see FUTURE_FEATURES.md L4).
4. **OCR** — Google ML Kit's text recogniser (bundled Latin model, ~4 MB) does **not** read Sinhala script. Sinhala screens use Accessibility node text, or a Gemini-vision screenshot. Screenshots need Android 11+.
5. **Hardware control** — since Android 10 apps cannot switch Wi-Fi / (from 13) Bluetooth on or off directly. Nimah uses the direct API where the OS still allows it and otherwise opens the system panel and flips the switch through the Accessibility service (so Accessibility must be on and the result depends on the phone maker's Settings layout). Brightness needs the "Modify system settings" permission (Settings → Allow brightness control).
6. **Voice lock** — Android has no speaker-verification API and no neural model is bundled. Nimah uses a statistical MFCC voiceprint (diagonal Gaussian) computed on the phone; it is encrypted with the Android Keystore and never uploaded. It can be fooled by recordings or voice cloning and is affected by noise; the thresholds are not tuned on real data (use the in-app test screen). Some phones will not allow a second recorder while the recogniser runs: then the score is "unavailable" and Nimah falls back to the phone's own unlock. **It is a convenience filter, not authentication.** Sending messages and risky taps *always* additionally require fingerprint / face / PIN (BiometricPrompt) while Voice lock is on; if Nimah is not in front, those actions are refused rather than allowed.
7. **Hands-free limits** — Android never lets an app type the lock-screen PIN / pattern / fingerprint. Nimah can turn the screen on and listen while the phone is locked (foreground service), but unlocking needs Google *Smart Lock / Voice Match* or no lock. Android 14+ also refuses to start a microphone service from the background, so after a reboot open the app once.
8. **Calls** — answering needs the "Phone calls" permission; ending a call needs Android 9+. Speaker / mute use the audio API and fall back to tapping the dialer's button.
9. **Message reply** — works through the notification's own Reply action, so it only works for chats that offer one (WhatsApp, SMS, Telegram, Messenger ...). Text is never read aloud while the phone is locked.
10. **Numbered overlay / camera / dictation** — depend on the Accessibility service and on how each app labels its buttons; camera apps without a labelled shutter button fall back to OCR (Latin text only).
11. **Emergency** — it sends an SMS with the last known location and calls the first number you set. A mis-heard "help" is guarded by an 8-second "say cancel" window. It is NOT a replacement for the phone's official emergency SOS.
