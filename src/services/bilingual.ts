// Sinhala / English speech-recognition helpers (pure, unit-tested).
import { Locale } from '../types';

export type Script = 'si' | 'en' | 'mixed' | 'none';

export function scriptOf(text: string): Script {
  const si = (text.match(/[\u0D80-\u0DFF]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (!si && !en) return 'none';
  if (si && !en) return 'si';
  if (en && !si) return 'en';
  return 'mixed';
}

export const otherLocale = (l: Locale): Locale => (l === 'si-LK' ? 'en-US' : 'si-LK');

export interface Alt { text: string; confidence?: number }

/**
 * Chooses the best of the recogniser's n-best list. Confidence is the main signal (many
 * recognisers return -1/0 for "unknown" -> neutral 0.5); a small bonus goes to a result written in the
 * script the user is expected to speak, and the recogniser's own ranking breaks ties.
 */
export function pickBestAlternative(alts: Alt[], locale: Locale): string {
  const list = alts.filter((a) => a.text && a.text.trim());
  if (!list.length) return '';
  let best = list[0]; let bestScore = -Infinity;
  list.forEach((a, i) => {
    const conf = a.confidence !== undefined && a.confidence > 0 ? a.confidence : 0.5;
    const sc = scriptOf(a.text);
    const bonus = (locale === 'si-LK' && (sc === 'si' || sc === 'mixed')) || (locale === 'en-US' && (sc === 'en' || sc === 'mixed')) ? 0.08 : 0;
    const score = conf + bonus - i * 0.03;
    if (score > bestScore) { best = a; bestScore = score; }
  });
  return best.text.trim();
}

// SpeechRecognizer error codes
export const ERROR_SPEECH_TIMEOUT = 6;
export const ERROR_NO_MATCH = 7;

/** Auto language mode: when speech was heard but not understood, try the other language once. */
export function shouldRetryOtherLocale(o: { code?: number; auto: boolean; alreadyRetried: boolean }): boolean {
  return o.auto && !o.alreadyRetried && o.code === ERROR_NO_MATCH;
}
