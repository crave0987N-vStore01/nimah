// Offline command router. Handles everyday commands WITHOUT the internet or Gemini.
// Returns the sentence to speak, or null when the AI should handle the request.
import { Locale } from '../types';
import {
  addNote, addReminder, addTask, cancelReminder, completeTask, Data, deleteNote, deleteTask, editNote, editTask,
  nth, openTasks, searchNotes, upcomingReminders,
} from './notes';
import { parseWhen } from './parseTime';
import {
  average, charCount, convert, evalMath, extractContacts, extractNumbers, fmtNum, formatDate, formatDuration, formatTime,
  percentOf, randomInt, sentenceCase, sum, titleCase, wordCount,
} from './utilities';

export interface LocalCtx {
  locale: Locale;
  now: () => Date;
  lastReply: string;
  featureCount: number;
  data: () => Promise<Data>;
  save: (d: Data) => Promise<void>;
  confirm: (question: string) => Promise<boolean>;
  newChat: () => void;
  share: (text: string) => Promise<void>;
  native: {
    openSettings: (page: string) => Promise<unknown>;
    openUrl: (url: string) => Promise<unknown>;
    setVolume: (percent: number, stream: string) => Promise<unknown>;
    setTimer: (seconds: number, label: string) => Promise<unknown>;
    setAlarm: (hour: number, minute: number, label: string) => Promise<unknown>;
    deviceInfo: () => Promise<{ battery: number; charging: boolean }>;
    screenRead: () => Promise<{ text: string; package: string }>;
    scheduleReminder: (id: string, atMillis: number, text: string) => Promise<unknown>;
    cancelReminder: (id: string) => Promise<unknown>;
  };
}

const SETTINGS_PAGES = ['wifi', 'wi-fi', 'bluetooth', 'sound', 'display', 'battery', 'location', 'date', 'accessibility', 'apps', 'storage'];

export function buildBriefing(d: Data, now: Date, si: boolean): string {
  const tasks = openTasks(d);
  const rem = upcomingReminders(d, now.getTime()).filter((r) => new Date(r.at).toDateString() === now.toDateString());
  const parts: string[] = [];
  parts.push(si ? `අද ${formatDate(now, 'long')}, වෙලාව ${formatTime(now)}.` : `Today is ${formatDate(now, 'long')}, ${formatTime(now)}.`);
  parts.push(tasks.length
    ? (si ? `වැඩ ${tasks.length}ක් ඉතිරියි: ${tasks.slice(0, 3).map((t) => t.text).join(', ')}.` : `You have ${tasks.length} open task${tasks.length > 1 ? 's' : ''}: ${tasks.slice(0, 3).map((t) => t.text).join(', ')}.`)
    : (si ? 'ඉතිරි වැඩ නැහැ.' : 'No open tasks.'));
  parts.push(rem.length
    ? (si ? `අද මතක් කිරීම් ${rem.length}ක්: ${rem.map((r) => `${formatTime(new Date(r.at))} ${r.text}`).join(', ')}.` : `${rem.length} reminder${rem.length > 1 ? 's' : ''} today: ${rem.map((r) => `${r.text} at ${formatTime(new Date(r.at))}`).join(', ')}.`)
    : (si ? 'අද මතක් කිරීම් නැහැ.' : 'No reminders today.'));
  return parts.join(' ');
}

