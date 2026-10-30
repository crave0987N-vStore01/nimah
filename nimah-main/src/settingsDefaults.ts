// Defaults for settings added after the first release. Merged UNDER the user's config.ts and saved
// settings, so an older src/config.ts that lacks these fields still works.
import { Settings } from './types';

export const NEW_DEFAULTS: Pick<Settings, 'wakeWord' | 'autoLanguage' | 'preferOffline' | 'multiStep' | 'voiceLock' | 'voiceSensitivity' | 'announceCalls' | 'readMessages' | 'emergencyContacts'> = {
  wakeWord: true,          // only react to "Nimah ..." (follow-ups within 25 s need no wake word)
  autoLanguage: true,      // retry in the other language (Sinhala <-> English) when nothing was understood
  preferOffline: false,    // ask Android to use its on-device speech pack when installed
  multiStep: true,         // "open X and then do Y" -> run the parts in order
  voiceLock: false,        // owner-voice filter (soft factor) — enroll first
  voiceSensitivity: 3,     // 1 (lenient) .. 5 (strict)
  announceCalls: true,     // "Kamal is calling. Answer or reject?"
  readMessages: false,     // opt-in: read new messages aloud + voice reply
  emergencyContacts: '',   // e.g. '0771234567, 0112345678'
};
