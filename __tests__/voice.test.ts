import { chooseVoice, effectivePitch, langOf, looksFemale, looksMale, splitSentences, VoiceInfo } from '../src/services/voice';

const v = (name: string, locale = 'en-US', extra: Partial<VoiceInfo> = {}): VoiceInfo =>
  ({ name, locale, quality: 400, latency: 200, requiresNetwork: false, installed: true, ...extra });

describe('voice gender hints', () => {
  it('never treats female/woman as male', () => {
    expect(looksMale('en-us-female-1')).toBe(false);
    expect(looksFemale('en-us-female-1')).toBe(true);
    expect(looksMale('Woman voice')).toBe(false);
    expect(looksMale('english male 2')).toBe(true);
    expect(looksMale('en-us-x-abc-local')).toBe(false);
  });
});

describe('chooseVoice', () => {
  it('uses the user choice when installed', () => {
    const r = chooseVoice([v('a'), v('b male')], 'en-US', 'a');
    expect(r.voiceName).toBe('a');
  });
  it('prefers a male-labelled voice and ignores female', () => {
    const r = chooseVoice([v('x female', 'en-US', { quality: 500 }), v('y male')], 'en-US', '');
    expect(r.voiceName).toBe('y male');
    expect(r.maleVoiceFound).toBe(true);
  });
  it('skips female voices when none is labelled male', () => {
    const r = chooseVoice([v('p female'), v('q')], 'en-US', '');
    expect(r.voiceName).toBe('q');
    expect(r.maleVoiceFound).toBe(false);
  });
  it('falls back to English when Sinhala is not installed', () => {
    const r = chooseVoice([v('e male')], 'si-LK', '');
    expect(r.voiceName).toBe('e male');
    expect(r.usedFallbackLanguage).toBe(true);
  });
  it('ignores voices that are not installed', () => {
    const r = chooseVoice([v('m male', 'en-US', { installed: false })], 'en-US', '');
    expect(r.voiceName).toBe('');
  });
  it('returns empty name (engine default) with no voices', () => {
    expect(chooseVoice([], 'en-US', '').voiceName).toBe('');
  });
});

describe('helpers', () => {
  it('clamps pitch and deepens without a male voice', () => {
    expect(effectivePitch(3, true)).toBe(1.5);
    expect(effectivePitch(0.1, true)).toBe(0.5);
    expect(effectivePitch(1, false)).toBe(0.9);
    expect(effectivePitch(NaN, true)).toBe(0.85);
  });
  it('langOf / splitSentences', () => {
    expect(langOf('si_LK')).toBe('si');
    expect(splitSentences('Hello sir. ඔබට කොහොමද? හොඳයි')).toEqual(['Hello sir.', 'ඔබට කොහොමද?', 'හොඳයි']);
  });
});