export async function runLocal(input: string, ctx: LocalCtx): Promise<string | null> {
  const raw = input.trim().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/i, '').replace(/[.!?]+$/, '').trim();
  if (!raw) return null;
  const si = ctx.locale === 'si-LK' || /[\u0D80-\u0DFF]/.test(raw);
  const r = (sinhala: string, english: string) => (si ? sinhala : english);
  const lower = raw.toLowerCase();
  const now = ctx.now();
  let m: RegExpExecArray | null;

  // ---- conversation ----
  if (/^(?:repeat(?: that)?|say (?:that )?again|again)$/.test(lower) || /නැවත කියන්න|ආයෙ කියන්න|ආයෙත් කියන්න/.test(raw))
    return ctx.lastReply || r('කියන්න කිසිවක් නැහැ සර්.', 'There is nothing to repeat yet, sir.');
  if (/^(?:new (?:chat|conversation)|start over|reset chat)$/.test(lower) || /අලුත් සංවාදය/.test(raw)) {
    ctx.newChat(); return r('අලුත් සංවාදයක් පටන් ගත්තා සර්.', 'Started a new conversation, sir.');
  }
  if (/^share (?:that|this|it)$/.test(lower)) {
    if (!ctx.lastReply) return r('බෙදාගන්න දෙයක් නැහැ.', 'Nothing to share yet.');
    await ctx.share(ctx.lastReply); return r('Share මෙනුව විවෘත කළා.', 'Opened the share sheet.');
  }
  if (/^(?:what can you do|help|features|show features)$/.test(lower))
    return r(`මට built-in හැකියාවන් ${ctx.featureCount}ක් තියෙනවා සර්. Features බොත්තම එබුවාම සම්පූර්ණ ලැයිස්තුව පෙනේවි.`,
      `I have ${ctx.featureCount} built-in capabilities, sir. Tap Features to see the full list.`);

  // ---- time / date / battery ----
  if (/^(?:what(?:'s| is) the time|what time is it|time|current time)$/.test(lower) || /වෙලාව|වේලාව/.test(raw))
    return r(`දැන් වෙලාව ${formatTime(now)} සර්.`, `It is ${formatTime(now)}, sir.`);
  if (/^(?:what(?:'s| is)(?: the| today's)? date(?: today)?|today'?s date|date|what day is it)$/.test(lower) || /අද දිනය|අද මොන දවසද/.test(raw))
    return r(`අද ${formatDate(now, 'long')}.`, `Today is ${formatDate(now, 'long')}.`);
  if (m = /^format date (\d{4}-\d{2}-\d{2})$/.exec(lower)) {
    const d = new Date(`${m[1]}T00:00:00`);
    if (Number.isNaN(d.getTime())) return r('දිනය වැරදියි.', 'That date is not valid.');
    return `${formatDate(d, 'dmy')} · ${formatDate(d, 'mdy')} · ${formatDate(d, 'long')}`;
  }
  if (/^(?:battery|battery (?:level|status)|how much battery)/.test(lower) || /බැටරි/.test(raw)) {
    const info = await ctx.native.deviceInfo();
    return r(`බැටරිය ${info.battery}%${info.charging ? ', charge වෙනවා' : ''}.`, `Battery is at ${info.battery}%${info.charging ? ' and charging' : ''}.`);
  }
  if (/^(?:morning )?briefing$|^what(?:'s| is) my (?:day|plan|schedule)(?: today)?$|^my day$/.test(lower))
    return buildBriefing(await ctx.data(), now, si);

  // ---- calculations ----
  if (m = /^(\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*(\d+(?:\.\d+)?)$/.exec(lower.replace(/^what(?:'s| is)\s+/, '')))
    return `${m[1]}% of ${m[2]} = ${fmtNum(percentOf(parseFloat(m[1]), parseFloat(m[2])))}`;
  if (m = /^(?:convert\s+|what(?:'s| is)\s+)?(-?\d+(?:\.\d+)?)\s*([a-z°℃℉/]+)\s+(?:to|in|into)\s+([a-z°℃℉/]+)$/.exec(lower)) {
    const v = convert(parseFloat(m[1]), m[2], m[3]);
    if (v !== null) return `${m[1]} ${m[2]} = ${fmtNum(v)} ${m[3]}`;
  }
  if (m = /^(sum|total|average|mean)\s+(?:of\s+)?(.+)$/.exec(lower)) {
    const nums = extractNumbers(m[2]);
    if (nums.length >= 2 && /^[\d\s,.\-and]+$/.test(m[2])) {
      const v = m[1] === 'sum' || m[1] === 'total' ? sum(nums) : average(nums)!;
      return `${m[1]} = ${fmtNum(v)}`;
    }
  }
  if (m = /^count\s+(words?|characters?|chars?|letters?)\s+(?:in|of)\s+(.+)$/i.exec(raw))
    return /^w/i.test(m[1]) ? r(`වචන ${wordCount(m[2])}ක්.`, `${wordCount(m[2])} words.`) : r(`අකුරු ${charCount(m[2])}ක්.`, `${charCount(m[2])} characters.`);
  if (m = /^random number(?:\s+between\s+(-?\d+)\s+and\s+(-?\d+))?$/.exec(lower))
    return String(m[1] !== undefined ? randomInt(parseInt(m[1], 10), parseInt(m[2], 10)) : randomInt(1, 100));
  if (m = /^(uppercase|lowercase|title case|sentence case)\s*:?\s+(.+)$/i.exec(raw)) {
    const k = m[1].toLowerCase();
    return k === 'uppercase' ? m[2].toUpperCase() : k === 'lowercase' ? m[2].toLowerCase() : k === 'title case' ? titleCase(m[2]) : sentenceCase(m[2]);
  }
  {
    const expr = lower.replace(/^(?:calculate|calc|compute|what(?:'s| is)|how much is)\s+/, '');
    if (/[+\-*/^%×÷]|\bplus\b|\bminus\b|\btimes\b|\bdivided by\b|\bmultiplied by\b/.test(expr) && /\d/.test(expr) && !/\b(?:remind|task|note|alarm|timer)\b/.test(expr)) {
      const v = evalMath(expr);
      if (v !== null) return `${fmtNum(v)}`;
    }
  }

  // ---- notes ----
  if (m = /^(?:take a note|add (?:a )?note|save (?:a )?note|note)\s*[:,-]?\s+(.+)$/i.exec(raw)) {
    await ctx.save(addNote(await ctx.data(), m[1], now.getTime()));
    return r('Note එක සේව් කළා සර්.', 'Note saved, sir.');
  }
  if (/^(?:show|list|read)\s+(?:my\s+)?notes$/.test(lower)) {
    const d = await ctx.data();
    return d.notes.length ? d.notes.slice(0, 5).map((n, i) => `${i + 1}. ${n.text}`).join(' ') : r('Notes නැහැ.', 'You have no notes.');
  }
  if (m = /^search notes\s+(?:for\s+)?(.+)$/.exec(lower)) {
    const hits = searchNotes(await ctx.data(), m[1]);
    return hits.length ? hits.slice(0, 5).map((n, i) => `${i + 1}. ${n.text}`).join(' ') : r('ගැලපෙන note නැහැ.', 'No matching notes.');
  }
  if (m = /^edit note (\d+)\s*(?:to|:)\s*(.+)$/i.exec(raw)) {
    const d = await ctx.data(); const n = nth(d.notes, parseInt(m[1], 10));
    if (!n) return r('ඒ note එක නැහැ.', 'I could not find that note.');
    await ctx.save(editNote(d, n.id, m[2])); return r('Note එක වෙනස් කළා.', 'Note updated.');
  }
  if (m = /^delete note (\d+)$/.exec(lower)) {
    const d = await ctx.data(); const n = nth(d.notes, parseInt(m[1], 10));
    if (!n) return r('ඒ note එක නැහැ.', 'I could not find that note.');
    if (!(await ctx.confirm(r(`"${n.text}" මකන්නද?`, `Delete the note "${n.text}"?`)))) return r('අවලංගු කළා.', 'Cancelled.');
    await ctx.save(deleteNote(d, n.id)); return r('Note එක මැකුවා.', 'Note deleted.');
  }

  // ---- tasks ----
  if (m = /^(?:add (?:a )?task|new task|task)\s*[:,-]?\s+(.+)$/i.exec(raw)) {
    await ctx.save(addTask(await ctx.data(), m[1], now.getTime())); return r('Task එක එකතු කළා සර්.', 'Task added, sir.');
  }
  if (/^(?:show|list|what are)\s+(?:my\s+)?tasks$/.test(lower) || /^my tasks$/.test(lower)) {
    const t = openTasks(await ctx.data());
    return t.length ? t.slice(0, 7).map((x, i) => `${i + 1}. ${x.text}`).join(' ') : r('ඉතිරි tasks නැහැ.', 'You have no open tasks.');
  }
  if (m = /^(?:complete|finish|done)\s+task\s+(\d+)$/.exec(lower)) {
    const d = await ctx.data(); const t = nth(openTasks(d), parseInt(m[1], 10));
    if (!t) return r('ඒ task එක නැහැ.', 'I could not find that task.');
    await ctx.save(completeTask(d, t.id)); return r('Task එක අවසන් කළා.', 'Task completed.');
  }
  if (m = /^edit task (\d+)\s*(?:to|:)\s*(.+)$/i.exec(raw)) {
    const d = await ctx.data(); const t = nth(openTasks(d), parseInt(m[1], 10));
    if (!t) return r('ඒ task එක නැහැ.', 'I could not find that task.');
    await ctx.save(editTask(d, t.id, m[2])); return r('Task එක වෙනස් කළා.', 'Task updated.');
  }
  if (m = /^delete task (\d+)$/.exec(lower)) {
    const d = await ctx.data(); const t = nth(openTasks(d), parseInt(m[1], 10));
    if (!t) return r('ඒ task එක නැහැ.', 'I could not find that task.');
    if (!(await ctx.confirm(r(`"${t.text}" මකන්නද?`, `Delete the task "${t.text}"?`)))) return r('අවලංගු කළා.', 'Cancelled.');
    await ctx.save(deleteTask(d, t.id)); return r('Task එක මැකුවා.', 'Task deleted.');
  }
  if (m = /^checklist\s*:?\s+(.+)$/i.exec(raw)) {
    const items = m[1].split(/\s*(?:,|;| and )\s*/).filter(Boolean);
    let d = await ctx.data(); items.forEach((t, i) => { d = addTask(d, t, now.getTime() + i); });
    await ctx.save(d); return r(`Checklist එකේ items ${items.length}ක් එකතු කළා.`, `Added ${items.length} checklist items to your tasks.`);
  }

  // ---- reminders / timer / alarm ----
  if (m = /^remind me\s+(?:to\s+)?(.+)$/i.exec(raw)) {
    const when = parseWhen(m[1], now);
    if (!when || !when.rest) return r('කවදාද මතක් කරන්න ඕනේ සර්? (උදා: in 10 minutes, at 5 pm)', 'When should I remind you, sir? (for example: in 10 minutes, or at 5 pm)');
    const d = addReminder(await ctx.data(), when.rest, when.at.getTime(), now.getTime());
    const rem = d.reminders.find((x) => x.text === when.rest && x.at === when.at.getTime())!;
    await ctx.native.scheduleReminder(rem.id, rem.at, rem.text);
    await ctx.save(d);
    return r(`හරි සර්, ${formatTime(when.at)} ට මතක් කරන්නම්.`, `Okay sir, I will remind you at ${formatTime(when.at)}.`);
  }
  if (/^(?:my|show|list|upcoming)\s+reminders$/.test(lower)) {
    const rem = upcomingReminders(await ctx.data(), now.getTime());
    return rem.length ? rem.slice(0, 5).map((x, i) => `${i + 1}. ${x.text} ${formatTime(new Date(x.at))}`).join('. ') : r('මතක් කිරීම් නැහැ.', 'You have no upcoming reminders.');
  }
  if (m = /^cancel reminder (\d+)$/.exec(lower)) {
    const d = await ctx.data(); const x = nth(upcomingReminders(d, now.getTime()), parseInt(m[1], 10));
    if (!x) return r('ඒ මතක් කිරීම නැහැ.', 'I could not find that reminder.');
    await ctx.native.cancelReminder(x.id); await ctx.save(cancelReminder(d, x.id)); return r('මතක් කිරීම අවලංගු කළා.', 'Reminder cancelled.');
  }
  if (m = /^(?:set\s+)?(?:a\s+)?timer(?:\s+for)?\s+(.+)$/i.exec(raw)) {
    const w = parseWhen(/^\d/.test(m[1]) ? `in ${m[1]}` : m[1], now);
    if (w?.relativeSeconds) { await ctx.native.setTimer(Math.round(w.relativeSeconds), 'Nimah'); return r(`Timer එක ${formatDuration(w.relativeSeconds)}ට සකස් කළා.`, `Timer set for ${formatDuration(w.relativeSeconds)}.`); }
  }
  if (m = /^(?:set\s+)?(?:an?\s+)?alarm\s+(?:for|at)\s+(.+)$/i.exec(raw)) {
    const w = parseWhen(`at ${m[1]}`, now);
    if (w) { await ctx.native.setAlarm(w.at.getHours(), w.at.getMinutes(), 'Nimah'); return r(`Alarm එක ${formatTime(w.at)} ට සකස් කළා.`, `Alarm set for ${formatTime(w.at)}.`); }
  }

  // ---- device ----
  if (m = /^open\s+(wi-?fi|bluetooth|sound|display|battery|location|date|accessibility|apps|storage)(?:\s+settings)?$/.exec(lower)) {
    const page = m[1].replace('wi-fi', 'wifi');
    if (SETTINGS_PAGES.includes(m[1])) { await ctx.native.openSettings(page); return r(`${m[1]} settings විවෘත කළා.`, `Opened ${m[1]} settings.`); }
  }
  if (m = /^(?:set\s+)?volume\s+(?:to\s+)?(\d{1,3})\s*%?$/.exec(lower)) {
    const v = Math.min(100, parseInt(m[1], 10)); await ctx.native.setVolume(v, 'music'); return r(`Volume ${v}% කළා.`, `Volume set to ${v}%.`);
  }
  if (m = /^(?:search|google|look up)\s+(?:the web\s+)?(?:for\s+)?(.+)$/i.exec(raw)) {
    await ctx.native.openUrl(`https://www.google.com/search?q=${encodeURIComponent(m[1])}`); return r('Search කළා.', `Searching the web for ${m[1]}.`);
  }
  if (m = /^(?:open|go to)\s+((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?)$/i.exec(raw)) {
    await ctx.native.openUrl(/^https?:/i.test(m[1]) ? m[1] : `https://${m[1]}`); return r('Link එක විවෘත කළා.', 'Opened the link.');
  }

  // ---- screen ----
  if (/^(?:read|what(?:'s| is) on)\s+(?:my\s+)?(?:the\s+)?screen$/.test(lower) || /තිරයේ (?:මොනවාද|කියවන්න)/.test(raw)) {
    const s = await ctx.native.screenRead();
    const txt = (s.text ?? '').replace(/\s+/g, ' ').trim();
    return txt ? txt.slice(0, 600) : r('තිරයේ කියවන්න text නැහැ, නැත්නම් Accessibility ක්‍රියාත්මක නැහැ.', 'I found no readable text, or the accessibility service is off.');
  }
  if (m = /^find\s+(phone numbers?|emails?|links?)\s+on\s+(?:my\s+)?screen$/.exec(lower)) {
    const c = extractContacts((await ctx.native.screenRead()).text ?? '');
    const list = /^phone/.test(m[1]) ? c.phones : /^email/.test(m[1]) ? c.emails : c.urls;
    return list.length ? list.slice(0, 5).join(', ') : r('කිසිවක් හමු වුණේ නැහැ.', 'I found none on the screen.');
  }
  return null;
}
