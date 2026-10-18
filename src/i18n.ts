import { Locale } from './types';

const en = {
  tapToSpeak: 'Tap to speak', listening: 'Listening...', processing: 'Processing...', speaking: 'Speaking...',
  hint: 'Try: “Send WhatsApp to Asanka, come tomorrow” or “Turn on wifi” or “Post a story on Facebook”',
  didntCatch: "I didn't catch that.", whichOne: 'Which one?', cancel: 'Cancel',
  settings: 'Settings', history: 'History', close: 'Close', clear: 'Clear', noHistory: 'No commands yet',
  language: 'Language', countryCode: 'Country code', background: 'Background service',
  theme: 'Theme', speakReplies: 'Speak replies', speechRate: 'Speech speed', newChat: 'New conversation', autoSend: 'Auto-send (hands-free)',
  system: 'System', dark: 'Dark', light: 'Light',
  errContactNotFound: "I couldn't find that contact.",
  errWhatsApp: 'WhatsApp is not installed.',
  errContactsPerm: 'I need contacts permission to find people.',
  errMicPerm: 'Microphone permission is required.',
  errCancelled: 'Cancelled.',
  errAppNotFound: "I couldn't find that app.",
  errTorch: 'This device has no flashlight.',
  errA11y: 'Please turn on Nimah in Accessibility settings so I can control the phone.',
  errNotif: 'Please allow notification access for Nimah.',
  errGemini: "I couldn't reach the AI. Check the internet connection and the Gemini key.",
  errNoKey: 'The Gemini API key is missing in this app build.',
  errGeneric: 'Something went wrong. Please try again.',
  fullControl: 'Full phone control (AI)', confirmRisky: 'Ask before risky actions', stopTask: 'Stop',
  working: 'Working...', setupControl: 'Enable phone control', setupNotif: 'Enable notification access',
  stopHint: 'Emergency stop: hold Volume Down, then press Volume Up',
  yes: 'Yes', no: 'No', answerYesNo: 'Say yes or no.',
};

const si: typeof en = {
  tapToSpeak: 'කතා කිරීමට ඔබන්න', listening: 'සවන් දෙමින්...', processing: 'සකසමින්...', speaking: 'කතා කරමින්...',
  hint: 'උදා: “Asanka ට WhatsApp කරන්න, හෙට එන්න”',
  didntCatch: 'මට ඇසුණේ නැහැ.', whichOne: 'කුමන එකද?', cancel: 'අවලංගු කරන්න',
  settings: 'සැකසුම්', history: 'ඉතිහාසය', close: 'වසන්න', clear: 'මකන්න', noHistory: 'තවම විධාන නැත',
  language: 'භාෂාව', countryCode: 'රටේ කේතය', background: 'පසුබිම් සේවාව',
  theme: 'තේමාව', speakReplies: 'හඬින් පිළිතුරු දෙන්න', speechRate: 'කතා කරන වේගය', newChat: 'නව සංවාදයක්', autoSend: 'ස්වයංක්‍රීයව යවන්න (hands-free)',
  system: 'පද්ධතිය', dark: 'අඳුරු', light: 'ආලෝක',
  errContactNotFound: 'ඒ contact එක සොයා ගත නොහැකි විය.',
  errWhatsApp: 'WhatsApp ස්ථාපනය කර නැහැ.',
  errContactsPerm: 'මිනිසුන් සෙවීමට contacts අවසරය අවශ්‍යයි.',
  errMicPerm: 'මයික්‍රොෆෝන අවසරය අවශ්‍යයි.',
  errCancelled: 'අවලංගු කළා.',
  errAppNotFound: 'ඒ app එක සොයා ගත නොහැකි විය.',
  errTorch: 'මෙම උපාංගයේ flashlight නැහැ.',
  errA11y: 'ෆෝන් එක පාලනය කරන්න Accessibility settings වල Nimah සක්‍රීය කරන්න.',
  errNotif: 'Nimah සඳහා notification access ලබා දෙන්න.',
  errGemini: 'AI එකට සම්බන්ධ වෙන්න බැරි වුණා. Internet සහ Gemini key එක බලන්න.',
  errNoKey: 'මේ app එකේ Gemini API key එක නැහැ.',
  errGeneric: 'යම් දෙයක් වැරදුණා. නැවත උත්සාහ කරන්න.',
  fullControl: 'සම්පූර්ණ ෆෝන් පාලනය (AI)', confirmRisky: 'අවදානම් දේවල් වලට පෙර අහන්න', stopTask: 'නවත්වන්න',
  working: 'වැඩ කරමින්...', setupControl: 'ෆෝන් පාලනය සක්‍රීය කරන්න', setupNotif: 'Notification access සක්‍රීය කරන්න',
  stopHint: 'හදිසි නවත්වීම: Volume Down අල්ලාගෙන Volume Up ඔබන්න',
  yes: 'ඔව්', no: 'නැහැ', answerYesNo: 'ඔව් හෝ නැහැ කියන්න.',
};

export type Key = keyof typeof en;
export const t = (locale: Locale, key: Key): string => (locale === 'si-LK' ? si : en)[key];

const ERROR_KEYS: Record<string, Key> = {
  CONTACT_NOT_FOUND: 'errContactNotFound',
  WHATSAPP_NOT_INSTALLED: 'errWhatsApp',
  NO_CONTACTS_PERMISSION: 'errContactsPerm',
  NO_MIC_PERMISSION: 'errMicPerm',
  CANCELLED: 'errCancelled',
  APP_NOT_FOUND: 'errAppNotFound',
  NO_FLASH: 'errTorch',
  A11Y_NOT_ENABLED: 'errA11y',
  NOTIF_NOT_ENABLED: 'errNotif',
  GEMINI_FAILED: 'errGemini',
  NO_API_KEY: 'errNoKey',
};
export const errorMessage = (locale: Locale, code?: string) => t(locale, ERROR_KEYS[code ?? ''] ?? 'errGeneric');
