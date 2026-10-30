import { parseAlarmControl } from '../src/services/alarmctl';
import { callAnnouncement, parseCallCommand } from '../src/services/calls';
import { parseCamera, runCamera } from '../src/services/camera';
import { DeviceCtx, DeviceNative, runDeviceCommand } from '../src/services/commands';
import { applyDictation } from '../src/services/dictation';
import { buildEmergencySms, isCancel, parseContacts, parseEmergency, runEmergency } from '../src/services/emergency';
import { announceMessage, Dedupe, parseReplyDecision } from '../src/services/incoming';
import { parseMedia } from '../src/services/media';
import { parseNumberCommand } from '../src/services/numbers';
import { matchRoutine, parseRoutineCommand, remove, upsert } from '../src/services/routines';
import { parseHardware, runHardware } from '../src/services/hardware';

describe('calls', () => {
  it('answer / reject / speaker', () => {
    ['answer', 'answer the call', 'pick up', 'call එක ගන්න', 'ෆෝන් එක ගන්න'].forEach((x) => expect(parseCallCommand(x)).toBe('answer'));
    ['reject', 'hang up', 'decline the call', 'call එක කපන්න', 'cut කරන්න'].forEach((x) => expect(parseCallCommand(x)).toBe('reject'));
    expect(parseCallCommand('speaker on')).toBe('speaker_on');
    expect(parseCallCommand('speaker off')).toBe('speaker_off');
    expect(parseCallCommand('unmute')).toBe('mute_off');
    expect(parseCallCommand('answer the question about maths')).toBeNull();
  });
  it('announces the caller', () => {
    expect(callAnnouncement('Kamal', '077', false)).toBe('Kamal is calling. Answer or reject?');
    expect(callAnnouncement('', '', false)).toMatch(/unknown/);
  });
});

describe('messages', () => {
  const m = { key: 'k', app: 'WhatsApp', pkg: 'com.whatsapp', sender: 'Kamal', text: 'come now', locked: false, canReply: true };
  it('never reads the text on a locked phone', () => {
    expect(announceMessage(m, false)).toBe('Kamal: come now. Reply?');
    expect(announceMessage({ ...m, locked: true }, false)).toBe('New message from Kamal. Reply?');
    expect(announceMessage({ ...m, canReply: false }, false)).toBe('Kamal: come now.');
  });
  it('reply decisions + dedupe', () => {
    expect(parseReplyDecision('yes')).toBe('reply');
    expect(parseReplyDecision('ඔව්')).toBe('reply');
    expect(parseReplyDecision('ignore')).toBe('ignore');
    expect(parseReplyDecision('එපා')).toBe('ignore');
    expect(parseReplyDecision('read again')).toBe('repeat');
    expect(parseReplyDecision('banana')).toBeNull();
    const d = new Dedupe();
    expect(d.fresh('a', 1000)).toBe(true);
    expect(d.fresh('a', 2000)).toBe(false);
    expect(d.fresh('a', 20000)).toBe(true);
  });
});

describe('dictation', () => {
  it('builds text with punctuation and edit commands', () => {
    let b = applyDictation('', 'hello there').buffer;
    b = applyDictation(b, 'how are you question mark').buffer;
    expect(b).toBe('hello there how are you?');
    expect(applyDictation(b, 'delete last word').buffer).toBe('hello there how are');
    expect(applyDictation('a b', 'new line').buffer).toBe('a b\n');
    expect(applyDictation('x', 'send').action).toBe('send');
    expect(applyDictation('x', 'ඉවරයි').action).toBe('done');
    expect(applyDictation('x', 'cancel')).toEqual({ buffer: '', action: 'cancel' });
    expect(applyDictation('hi', 'comma bye').buffer).toBe('hi, bye');
  });
});

