export type AlarmCtl = { action: 'dismiss' } | { action: 'snooze'; minutes: number };

export function parseAlarmControl(input: string): AlarmCtl | null {
  const t = input.trim().toLowerCase().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/, '').replace(/[.!?]+$/, '').trim();
  if (/^(?:stop|dismiss|turn off|silence|cancel)\s+(?:the\s+)?alarm$|^alarm\s+(?:off|stop)$|^alarm (?:එක )?(?:නවත්වන්න|off කරන්න)$/.test(t)) return { action: 'dismiss' };
  let m = /^snooze(?: (?:for )?(\d{1,2})(?: minutes?| mins?)?)?$/.exec(t) ?? /^(?:විනාඩි|මිනිත්තු)\s*(\d{1,2})\s*(?:කින්|ක්)?\s*(?:පස්සේ|snooze)/.exec(t);
  if (m) return { action: 'snooze', minutes: Math.min(60, Math.max(1, Number(m[1] ?? 10))) };
  return null;
}
export const ALARM_BUTTON_LABELS = { dismiss: ['dismiss', 'stop', 'turn off', 'swipe to stop'], snooze: ['snooze'] };
