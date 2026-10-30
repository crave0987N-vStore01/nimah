// Wake-word ("hotword") gate for the always-listening loop. Pure logic, unit-tested.
// Honest note: Android's SpeechRecognizer is restarted in a loop; this module decides which of the
// recognised sentences are meant for Nimah. It is NOT a low-power acoustic keyword spotter.

export const DEFAULT_WAKE_WORDS = ['nimah', 'nima', 'nimaa', 'neema', 'නිමා', 'නිමාහ්', 'නිමහ්', 'නීමා'];
const FILLERS = new Set(['hey', 'hi', 'hello', 'ok', 'okay', 'yo', 'හේ', 'හායි', 'හලෝ', 'හෙලෝ', 'ඕකේ', 'ඔකේ']);
/** How long after an accepted command (or a tap on the mic) follow-ups need no wake word. */
export const CONVERSATION_WINDOW_MS = 25_000;

const SINHALA = /[\u0D80-\u0DFF]/;
const clean = (s: string) => s.replace(/[.,!?;:"'“”‘’()[\]{}।]/g, '').trim();

export function levenshtein(a: string, b: string): number {
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function isWakeToken(token: string, words: string[]): boolean {
  const tk = clean(token).toLowerCase();
  if (!tk) return false;
  return words.some((w) => {
    const wl = w.toLowerCase();
    if (tk === wl) return true;
    if (SINHALA.test(tk) || SINHALA.test(wl)) return false;     // Sinhala: exact only
    return wl.length >= 4 && tk.length >= 4 && levenshtein(tk, wl) <= 1; // "nima" / "nimah" / "nimaa"
  });
}

export interface WakeMatch { matched: boolean; rest: string }

/** Looks for "[hey|ok] nimah <command>" at the start of the sentence. */
export function matchWakeWord(text: string, extra: string[] = []): WakeMatch {
  const words = [...DEFAULT_WAKE_WORDS, ...extra];
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.min(3, tokens.length); i++) {
    if (isWakeToken(tokens[i], words)) {
      const before = tokens.slice(0, i);
      if (before.every((x) => FILLERS.has(clean(x).toLowerCase()))) {
        return { matched: true, rest: tokens.slice(i + 1).join(' ').replace(/^[,.:;\-\s]+/, '').trim() };
      }
      return { matched: false, rest: text.trim() };
    }
  }
  return { matched: false, rest: text.trim() };
}

export interface GateInput { text: string; enabled: boolean; activeUntil: number; now: number; extraWords?: string[] }
export interface GateResult { accept: boolean; text: string; wakeOnly: boolean }

/** Decides whether a recognised sentence is for Nimah. */
export function gateWake({ text, enabled, activeUntil, now, extraWords = [] }: GateInput): GateResult {
  const t = text.trim();
  if (!enabled) return { accept: t.length > 0, text: t, wakeOnly: false };
  const m = matchWakeWord(t, extraWords);
  if (m.matched) {
    if (!m.rest) return { accept: false, text: '', wakeOnly: true };
    return { accept: true, text: m.rest, wakeOnly: false };
  }
  if (now < activeUntil) return { accept: t.length > 0, text: t, wakeOnly: false };
  return { accept: false, text: '', wakeOnly: false };
}

export const extendWindow = (now: number, ms = CONVERSATION_WINDOW_MS) => now + ms;