describe('numbers / media / alarm / camera parsing', () => {
  it('numbers', () => {
    expect(parseNumberCommand('show numbers', false)).toEqual({ type: 'show' });
    expect(parseNumberCommand('hide numbers', true)).toEqual({ type: 'hide' });
    expect(parseNumberCommand('tap 5', false)).toEqual({ type: 'tap', n: 5, long: false });
    expect(parseNumberCommand('click number twelve', false)).toEqual({ type: 'tap', n: 12, long: false });
    expect(parseNumberCommand('7 ඔබන්න', false)).toEqual({ type: 'tap', n: 7, long: false });
    expect(parseNumberCommand('long press 3', false)).toEqual({ type: 'tap', n: 3, long: true });
    expect(parseNumberCommand('5', false)).toBeNull();
    expect(parseNumberCommand('5', true)).toEqual({ type: 'tap', n: 5, long: false });
  });
  it('media', () => {
    expect(parseMedia('pause')).toBe('pause');
    expect(parseMedia('next song')).toBe('next');
    expect(parseMedia('ඊළඟ සින්දුව')).toBe('next');
    expect(parseMedia('volume up')).toBe('volume_up');
    expect(parseMedia('play despacito')).toBeNull();
  });
  it('alarm control', () => {
    expect(parseAlarmControl('stop the alarm')).toEqual({ action: 'dismiss' });
    expect(parseAlarmControl('snooze')).toEqual({ action: 'snooze', minutes: 10 });
    expect(parseAlarmControl('snooze 5 minutes')).toEqual({ action: 'snooze', minutes: 5 });
  });
  it('camera', () => {
    expect(parseCamera('take a photo')).toEqual({ mode: 'photo', delay: 0 });
    expect(parseCamera('take a selfie in 5 seconds')).toEqual({ mode: 'selfie', delay: 5 });
    expect(parseCamera('photo එකක් ගන්න')).toEqual({ mode: 'photo', delay: 0 });
    expect(parseCamera('record a video')).toEqual({ mode: 'video', delay: 0 });
    expect(parseCamera('stop recording')).toEqual({ mode: 'stop_video', delay: 0 });
    expect(parseCamera('open camera')).toBeNull();
  });
  it('runs the camera flow: open, count down, tap the shutter', async () => {
    const log: string[] = [];
    const reply = await runCamera({ mode: 'photo', delay: 2 }, {
      openCamera: async (m) => { log.push(`open ${m}`); },
      screenText: async () => '[0] ImageView "Shutter" (tap) @500,2000\n[1] ImageView "Gallery" (tap) @100,2000',
      tapId: async (id) => { log.push(`tap ${id}`); return true; },
      ocr: async () => [], tapXY: async () => false,
      say: async (t) => { log.push(`say ${t}`); }, sleep: async () => {},
    }, false);
    expect(log).toEqual(['open photo', 'say 2', 'say 1', 'tap 0']);
    expect(reply).toMatch(/Photo taken/);
  });
});

describe('routines', () => {
  it('creates, matches, lists and deletes', () => {
    const c = parseRoutineCommand('create routine good morning: wifi on, brightness 80, read my briefing');
    expect(c).toEqual({ type: 'create', name: 'good morning', steps: ['wifi on', 'brightness 80', 'read my briefing'] });
    expect(parseRoutineCommand('delete routine good morning')).toEqual({ type: 'delete', name: 'good morning' });
    expect(parseRoutineCommand('list routines')).toEqual({ type: 'list' });
    const list = upsert([], { name: 'good morning', steps: ['wifi on'] });
    expect(matchRoutine('Good morning', list)?.steps).toEqual(['wifi on']);
    expect(matchRoutine('run routine good morning', list)).not.toBeNull();
    expect(matchRoutine('good evening', list)).toBeNull();
    expect(remove(list, 'good morning')).toEqual([]);
  });
});

describe('emergency', () => {
  it('triggers and cancels', () => {
    ['help', 'Emergency', 'උදව්', 'හදිසියි', 'help me'].forEach((x) => expect(parseEmergency(x)).toBe(true));
    expect(parseEmergency('help me find a restaurant')).toBe(false);
    expect(isCancel('cancel')).toBe(true);
    expect(isCancel('එපා')).toBe(true);
    expect(isCancel(null)).toBe(false);
    expect(parseContacts('0771234567, 011 2345678;x')).toEqual(['0771234567', '011 2345678']);
    expect(buildEmergencySms({ lat: 6.9, lng: 79.8 }, false)).toContain('maps.google.com/?q=6.90000,79.80000');
  });
  it('sends to everyone then calls the first, unless cancelled', async () => {
    const sent: string[] = []; const called: string[] = [];
    const api = (ans: string | null) => ({
      contacts: ['0771', '0772'], ask: async () => ans, getLocation: async () => null,
      sendSms: async (p: string) => { sent.push(p); }, call: async (p: string) => { called.push(p); },
    });
    expect(await runEmergency(api('cancel'), false)).toMatch(/cancelled/);
    expect(sent).toEqual([]);
    expect(await runEmergency(api(null), false)).toMatch(/Alert sent to 2/);
    expect(sent).toEqual(['0771', '0772']);
    expect(called).toEqual(['0771']);
    expect(await runEmergency({ ...api(null), contacts: [] }, false)).toMatch(/No emergency contacts/);
  });
});

