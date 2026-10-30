import { runLocal, LocalCtx, buildBriefing } from '../src/services/local';
import { EMPTY, Data, addTask, addNote } from '../src/services/notes';

function make(over: Partial<LocalCtx> = {}, start: Data = EMPTY) {
  let data = start; const calls: string[] = [];
  const ctx: LocalCtx = {
    locale: 'en-US', now: () => new Date(2026, 9, 30, 10, 0, 0), lastReply: 'last words', featureCount: 99,
    data: async () => data, save: async (d) => { data = d; },
    confirm: async () => true, newChat: () => { calls.push('newChat'); }, share: async (t) => { calls.push(`share:${t}`); },
    native: {
      openSettings: async (p) => { calls.push(`settings:${p}`); }, openUrl: async (u) => { calls.push(`url:${u}`); },
      setVolume: async (p) => { calls.push(`vol:${p}`); }, setTimer: async (s) => { calls.push(`timer:${s}`); },
      setAlarm: async (h, m) => { calls.push(`alarm:${h}:${m}`); }, deviceInfo: async () => ({ battery: 77, charging: true }),
      screenRead: async () => ({ text: 'Mail a@b.com or call 0771234567', package: 'x' }),
      scheduleReminder: async (id) => { calls.push(`rem:${id}`); }, cancelReminder: async (id) => { calls.push(`unrem:${id}`); },
    },
    ...over,
  };
  return { ctx, calls, get: () => data };
}

describe('runLocal', () => {
  it('math, convert, percent', async () => {
    const { ctx } = make();
    expect(await runLocal('calculate 12 * (3 + 4)', ctx)).toBe('84');
    expect(await runLocal('what is 15% of 240', ctx)).toBe('15% of 240 = 36');
    expect(await runLocal('convert 100 c to f', ctx)).toBe('100 c = 212 f');
    expect(await runLocal('sum of 4 8 15', ctx)).toBe('sum = 27');
    expect(await runLocal('average of 2 4', ctx)).toBe('average = 3');
    expect(await runLocal('count words in hello big world', ctx)).toBe('3 words.');
    expect(await runLocal('title case: hello world', ctx)).toBe('Hello World');
    expect(await runLocal('random number between 3 and 3', ctx)).toBe('3');
  });
  it('does not hijack normal sentences', async () => {
    const { ctx } = make();
    expect(await runLocal('tell me a story about a king', ctx)).toBeNull();
    expect(await runLocal('send a whatsapp to Kamal', ctx)).toBeNull();
    expect(await runLocal('', ctx)).toBeNull();
  });
  it('repeat / new chat / share / time / battery', async () => {
    const { ctx, calls } = make();
    expect(await runLocal('repeat', ctx)).toBe('last words');
    await runLocal('new conversation', ctx);
    await runLocal('share that', ctx);
    expect(calls).toEqual(['newChat', 'share:last words']);
    expect(await runLocal('what time is it', ctx)).toMatch(/10:00 AM/);
    expect(await runLocal('battery', ctx)).toMatch(/77%/);
  });
  it('notes and tasks lifecycle', async () => {
    const { ctx, get } = make();
    await runLocal('note: buy milk', ctx);
    expect(get().notes[0].text).toBe('buy milk');
    expect(await runLocal('show notes', ctx)).toBe('1. buy milk');
    expect(await runLocal('search notes milk', ctx)).toBe('1. buy milk');
    await runLocal('edit note 1 to buy tea', ctx);
    expect(get().notes[0].text).toBe('buy tea');
    await runLocal('delete note 1', ctx);
    expect(get().notes).toHaveLength(0);
    await runLocal('add task pay bill', ctx);
    await runLocal('checklist: eggs, bread and tea', ctx);
    expect(get().tasks.map((t) => t.text)).toEqual(['pay bill', 'eggs', 'bread', 'tea']);
    await runLocal('complete task 1', ctx);
    expect(await runLocal('my tasks', ctx)).toBe('1. eggs 2. bread 3. tea');
    await runLocal('edit task 1 to boiled eggs', ctx);
    await runLocal('delete task 1', ctx);
    expect(get().tasks.filter((t) => !t.done).map((t) => t.text)).toEqual(['bread', 'tea']);
  });
  it('delete respects a "no" confirmation', async () => {
    const { ctx, get } = make({ confirm: async () => false }, addNote(EMPTY, 'keep me', 1));
    expect(await runLocal('delete note 1', ctx)).toBe('Cancelled.');
    expect(get().notes).toHaveLength(1);
  });
  it('reminders schedule natively and can be cancelled', async () => {
    const { ctx, calls, get } = make();
    expect(await runLocal('remind me to call Kamal in 10 minutes', ctx)).toMatch(/10:10 AM/);
    expect(get().reminders).toHaveLength(1);
    expect(calls[0]).toMatch(/^rem:/);
    expect(await runLocal('my reminders', ctx)).toMatch(/call Kamal/);
    await runLocal('cancel reminder 1', ctx);
    expect(get().reminders).toHaveLength(0);
    expect(await runLocal('remind me to sleep', ctx)).toMatch(/When should I remind you/);
  });
  it('timer, alarm, settings, volume, web', async () => {
    const { ctx, calls } = make();
    await runLocal('timer 5 minutes', ctx);
    await runLocal('set alarm at 6:30 am', ctx);
    await runLocal('open wifi settings', ctx);
    await runLocal('volume 40', ctx);
    await runLocal('search for rain forecast', ctx);
    await runLocal('open example.com', ctx);
    expect(calls).toEqual(['timer:300', 'alarm:6:30', 'settings:wifi', 'vol:40',
      'url:https://www.google.com/search?q=rain%20forecast', 'url:https://example.com']);
  });
  it('screen helpers', async () => {
    const { ctx } = make();
    expect(await runLocal('read my screen', ctx)).toMatch(/Mail a@b.com/);
    expect(await runLocal('find emails on screen', ctx)).toBe('a@b.com');
    expect(await runLocal('find phone numbers on my screen', ctx)).toBe('0771234567');
  });
  it('sinhala', async () => {
    const { ctx } = make({ locale: 'si-LK' });
    expect(await runLocal('වෙලාව කීයද', ctx)).toMatch(/සර්/);
  });
  it('briefing', () => {
    const d = addTask(EMPTY, 'pay bill', 1);
    expect(buildBriefing(d, new Date(2026, 9, 30, 8, 0), false)).toMatch(/1 open task: pay bill/);
  });
});
