// src/config.ts — add this file to .gitignore!
import { Settings } from './types';

// ---- Gemini -------------------------------------------------------------
export const GEMINI_MODEL = 'gemini-2.5-flash';

// DEV ONLY: a key inside an APK can be extracted. Leave GEMINI_PROXY_URL empty
// to call Gemini directly with this key, or set it to your backend (see backend/).
export const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
export const GEMINI_PROXY_URL = '';            // e.g. 'https://your-host.example.com/nimah'
export const PROXY_TOKEN = '';                 // shared secret, must match backend NIMAH_TOKEN

// ---- Defaults for the Settings screen ----------------------------------
export const DEFAULT_SETTINGS: Settings = {
  locale: 'en-US',          // 'si-LK' for Sinhala
  countryCode: '94',        // Sri Lanka
  backgroundService: false,
  theme: 'system',
  speakReplies: true,
  speechRate: 1.0,
  autoSend: false,          // hands-free Send (needs the accessibility service)
  fullControl: true,        // AI may operate any app to finish a spoken task
  confirmRisky: true,       // ask before payments / deleting / buying
  maxSteps: 30,             // safety limit per task
};
