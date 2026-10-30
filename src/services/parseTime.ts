// Parses spoken times like "in 10 minutes", "after 2 hours", "at 7:30 pm", "tomorrow at 8".
export interface Parsed { at: Date; rest: string; relativeSeconds?: number }

const UNIT_S: Record<string, number> = {
  second: 1, seconds: 1, sec: 1, secs: 1, තත්පර: 1, minute: 60, minutes: 60, min: 60, mins: 60, විනාඩි: 60, විනාඩිය: 60,
  hour: 3600, hours: 3600, hr: 3600, hrs: 3600, පැය: 3600, day: 86400, days: 86400, දවස්: 86400,
};

export function parseWhen(text: string, now: Date): Parsed | null {
  // relative: "in 10 minutes", "after 2 hours", "විනාඩි 10 කින්"
  let m = /\b(?:in|after)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/i.exec(text)
    ?? /([\u0D80-\u0DFF]+)\s*(\d+)\s*(?:කින්|ට පස්සේ)/.exec(text);
  if (m) {
    const isSi = /[\u0D80-\u0DFF]/.test(m[1]);
    const n = parseFloat(isSi ? m[2] : m[1]);
    const unit = (isSi ? m[1] : m[2]).toLowerCase();
    const mult = UNIT_S[unit];
    if (mult && n > 0) {
      const secs = n * mult;
      return { at: new Date(now.getTime() + secs * 1000), rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim(), relativeSeconds: secs };
    }
  }
  // clock time: "at 7", "at 7:30 pm", "7pm"
  m = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text) ?? /\bat\s+(\d{1,2})(?::(\d{2}))?\b/i.exec(text);
  if (m) {
    let h = parseInt(m[1], 10); const min = m[2] ? parseInt(m[2], 10) : 0; const mer = m[3]?.toLowerCase();
    if (min > 59 || h > 23) return null;
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    const at = new Date(now); at.setSeconds(0, 0); at.setHours(h, min);
    if (/\btomorrow\b/i.test(text)) at.setDate(at.getDate() + 1);
    else if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    return { at, rest: text.replace(m[0], ' ').replace(/\btomorrow\b/i, ' ').replace(/\s+/g, ' ').trim() };
  }
  return null;
}
