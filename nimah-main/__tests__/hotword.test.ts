import { gateWake, levenshtein, matchWakeWord } from '../src/services/hotword';
import { pickBestAlternative, scriptOf, shouldRetryOtherLocale, otherLocale } from '../src/services/bilingual';

describe('wake word', () => {
  it('finds the wake word with fillers and fuzzy spelling', () => {
    expect(matchWakeWord('Hey Nimah open YouTube')).toEqual({ matched: true, rest: 'open YouTube' });
    expect(matchWakeWord('ok nima, what time is it')).toEqual({ matched: true, rest: 'what time is it' });
    expect(matchWakeWord('නිමා wifi off කරන්න')).toEqual({ matched: true, rest: 'wifi off කරන්න' });
    expect(matchWakeWord('හේ නිමා')).toEqual({ matched: true, rest: '' });
  });
  it('does not trigger on other speech', () => {
    expect(matchWakeWord('open YouTube please').matched).toBe(false);
    expect(matchWakeWord('my friend nimal said hi').matched).toBe(false);
    expect(matchWakeWord('tell Kamal that nimah is here').matched).toBe(false);
  });
  it('levenshtein basics', () => {
    expect(levenshtein('nimah', 'nima')).toBe(1);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('gates: off = accept all, on = need wake word or an open window', () => {
    const now = 1_000_000;
    expect(gateWake({ text: 'hello there', enabled: false, activeUntil: 0, now }).accept).toBe(true);
    expect(gateWake({ text: 'random tv talk', enabled: true, activeUntil: 0, now }).accept).toBe(false);
    expect(gateWake({ text: 'nimah battery', enabled: true, activeUntil: 0, now })).toEqual({ accept: true, text: 'battery', wakeOnly: false });
    expect(gateWake({ text: 'nimah', enabled: true, activeUntil: 0, now })).toEqual({ accept: false, text: '', wakeOnly: true });
    expect(gateWake({ text: 'and the next one', enabled: true, activeUntil: now + 1000, now }).accept).toBe(true);
    expect(gateWake({ text: 'and the next one', enabled: true, activeUntil: now - 1, now }).accept).toBe(false);
    expect(gateWake({ text: 'nimah call amma', enabled: true, activeUntil: now + 1000, now }).text).toBe('call amma');
  });
});

describe('bilingual STT helpers', () => {
  it('detects script', () => {
    expect(scriptOf('hello')).toBe('en');
    expect(scriptOf('කොහොමද')).toBe('si');
    expect(scriptOf('wifi off කරන්න')).toBe('mixed');
    expect(scriptOf('123')).toBe('none');
  });
  it('picks the best alternative by confidence, script and rank', () => {
    expect(pickBestAlternative([{ text: 'a b', confidence: 0.4 }, { text: 'c d', confidence: 0.9 }], 'en-US')).toBe('c d');
    expect(pickBestAlternative([{ text: 'hello' }, { text: 'හෙලෝ' }], 'si-LK')).toBe('හෙලෝ');
    expect(pickBestAlternative([], 'en-US')).toBe('');
  });
  it('retries the other language once on NO_MATCH only', () => {
    expect(shouldRetryOtherLocale({ code: 7, auto: true, alreadyRetried: false })).toBe(true);
    expect(shouldRetryOtherLocale({ code: 7, auto: true, alreadyRetried: true })).toBe(false);
    expect(shouldRetryOtherLocale({ code: 6, auto: true, alreadyRetried: false })).toBe(false);
    expect(shouldRetryOtherLocale({ code: 7, auto: false, alreadyRetried: false })).toBe(false);
    expect(otherLocale('si-LK')).toBe('en-US');
  });
});
