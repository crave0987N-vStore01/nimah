// Notes, tasks and reminders as plain immutable data helpers (persisted by storage.ts).
export interface Note { id: string; text: string; ts: number }
export interface Task { id: string; text: string; done: boolean; ts: number }
export interface Reminder { id: string; text: string; at: number }
export interface Data { notes: Note[]; tasks: Task[]; reminders: Reminder[] }
export const EMPTY: Data = { notes: [], tasks: [], reminders: [] };

const uid = (now: number, n: number) => `${now.toString(36)}${n.toString(36)}`;

export const addNote = (d: Data, text: string, now = Date.now()): Data =>
  ({ ...d, notes: [{ id: uid(now, d.notes.length), text: text.trim(), ts: now }, ...d.notes] });
export const editNote = (d: Data, id: string, text: string): Data =>
  ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, text: text.trim() } : n)) });
export const deleteNote = (d: Data, id: string): Data => ({ ...d, notes: d.notes.filter((n) => n.id !== id) });
export const searchNotes = (d: Data, q: string): Note[] => {
  const k = q.trim().toLowerCase();
  return k ? d.notes.filter((n) => n.text.toLowerCase().includes(k)) : d.notes;
};

export const addTask = (d: Data, text: string, now = Date.now()): Data =>
  ({ ...d, tasks: [...d.tasks, { id: uid(now, d.tasks.length), text: text.trim(), done: false, ts: now }] });
export const editTask = (d: Data, id: string, text: string): Data =>
  ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, text: text.trim() } : t)) });
export const completeTask = (d: Data, id: string): Data =>
  ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)) });
export const deleteTask = (d: Data, id: string): Data => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) });
export const openTasks = (d: Data) => d.tasks.filter((t) => !t.done);

export const addReminder = (d: Data, text: string, at: number, now = Date.now()): Data =>
  ({ ...d, reminders: [...d.reminders, { id: uid(now, d.reminders.length), text: text.trim(), at }].sort((a, b) => a.at - b.at) });
export const cancelReminder = (d: Data, id: string): Data => ({ ...d, reminders: d.reminders.filter((r) => r.id !== id) });
export const upcomingReminders = (d: Data, now = Date.now()) => d.reminders.filter((r) => r.at > now);
export const pruneReminders = (d: Data, now = Date.now()): Data => ({ ...d, reminders: upcomingReminders(d, now) });

/** 1-based index lookups for voice commands like "complete task 2". */
export const nth = <T,>(list: T[], n: number): T | undefined => (n >= 1 && n <= list.length ? list[n - 1] : undefined);
