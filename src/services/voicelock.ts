// Voice lock decision logic (pure, unit-tested). The audio maths lives in VoicePrint.kt.
//
// HONEST LIMITS — these are shown in the app as well:
//  * Android has no built-in speaker-verification API. Nimah uses a small statistical voiceprint
//    (MFCC features, on-device, no neural model). It is a CONVENIENCE filter, not authentication.
//  * A recording or a voice-cloning tool can fool it; noise and a cold make real owners fail.
//  * Therefore sensitive actions ALWAYS need the phone's own fingerprint / face / PIN as well.

import { ActionName } from '../types';

export type VoiceDecision = 'match' | 'reject' | 'unavailable' | 'not_enrolled';
export type GateOutcome = 'allow' | 'needDeviceAuth';

export const SENSITIVITY_MIN = 1;
export const SENSITIVITY_MAX = 5;
/** Minimum similarity (0..1) per sensitivity level. Higher level = stricter = more false rejects. */
const THRESHOLDS = [0.35, 0.45, 0.55, 0.65, 0.75];
export const thresholdFor = (sensitivity: number): number =>
  THRESHOLDS[Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, Math.round(sensitivity))) - 1];

/** score < 0 means "no usable audio" (the OS did not let us capture while the recogniser ran). */
export function decideVoice(score: number | undefined, sensitivity: number, enrolled: boolean): VoiceDecision {
  if (!enrolled) return 'not_enrolled';
  if (score === undefined || !Number.isFinite(score) || score < 0) return 'unavailable';
  return score >= thresholdFor(sensitivity) ? 'match' : 'reject';
}

/** Actions that move data out of the phone or act on other people. */
export const SENSITIVE_ACTIONS: ActionName[] = ['send_whatsapp', 'send_sms'];
export const isSensitiveAction = (a: ActionName) => SENSITIVE_ACTIONS.includes(a);

/** Remembers a successful device unlock for a short time so the owner is not asked every sentence. */
export class AuthSession {
  private until = 0;
  grant(now: number, ms = 60_000) { this.until = now + ms; }
  valid(now: number) { return now < this.until; }
  clear() { this.until = 0; }
}

export interface GateInput { voiceLock: boolean; decision: VoiceDecision; sensitive: boolean; sessionValid: boolean }

/**
 * Policy:
 *  - lock off, or voiceprint not enrolled  -> allow (nothing to check)
 *  - sensitive action                      -> device unlock, even after a voice match
 *  - voice matches                         -> allow
 *  - voice rejected / unavailable          -> device unlock (soft factor: owner with a cold can still proceed)
 */
export function gateCommand({ voiceLock, decision, sensitive, sessionValid }: GateInput): GateOutcome {
  if (!voiceLock || decision === 'not_enrolled') return 'allow';
  if (sessionValid) return 'allow';
  if (sensitive) return 'needDeviceAuth';
  return decision === 'match' ? 'allow' : 'needDeviceAuth';
}

export const ENROLL_SAMPLES = 4;
export const ENROLL_SECONDS = 4;
export const ENROLL_PHRASES = {
  en: ['Hey Nimah, what time is it today?', 'Nimah, open the camera and take a photo.', 'Please set an alarm for six thirty in the morning.', 'Call my mother and tell her I will be late.'],
  si: ['නිමා, අද වෙලාව කීයද?', 'නිමා, camera එක open කරලා photo එකක් ගන්න.', 'හෙට උදේ හයහමාරට alarm එකක් දාන්න.', 'අම්මට call එකක් අරන් මම පරක්කු වෙනවා කියන්න.'],
};
