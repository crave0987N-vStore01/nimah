// Message review step: the user must explicitly confirm before WhatsApp/SMS is opened.
export type ReviewChoice = 'send' | 'edit' | 'cancel';

const CANCEL = /\b(cancel|no|stop|don'?t|abort|never ?mind)\b|එපා|අවලංගු|නවත්වන්න|නෑ|නැහැ/i;
const EDIT = /\b(edit|change|modify|rewrite|redo|fix)\b|වෙනස්|එඩිට්|වෙනස් කරන්න|ආයෙ ලියන්න/i;
const SEND = /\b(send|yes|yeah|ok|okay|confirm|go ahead|do it|sure)\b|යවන්න|යවමු|හරි|ඔව්|ඔවු|කන්ෆර්ම්/i;

export function parseReviewReply(spoken: string): ReviewChoice | null {
  const t = spoken.trim();
  if (!t) return null;
  if (CANCEL.test(t)) return 'cancel';
  if (EDIT.test(t)) return 'edit';
  if (SEND.test(t)) return 'send';
  return null;
}

/** Honest status line: opening WhatsApp is NOT proof the message was sent. */
export function handoffReply(si: boolean, app: 'WhatsApp' | 'SMS', autoTapped: boolean): string {
  if (si) return autoTapped
    ? `${app} හි Send එබුවා. නමුත් පණිවිඩය ගියාද කියා මට තහවුරු කරන්න බැහැ සර්.`
    : `${app} විවෘත කළා, පණිවිඩය සූදානම්. Send එක ඔබන්න සර්. ගියාද කියා මට තහවුරු කරන්න බැහැ.`;
  return autoTapped
    ? `I tapped Send in ${app}, sir, but I cannot confirm it was delivered.`
    : `${app} is open with your message ready, sir. Please tap Send. I cannot confirm delivery.`;
}
