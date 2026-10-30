// Device voice commands that need no AI: calls, media, numbered overlay, alarm, camera, dictation,
// emergency, routines, screen description. Returns the sentence to speak, or null when not handled.
import { ALARM_BUTTON_LABELS, parseAlarmControl } from './alarmctl';
import { parseCallCommand } from './calls';
import { CameraApi, parseCamera, runCamera } from './camera';
import { applyDictation, DICTATE_TRIGGER } from './dictation';
import { parseContacts, parseEmergency, runEmergency } from './emergency';
import { parseMedia } from './media';
import { parseNumberCommand } from './numbers';
import { parseRoutineCommand, remove, Routine, upsert } from './routines';
import { findElementByLabel, OcrLine } from './screenmatch';

export interface DeviceNative {
  answerCall(): Promise<boolean>;
  endCall(): Promise<boolean>;
  setSpeaker(on: boolean): Promise<boolean>;
  setMute(on: boolean): Promise<boolean>;
  mediaKey(name: string): Promise<boolean>;
  showNumbers(): Promise<number>;
  hideNumbers(): Promise<boolean>;
  tapNumber(n: number, long: boolean): Promise<boolean>;
  alarmControl(action: string, minutes: number): Promise<boolean>;
  openCamera(mode: 'photo' | 'video'): Promise<boolean>;
  screenRead(): Promise<{ text: string }>;
  uiClick(id: number, long: boolean): Promise<boolean>;
  uiType(id: number, text: string, submit: boolean): Promise<boolean>;
  uiGesture(x1: number, y1: number, x2: number, y2: number, ms: number): Promise<boolean>;
  ocrScreen(): Promise<OcrLine[]>;
  getLocation(): Promise<{ lat: number; lng: number } | null>;
  sendSms(phone: string, message: string, countryCode: string, autoSend: boolean): Promise<boolean>;
  callNumber(phone: string, countryCode: string): Promise<boolean>;
  screenshot(): Promise<string | null>;
}

export interface DeviceCtx {
  si: boolean;
  native: DeviceNative;
  overlay: { get(): boolean; set(v: boolean): void };
  ask: (question: string) => Promise<string | null>;
  say: (text: string) => Promise<void>;
  confirm: (question: string) => Promise<boolean>;
  describe: (imageBase64: string, si: boolean) => Promise<string>;
  emergencyContacts: string;
  countryCode: string;
  routines: { load(): Promise<Routine[]>; save(r: Routine[]): Promise<void> };
  sleep?: (ms: number) => Promise<void>;
}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function tapLabel(ctx: DeviceCtx, labels: string[]): Promise<boolean> {
  const screen = (await ctx.native.screenRead().catch(() => ({ text: '' }))).text;
  for (const l of labels) {
    const el = findElementByLabel(screen, l);
    if (el && (await ctx.native.uiClick(el.id, false))) return true;
  }
  return false;
}

async function dictate(ctx: DeviceCtx): Promise<string> {
  const { si, native } = ctx;
  let buffer = '';
  let silent = 0;
  let utter = await ctx.ask(si ? 'කියන්න, මම ටයිප් කරන්නම්. ඉවර වුණාම "ඉවරයි", යවන්න "යවන්න" කියන්න.' : 'Go ahead, I will type. Say "done" when finished or "send" to send.');
  for (let i = 0; i < 40; i++) {
    if (utter === null) {
      silent += 1;
      if (silent >= 2) return si ? 'හරි, ටයිප් කිරීම නැවැත්තුවා.' : 'Okay, dictation stopped.';
      utter = await ctx.ask('');
      continue;
    }
    silent = 0;
    const r = applyDictation(buffer, utter);
    buffer = r.buffer;
    const ok = await native.uiType(-1, buffer, r.action === 'send');
    if (!ok) return si ? 'ටයිප් කරන්න text box එකක් තෝරලා නැහැ. එකක් ඔබලා නැවත කියන්න.' : 'No text box is selected. Tap one and try again.';
    if (r.action === 'cancel') return si ? 'හරි, මකලා දැම්මා.' : 'Okay, cleared.';
    if (r.action === 'done') return si ? 'ටයිප් කළා.' : 'Typed.';
    if (r.action === 'send') return si ? 'යැව්වා.' : 'Sent.';
    utter = await ctx.ask('');
  }
  return si ? 'ටයිප් කළා.' : 'Typed.';
}

