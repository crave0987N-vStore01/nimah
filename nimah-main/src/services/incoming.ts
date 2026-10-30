// Incoming messages read aloud + voice reply (pure helpers). Reply is sent through the notification's own
// reply action (RemoteInput), so it works for WhatsApp / SMS / Telegram without opening the app.
export const MESSAGING_PACKAGES = [
  'com.whatsapp', 'com.whatsapp.w4b', 'com.google.android.apps.messaging', 'com.android.mms',
  'com.samsung.android.messaging', 'org.telegram.messenger', 'com.facebook.orca', 'org.thoughtcrime.securesms',
];
export const isMessagePackage = (pkg: string) => MESSAGING_PACKAGES.includes(pkg);

export interface IncomingMessage { key: string; app: string; pkg: string; sender: string; text: string; locked: boolean; canReply: boolean }

/** Never reads the text out on a locked phone (privacy). */
export function announceMessage(m: IncomingMessage, si: boolean): string {
  const body = m.text.replace(/\s+/g, ' ').slice(0, 220);
  if (m.locked || !body) return si ? `${m.sender} ගෙන් අලුත් පණිවිඩයක්. ${m.canReply ? 'reply කරන්නද?' : ''}`.trim() : `New message from ${m.sender}. ${m.canReply ? 'Reply?' : ''}`.trim();
  return si ? `${m.sender}: ${body}. ${m.canReply ? 'reply කරන්නද?' : ''}`.trim() : `${m.sender}: ${body}. ${m.canReply ? 'Reply?' : ''}`.trim();
}

export type ReplyDecision = 'reply' | 'ignore' | 'repeat';
export function parseReplyDecision(input: string): ReplyDecision | null {
  const t = input.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(?:again|repeat|read (?:it )?again|නැවත කියන්න|ආයෙ කියන්න)$/.test(t)) return 'repeat';
  if (/^(?:no|nope|ignore|skip|later|not now|එපා|නැහැ|නෑ|පස්සේ|ඕනේ නැහැ)(?=\s|$)/.test(t)) return 'ignore';
  if (/^(?:yes|yeah|ok|okay|reply|respond|answer|sure|ඔව්|හරි|reply කරන්න|උත්තර දෙන්න)(?=\s|$)/.test(t)) return 'reply';
  return null;
}

/** Ignores duplicates (apps re-post the same notification) within [gapMs]. */
export class Dedupe {
  private seen = new Map<string, number>();
  fresh(id: string, now: number, gapMs = 8000): boolean {
    const last = this.seen.get(id);
    this.seen.set(id, now);
    if (this.seen.size > 50) for (const [k, v] of this.seen) if (now - v > 60_000) this.seen.delete(k);
    return last === undefined || now - last > gapMs;
  }
}
