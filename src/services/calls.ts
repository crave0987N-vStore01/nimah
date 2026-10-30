// Phone-call voice control (pure parsing; native side = NimahModule.kt + CallReceiver.kt).
export type CallCmd = 'answer' | 'reject' | 'speaker_on' | 'speaker_off' | 'mute_on' | 'mute_off';

const clean = (s: string) => s.trim().toLowerCase().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/i, '').replace(/[.!?]+$/, '').trim();

export function parseCallCommand(input: string): CallCmd | null {
  const t = clean(input);
  if (!t) return null;
  if (/^(?:answer|accept|pick up|take)(?: (?:the |this )?(?:call|phone|it))?$/.test(t) || /(?:call|phone|ෆෝන්)\s*(?:එක)?\s*(?:ගන්න|answer කරන්න|ඇන්සර් කරන්න)$|^(?:answer|ඇන්සර්|උත්තර) (?:කරන්න|දෙන්න)$|^ෆෝන් එක ගන්න$/.test(t)) return 'answer';
  if (/^(?:reject|decline|hang ?up|end|cut|disconnect|drop)(?: (?:the |this )?(?:call|it))?$/.test(t) || /(?:call|කෝල්|ෆෝන්)\s*(?:එක)?\s*(?:කට් කරන්න|කපන්න|reject කරන්න|තියන්න|cut කරන්න)$|^(?:reject|cut|කට්) (?:කරන්න)$/.test(t)) return 'reject';
  if (/^(?:put (?:it |the call )?on )?(?:the )?(?:loud ?speaker|speaker)(?: (?:on|phone))?$|^speaker (?:එක )?(?:on|ඔන්)(?: කරන්න)?$|^(?:loud ?speaker)/.test(t)) return 'speaker_on';
  if (/^(?:speaker|loud ?speaker) (?:off|එක off|ඕෆ්)(?: කරන්න)?$|^(?:turn off|switch off) (?:the )?(?:loud ?)?speaker$/.test(t)) return 'speaker_off';
  if (/^mute (?:me|the call|my mic(?:rophone)?)$/.test(t)) return 'mute_on';
  if (/^unmute(?: me| the call| my mic(?:rophone)?)?$/.test(t)) return 'mute_off';
  return null;
}

export function callAnnouncement(name: string, number: string, si: boolean): string {
  const who = name || number || (si ? 'නොදන්නා අංකයක්' : 'an unknown number');
  return si ? `${who} ගෙන් call එකක්. ගන්නද, කපන්නද?` : `${who} is calling. Answer or reject?`;
}
