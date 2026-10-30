// Hands-free camera: open, (selfie), countdown, press the shutter. Pure flow with an injected API.
import { findElementByLabel, findOcrLine, OcrLine } from './screenmatch';

export interface CameraCmd { mode: 'photo' | 'selfie' | 'video' | 'stop_video'; delay: number }

const DELAY = /(?:in|after|within|timer)?\s*(\d{1,2})\s*(?:seconds?|secs?|s\b)|තත්පර\s*(\d{1,2})/i;

export function parseCamera(input: string): CameraCmd | null {
  const t = input.trim().toLowerCase().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/, '').replace(/[.!?]+$/, '').trim();
  const d = DELAY.exec(t);
  const delay = d ? Math.min(10, Number(d[1] ?? d[2])) : 0;
  if (/\b(?:stop|end)\s+(?:the\s+)?(?:recording|video)\b|වීඩියෝව නවත්වන්න/.test(t)) return { mode: 'stop_video', delay: 0 };
  if (/\bselfie\b|සෙල්ෆි/.test(t) && /\b(?:take|click|snap|capture|ගන්න)\b|ගන්න|එකක්/.test(t)) return { mode: 'selfie', delay };
  if (/\b(?:record|start recording|take|shoot)\s+(?:a\s+)?video\b|video (?:එකක් )?(?:ගන්න|record කරන්න)|වීඩියෝ (?:එකක් )?ගන්න/.test(t)) return { mode: 'video', delay };
  if (/\b(?:take|click|snap|capture)\s+(?:a\s+)?(?:photo|picture|pic)\b|photo (?:එකක් )?ගන්න|ෆොටෝ (?:එකක් )?ගන්න|ඡායාරූපයක් ගන්න/.test(t)) return { mode: 'photo', delay };
  return null;
}

export const SHUTTER_LABELS = ['shutter', 'take photo', 'take picture', 'capture', 'camera shutter'];
export const VIDEO_LABELS = ['start recording', 'record video', 'record', 'video shutter'];
export const STOP_LABELS = ['stop recording', 'stop', 'stop video'];
export const FLIP_LABELS = ['switch camera', 'flip camera', 'front camera', 'selfie camera', 'rotate camera', 'switch to front'];

export interface CameraApi {
  openCamera(mode: 'photo' | 'video'): Promise<unknown>;
  screenText(): Promise<string>;
  tapId(id: number): Promise<boolean>;
  ocr(): Promise<OcrLine[]>;
  tapXY(x: number, y: number): Promise<boolean>;
  say(text: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

async function tapAny(labels: string[], api: CameraApi): Promise<boolean> {
  const text = await api.screenText();
  for (const l of labels) {
    const el = findElementByLabel(text, l);
    if (el && (await api.tapId(el.id))) return true;
  }
  const lines = await api.ocr().catch(() => []);
  for (const l of labels) {
    const hit = findOcrLine(lines, l);
    if (hit && (await api.tapXY(hit.x, hit.y))) return true;
  }
  return false;
}

export async function runCamera(cmd: CameraCmd, api: CameraApi, si: boolean): Promise<string> {
  const fail = si ? 'Camera එකේ shutter බොත්තම හොයාගන්න බැරි වුණා.' : "I couldn't find the camera button.";
  if (cmd.mode === 'stop_video') return (await tapAny(STOP_LABELS, api)) ? (si ? 'Video එක නැවැත්තුවා.' : 'Recording stopped.') : fail;
  await api.openCamera(cmd.mode === 'video' ? 'video' : 'photo');
  await api.sleep(2000);
  if (cmd.mode === 'selfie') await tapAny(FLIP_LABELS, api);
  for (let i = cmd.delay; i > 0; i--) { await api.say(String(i)); await api.sleep(250); }
  const ok = await tapAny(cmd.mode === 'video' ? VIDEO_LABELS : SHUTTER_LABELS, api);
  if (!ok) return fail;
  if (cmd.mode === 'video') return si ? 'Video record කරනවා. නවත්වන්න "stop recording" කියන්න.' : 'Recording. Say "stop recording" to finish.';
  return si ? 'Photo එක ගත්තා සර්.' : 'Photo taken, sir.';
}
