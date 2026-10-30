// src/config.example.ts — add this file to .gitignore!
import { Settings } from './types';

// ---- Gemini -------------------------------------------------------------
// Use a free-tier Gemini model when you are on the Google AI Studio free quota.
// The app will automatically fall over to the next model/key when a quota is exhausted.
export const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// DEV ONLY: a key inside an APK can be extracted. Leave GEMINI_PROXY_URL empty
// to call Gemini directly with this key, or set it to your backend (see backend/).
export const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
// Optional EXTRA keys (other Google accounts / projects). When one key's free quota is used up,
// Nimah automatically switches to the next. Leave the placeholders as they are if you have none.
export const GEMINI_API_KEYS: string[] = ['YOUR_EXTRA_KEY_2', 'YOUR_EXTRA_KEY_3'];
export const GEMINI_PROXY_URL = '';            // e.g. 'https://your-host.example.com/nimah'
export const PROXY_TOKEN = '';                 // shared secret, must match backend NIMAH_TOKEN

// ---- Defaults for the Settings screen ----------------------------------
export const DEFAULT_SETTINGS: Settings = {
  locale: 'en-US',          // 'si-LK' for Sinhala
  countryCode: '94',        // Sri Lanka
  backgroundService: true,   // keeps the mic alive while other apps are open
  theme: 'system',
  speakReplies: true,
  speechRate: 1.0,
  pitch: 0.85,
  voiceName: '',
  autoSend: false,          // hands-free Send (needs the accessibility service)
  fullControl: true,        // AI may operate any app to finish a spoken task
  confirmRisky: true,       // ask before payments / deleting / buying
  askBack: true,            // Nimah greets you and asks "what next?" after each job
  autoListen: true,         // mic opens by itself when the app opens, and stays on
  dailyBriefing: false,     // opt-in 8:00 morning notification
  maxSteps: 30,             // safety limit per task
  wakeWord: true,           // only react to "Nimah ..." (follow-ups within 25 s need no wake word)
  autoLanguage: true,       // retry in the other language when nothing was understood
  preferOffline: false,     // use Android's on-device speech pack when installed
  multiStep: true,          // "A and then B" runs as ordered steps
  voiceLock: false,         // owner-voice filter (soft factor) — enroll in Settings first
  voiceSensitivity: 3,      // 1 lenient .. 5 strict
  announceCalls: true,      // say who is calling, answer / reject by voice
  readMessages: false,      // opt-in: read new messages aloud + reply by voice
  emergencyContacts: '',    // numbers for the "help" command
};