describe('more hardware toggles', () => {
  it('parses', () => {
    expect(parseHardware('airplane mode on')).toEqual({ kind: 'airplane', on: true });
    expect(parseHardware('turn off hotspot')).toEqual({ kind: 'hotspot', on: false });
    expect(parseHardware('do not disturb on')).toEqual({ kind: 'dnd', on: true });
    expect(parseHardware('auto rotate off')).toEqual({ kind: 'rotate', on: false });
    expect(parseHardware('mobile data on')).toEqual({ kind: 'mobiledata', on: true });
    expect(parseHardware('location off')).toEqual({ kind: 'location', on: false });
    expect(parseHardware('open location settings')).toBeNull();
  });
  it('runs and explains missing permission', async () => {
    const base = { setWifi: async () => 'done', setBluetooth: async () => 'done', getBrightness: async () => 50, setBrightness: async () => 'done' };
    expect(await runHardware({ kind: 'airplane', on: true }, { ...base, setToggle: async () => 'done' }, false)).toMatch(/Airplane mode turned on/);
    expect(await runHardware({ kind: 'dnd', on: true }, { ...base, setToggle: async () => 'needs_permission' }, false)).toMatch(/Do Not Disturb access/);
  });
});

describe('runDeviceCommand', () => {
  const calls: string[] = [];
  const native = new Proxy({}, {
    get: (_t, name: string) => async (...a: unknown[]) => {
      calls.push(`${name}(${a.join(',')})`);
      if (name === 'showNumbers') return 4;
      if (name === 'screenRead') return { text: '[0] Button "Dismiss" (tap) @1,1' };
      if (name === 'screenshot') return 'b64';
      if (name === 'alarmControl') return false;
      return true;
    },
  }) as unknown as DeviceNative;
  let overlay = false; let routines: any[] = [];
  const ctx = (over: Partial<DeviceCtx> = {}): DeviceCtx => ({
    si: false, native, overlay: { get: () => overlay, set: (v) => { overlay = v; } },
    ask: async () => null, say: async () => {}, confirm: async () => true, describe: async () => 'A video app.',
    emergencyContacts: '', countryCode: '94', routines: { load: async () => routines, save: async (r) => { routines = r; } }, sleep: async () => {}, ...over,
  });
  beforeEach(() => { calls.length = 0; });

  it('handles calls, media, numbers and falls back to tapping the alarm button', async () => {
    expect(await runDeviceCommand('answer', ctx())).toBe('Answered.');
    expect(await runDeviceCommand('next song', ctx())).toBe('Next.');
    expect(await runDeviceCommand('show numbers', ctx())).toMatch(/4 numbers/);
    expect(overlay).toBe(true);
    expect(await runDeviceCommand('tap 3', ctx())).toBe('Tapped 3.');
    expect(overlay).toBe(false);
    expect(await runDeviceCommand('stop the alarm', ctx())).toBe('Alarm stopped.');
    expect(calls).toContain('uiClick(0,false)');
  });
  it('describes the screen only after consent', async () => {
    expect(await runDeviceCommand('describe my screen', ctx())).toBe('A video app.');
    expect(await runDeviceCommand('describe my screen', ctx({ confirm: async () => false }))).toMatch(/nothing was sent/);
  });
  it('dictates into the focused field', async () => {
    const answers = ['hello world', 'send'];
    const typed: string[] = [];
    const n = new Proxy(native, { get: (t, k: string) => (k === 'uiType' ? async (_i: number, text: string, submit: boolean) => { typed.push(`${text}|${submit}`); return true; } : (t as any)[k]) });
    const first = await runDeviceCommand('dictate', ctx({ native: n, ask: async () => answers.shift() ?? null }));
    expect(first).toBe('Sent.');
    expect(typed).toEqual(['hello world|false', 'hello world|true']);
  });
  it('saves a routine by voice and ignores unrelated text', async () => {
    expect(await runDeviceCommand('create routine night: wifi off, brightness 10', ctx())).toMatch(/Saved routine "night"/);
    expect(routines).toHaveLength(1);
    expect(await runDeviceCommand('what is the capital of France', ctx())).toBeNull();
  });
  it('emergency uses the configured contacts', async () => {
    const r = await runDeviceCommand('help', ctx({ emergencyContacts: '0771234567', ask: async () => null }));
    expect(r).toMatch(/Alert sent to 1/);
    expect(calls.some((c) => c.startsWith('callNumber(0771234567'))).toBe(true);
  });
});