export async function runDeviceCommand(input: string, ctx: DeviceCtx): Promise<string | null> {
  const { si, native } = ctx;
  const r = (sinhala: string, english: string) => (si ? sinhala : english);
  const text = input.trim();
  if (!text) return null;

  // 1) Emergency (works without a wake word; always has a cancel window)
  if (parseEmergency(text)) {
    return runEmergency({
      contacts: parseContacts(ctx.emergencyContacts),
      ask: ctx.ask,
      getLocation: () => native.getLocation(),
      sendSms: (p, m) => native.sendSms(p, m, ctx.countryCode, true),
      call: (p) => native.callNumber(p, ctx.countryCode),
    }, si);
  }

  // 2) Phone calls
  const call = parseCallCommand(text);
  if (call) {
    if (call === 'answer') return (await native.answerCall()) ? r('call එක ගත්තා.', 'Answered.') : r('call එක ගන්න බැරි වුණා. "Answer phone calls" අවසරය දෙන්න.', "I couldn't answer. Allow the phone-calls permission.");
    if (call === 'reject') return (await native.endCall()) ? r('call එක කැපුවා.', 'Call ended.') : r('call එක කපන්න බැරි වුණා (Android 9+ ඕනේ).', "I couldn't end the call (needs Android 9+).");
    if (call === 'speaker_on' || call === 'speaker_off') {
      const on = call === 'speaker_on';
      const ok = (await native.setSpeaker(on)) || (await tapLabel(ctx, ['speaker', 'loudspeaker']));
      return ok ? r(`Speaker ${on ? 'on' : 'off'} කළා.`, `Speaker ${on ? 'on' : 'off'}.`) : r('Speaker මාරු කරන්න බැරි වුණා.', "I couldn't switch the speaker.");
    }
    const on = call === 'mute_on';
    return (await native.setMute(on)) ? r(`Mic ${on ? 'mute' : 'unmute'} කළා.`, `Microphone ${on ? 'muted' : 'unmuted'}.`) : r('බැරි වුණා.', "I couldn't do that.");
  }

  // 3) Media + volume keys
  const media = parseMedia(text);
  if (media) {
    const ok = await native.mediaKey(media);
    const say: Record<string, [string, string]> = {
      play: ['Play කළා.', 'Playing.'], pause: ['Pause කළා.', 'Paused.'], next: ['ඊළඟ එකට.', 'Next.'], previous: ['කලින් එකට.', 'Previous.'], stop: ['නැවැත්තුවා.', 'Stopped.'],
      volume_up: ['හඬ වැඩි කළා.', 'Volume up.'], volume_down: ['හඬ අඩු කළා.', 'Volume down.'], mute: ['Mute කළා.', 'Muted.'], unmute: ['Unmute කළා.', 'Unmuted.'],
    };
    return ok ? r(say[media][0], say[media][1]) : r('බැරි වුණා.', "I couldn't do that.");
  }

  // 4) Numbered overlay: "show numbers", "tap 5"
  const num = parseNumberCommand(text, ctx.overlay.get());
  if (num) {
    if (num.type === 'show') {
      const n = await native.showNumbers();
      ctx.overlay.set(n > 0);
      return n > 0 ? r(`අංක ${n}ක් පෙන්නුවා. "5 ඔබන්න" වගේ කියන්න.`, `Showing ${n} numbers. Say "tap 5".`) : r('ඔබන්න පුළුවන් දෙයක් හම්බවුණේ නැහැ.', 'I found nothing tappable.');
    }
    if (num.type === 'hide') { await native.hideNumbers(); ctx.overlay.set(false); return r('අංක සැඟවුවා.', 'Numbers hidden.'); }
    const ok = await native.tapNumber(num.n, num.long);
    await native.hideNumbers().catch(() => false);
    ctx.overlay.set(false);
    return ok ? r(`${num.n} ඔබලා දැම්මා.`, `Tapped ${num.n}.`) : r(`${num.n} අංකය හම්බවුණේ නැහැ. "show numbers" කියලා නැවත බලන්න.`, `Number ${num.n} not found. Say "show numbers" again.`);
  }

  // 5) Alarm stop / snooze
  const alarm = parseAlarmControl(text);
  if (alarm) {
    const minutes = alarm.action === 'snooze' ? alarm.minutes : 0;
    let ok = await native.alarmControl(alarm.action, minutes).catch(() => false);
    if (!ok) ok = await tapLabel(ctx, ALARM_BUTTON_LABELS[alarm.action]);
    if (alarm.action === 'snooze') return ok ? r(`විනාඩි ${minutes}කින් නැවත.`, `Snoozed for ${minutes} minutes.`) : r('Snooze කරන්න බැරි වුණා.', "I couldn't snooze it.");
    return ok ? r('Alarm එක නැවැත්තුවා.', 'Alarm stopped.') : r('Alarm එක නවත්වන්න බැරි වුණා.', "I couldn't stop the alarm.");
  }

  // 6) Camera
  const cam = parseCamera(text);
  if (cam) {
    const sleep = ctx.sleep ?? sleepReal;
    const api: CameraApi = {
      openCamera: (m) => native.openCamera(m),
      screenText: async () => (await native.screenRead()).text,
      tapId: (id) => native.uiClick(id, false),
      ocr: () => native.ocrScreen(),
      tapXY: (x, y) => native.uiGesture(x, y, x, y, 60),
      say: ctx.say,
      sleep,
    };
    return runCamera(cam, api, si);
  }

  // 7) Dictation
  if (DICTATE_TRIGGER.test(text)) return dictate(ctx);

  // 8) Routines (create / delete / list). Running one is handled by the assistant (it needs the step runner).
  const rc = parseRoutineCommand(text);
  if (rc) {
    const list = await ctx.routines.load();
    if (rc.type === 'create') {
      await ctx.routines.save(upsert(list, { name: rc.name, steps: rc.steps }));
      return r(`"${rc.name}" routine එක සුරැකුවා: ${rc.steps.join(', ')}. "${rc.name}" කියලා run කරන්න.`, `Saved routine "${rc.name}": ${rc.steps.join(', ')}. Say "${rc.name}" to run it.`);
    }
    if (rc.type === 'delete') {
      if (!list.some((x) => x.name === rc.name)) return r('ඒ routine එක නැහැ.', 'I have no routine with that name.');
      await ctx.routines.save(remove(list, rc.name));
      return r('Routine එක මැකුවා.', 'Routine deleted.');
    }
    return list.length ? r(`Routines: ${list.map((x) => x.name).join(', ')}.`, `Your routines: ${list.map((x) => x.name).join(', ')}.`) : r('තවම routines නැහැ.', 'You have no routines yet.');
  }

  // 9) Describe the screen with Gemini vision (asks first: the picture leaves the phone)
  if (/^(?:describe (?:my |the )?screen|what (?:do you see|am i looking at)|screen (?:එක )?විස්තර කරන්න|මොනවද පේන්නේ)[.?!]*$/i.test(text)) {
    if (!(await ctx.confirm(r('Screenshot එක විස්තර කරන්න Gemini ට යවන්නද?', 'Send a screenshot to Gemini so it can describe the screen?')))) return r('හරි, යැව්වේ නැහැ.', 'Okay, nothing was sent.');
    const shot = await native.screenshot();
    if (!shot) return r('Screenshot එක ගන්න බැරි වුණා (Android 11+ සහ phone control on ඕනේ).', "I couldn't take a screenshot (needs Android 11+ and phone control on).");
    return ctx.describe(shot, si);
  }
  return null;
}
