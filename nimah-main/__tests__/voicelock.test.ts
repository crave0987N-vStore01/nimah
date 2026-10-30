import { AuthSession, decideVoice, gateCommand, isSensitiveAction, thresholdFor } from '../src/services/voicelock';

describe('voice lock policy', () => {
  it('threshold grows with sensitivity and is clamped', () => {
    expect(thresholdFor(1)).toBeLessThan(thresholdFor(3));
    expect(thresholdFor(3)).toBeLessThan(thresholdFor(5));
    expect(thresholdFor(0)).toBe(thresholdFor(1));
    expect(thresholdFor(99)).toBe(thresholdFor(5));
  });
  it('decides match / reject / unavailable / not enrolled', () => {
    expect(decideVoice(0.9, 3, true)).toBe('match');
    expect(decideVoice(0.2, 3, true)).toBe('reject');
    expect(decideVoice(-1, 3, true)).toBe('unavailable');
    expect(decideVoice(undefined, 3, true)).toBe('unavailable');
    expect(decideVoice(0.9, 3, false)).toBe('not_enrolled');
  });
  it('is a soft factor: a mismatch asks for the phone unlock, it does not hard-block', () => {
    const base = { voiceLock: true, sensitive: false, sessionValid: false };
    expect(gateCommand({ ...base, decision: 'match' })).toBe('allow');
    expect(gateCommand({ ...base, decision: 'reject' })).toBe('needDeviceAuth');
    expect(gateCommand({ ...base, decision: 'unavailable' })).toBe('needDeviceAuth');
  });
  it('sensitive actions ALWAYS need device unlock, even after a voice match', () => {
    expect(gateCommand({ voiceLock: true, decision: 'match', sensitive: true, sessionValid: false })).toBe('needDeviceAuth');
    expect(gateCommand({ voiceLock: true, decision: 'match', sensitive: true, sessionValid: true })).toBe('allow');
    expect(isSensitiveAction('send_whatsapp')).toBe(true);
    expect(isSensitiveAction('send_sms')).toBe(true);
    expect(isSensitiveAction('open_app')).toBe(false);
  });
  it('lock off or not enrolled = nothing to check', () => {
    expect(gateCommand({ voiceLock: false, decision: 'reject', sensitive: true, sessionValid: false })).toBe('allow');
    expect(gateCommand({ voiceLock: true, decision: 'not_enrolled', sensitive: true, sessionValid: false })).toBe('allow');
  });
  it('device unlock is remembered only briefly', () => {
    const s = new AuthSession();
    expect(s.valid(1000)).toBe(false);
    s.grant(1000, 60_000);
    expect(s.valid(30_000)).toBe(true);
    expect(s.valid(61_001)).toBe(false);
    s.grant(1000); s.clear();
    expect(s.valid(2000)).toBe(false);
  });
});
