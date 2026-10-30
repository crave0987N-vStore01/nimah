// "Show numbers" overlay + "tap 5" (pure parsing).
export type NumberCmd = { type: 'show' } | { type: 'hide' } | { type: 'tap'; n: number; long: boolean };

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const num = (s: string): number | null => (/^\d{1,3}$/.test(s) ? Number(s) : WORDS[s] ?? null);

export function parseNumberCommand(input: string, overlayOn: boolean): NumberCmd | null {
  const t = input.trim().toLowerCase().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/, '').replace(/[.!?]+$/, '').trim();
  if (/^(?:show|display|turn on|give me)\s+(?:the\s+)?numbers?(?: on (?:the )?screen)?$|^number (?:the )?(?:screen|buttons)$|^අංක (?:පෙන්නන්න|දාන්න)$/.test(t)) return { type: 'show' };
  if (/^(?:hide|remove|turn off|clear)\s+(?:the\s+)?numbers?$|^අංක (?:සඟවන්න|අයින් කරන්න)$/.test(t)) return { type: 'hide' };
  let m = /^(?:(long)\s*(?:press|tap)|tap|click|press|select|open|choose)\s+(?:number\s+|අංක\s+)?(\w{1,8})$/.exec(t);
  if (m && num(m[2]) !== null) return { type: 'tap', n: num(m[2])!, long: !!m[1] };
  m = /^(?:number|අංක)\s+(\w{1,8})$/.exec(t);
  if (m && num(m[1]) !== null) return { type: 'tap', n: num(m[1])!, long: false };
  m = /^(\d{1,3})\s*(?:ඔබන්න|click කරන්න|tap කරන්න|තෝරන්න)$/.exec(t);
  if (m) return { type: 'tap', n: Number(m[1]), long: false };
  if (overlayOn && num(t) !== null) return { type: 'tap', n: num(t)!, long: false };
  return null;
}
