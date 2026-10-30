// Pure voice-selection logic (no native calls) so it can be unit-tested.
// Android has NO public API for a voice's gender, so "male-sounding" is a best effort:
//   user's choice > voices whose name says male (never female/woman) > lower pitch on the default voice.

export interface VoiceInfo {
  name: string;
  locale: string;          // BCP-47, e.g. "en-US", "si-LK"
  quality: number;         // Android Voice.getQuality(): higher is better
  latency: number;
  requiresNetwork: boolean;
  installed: boolean;
}

const FEMALE = /(female|woman|women|girl|feminine|\bfem\b)/i;
const MALE = /(\bmale\b|\bman\b|\bboy\b|masculine|\bmasc\b)/i;

export const looksFemale = (name: string) => FEMALE.test(name);
export const looksMale = (name: string) => !FEMALE.test(name) && MALE.test(name);

/** "en-US", "en_US" and "en" all give "en". */
export const langOf = (locale: string) => locale.replace('_', '-').split('-')[0].toLowerCase();

export function voicesForLocale(voices: VoiceInfo[], locale: string): VoiceInfo[] {
  const want = langOf(locale);
  return voices.filter((v) => v.installed && langOf(v.locale) === want);
}

const rank = (v: VoiceInfo) => v.quality * 10 - (v.requiresNetwork ? 5 : 0) - v.latency / 1000;

export interface VoiceChoice { voiceName: string; usedFallbackLanguage: boolean; maleVoiceFound: boolean }

/**
 * Chooses which voice to speak with. `preferred` (the user's pick) always wins if it is installed.
 * If the locale has no voice at all (e.g. Sinhala TTS not installed) English is used instead.
 */
export function chooseVoice(voices: VoiceInfo[], locale: string, preferred: string): VoiceChoice {
  const pick = preferred ? voices.find((v) => v.installed && v.name === preferred) : undefined;
  if (pick) return { voiceName: pick.name, usedFallbackLanguage: false, maleVoiceFound: !looksFemale(pick.name) };

  let pool = voicesForLocale(voices, locale);
  let fallback = false;
  if (pool.length === 0 && langOf(locale) !== 'en') { pool = voicesForLocale(voices, 'en'); fallback = true; }

  const males = pool.filter((v) => looksMale(v.name)).sort((a, b) => rank(b) - rank(a));
  if (males.length) return { voiceName: males[0].name, usedFallbackLanguage: fallback, maleVoiceFound: true };

  // No voice is labelled male: avoid ones labelled female, otherwise let the engine use its default.
  const neutral = pool.filter((v) => !looksFemale(v.name)).sort((a, b) => rank(b) - rank(a));
  return { voiceName: neutral[0]?.name ?? '', usedFallbackLanguage: fallback, maleVoiceFound: false };
}

/** Keeps pitch in the range Android accepts. When no male voice exists, never go above 0.9 (deeper). */
export function effectivePitch(userPitch: number, maleVoiceFound: boolean): number {
  const p = Math.min(1.5, Math.max(0.5, Number.isFinite(userPitch) ? userPitch : 0.85));
  return maleVoiceFound ? p : Math.min(p, 0.9);
}

/** Splits text into sentences for display/preview purposes. */
export const splitSentences = (text: string) => text.split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
