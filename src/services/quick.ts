// Instant, offline command matching: the most common requests skip the Gemini round-trip entirely
// (saves 2-4 seconds). Anything unusual or multi-step returns null and goes to the AI as before.
import { Intent, Locale } from '../types';

const base = (): Intent => ({
  action: 'unknown', app: 'none', recipient: null, message: null, target: null,
  hour: null, minute: null, duration_seconds: null, state: null, spoken_reply: '',
});

const clean = (s: string) => s.replace(/[.,!?"“”]/g, ' ').replace(/\s+/g, ' ').trim();
const MULTI = /\b(and|then|after|also)\b|,| සහ | ඊට පස්සේ/i;
// These need the AI (it knows how to drive Settings screens, toggles, ...).
const NOT_AN_APP = /wi-?fi|bluetooth|accessibility|notification|volume|brightness|airplane|hotspot|data|settings? page|screenshot/i;

function appName(raw: string): string | null {
  const n = raw.replace(/^(the|my|app|application)\s+/i, '').replace(/\s+(app|application)$/i, '').trim();
  if (n.length < 2 || n.length > 30 || n.split(' ').length > 3 || NOT_AN_APP.test(n) || MULTI.test(n)) return null;
  return n;
}

const OPEN_EN = /^(?:(?:hey |ok |okay |please |can you |could you )+)?(?:open|launch|start|run)\s+(.+)$/i;
// "tiktok open karanna", "whatsapp ඕපන් කරන්න", "camera අරින්න"
const OPEN_SI = /^(.+?)\s+(?:open|ඕපන්|විවෘත|ඇරපන්|අරින්න|අරින්|ඇරලා|ඕපන් කරන්න)(?:\s*(?:karanna|karapan|karamu|කරන්න|කරපන්|කරමු|කරලා))?$/i;

const TORCH = /(?:torch|flash\s?light|ටෝච්|ෆ්ලෑෂ්|ෆ්ලෑෂ් ලයිට්)/i;
const ON = /\b(?:on|dapan|danna|dala)\b|දාන්න|දාපන්|දල්වන්න|ඔන්|ඔන් කරන්න/i;
const OFF = /\b(?:off|nivapan|niwanna|nivanna)\b|නිවන්න|නිවපන්|ඕෆ්/i;

/** Returns a ready-to-run Intent for a simple command, or null if the AI should decide. */
export function quickIntent(text: string, locale: Locale): Intent | null {
  const t = clean(text);
  if (!t || t.length > 60) return null;
  const si = locale === 'si-LK' || /[\u0D80-\u0DFF]/.test(t);

  if (TORCH.test(t) && !MULTI.test(t)) {
    const off = OFF.test(t), on = ON.test(t);
    if (on === off) return null;                       // unclear -> let the AI ask
    return { ...base(), action: 'flashlight', app: 'system', state: on ? 'on' : 'off',
      spoken_reply: si ? (on ? 'ටෝච් එක දැල්වුවා.' : 'ටෝච් එක නිවුවා.') : (on ? 'Torch on.' : 'Torch off.') };
  }

  const m = t.match(OPEN_EN) ?? t.match(OPEN_SI);
  if (m) {
    const name = appName(m[1]);
    if (name) {
      return { ...base(), action: 'open_app', app: 'system', target: name,
        spoken_reply: si ? `${name} ඕපන් කරනවා.` : `Opening ${name}.` };
    }
  }
  return null;
}
