import { average, convert, evalMath, extractContacts, fmtNum, formatDate, formatDuration, percentChange, percentOf, randomInt, sum, titleCase, wordCount, charCount } from '../src/services/utilities';
import { parseWhen } from '../src/services/parseTime';
import { parseReviewReply, handoffReply } from '../src/services/review';
import { CAPABILITIES, countByKind } from '../src/capabilities';

describe('evalMath', () => {
  it('handles precedence, brackets, powers, percent', () => {
    expect(evalMath('2+3*4')).toBe(14);
    expect(evalMath('(2+3)*4')).toBe(20);
    expect(evalMath('2^3^2')).toBe(512);
    expect(evalMath('50%')).toBe(0.5);
    expect(evalMath('-3+5')).toBe(2);
    expect(evalMath('12 times 3')).toBe(36);
    expect(evalMath('10 divided by 4')).toBe(2.5);
    expect(evalMath('1,000 + 1')).toBe(1001);
  });
  it('rejects bad input safely', () => {
    expect(evalMath('1/0')).toBeNull();
    expect(evalMath('2+')).toBeNull();
    expect(evalMath('alert(1)')).toBeNull();
    expect(evalMath('process.exit()')).toBeNull();
    expect(evalMath('')).toBeNull();
  });
});

describe('units and numbers', () => {
  it('converts', () => {
    expect(fmtNum(convert(5, 'km', 'miles')!)).toBe('3.106855961');
    expect(convert(100, 'c', 'f')).toBe(212);
    expect(convert(32, 'f', 'c')).toBe(0);
    expect(convert(2, 'hours', 'min')).toBe(120);
    expect(convert(1, 'kg', 'm')).toBeNull();
    expect(convert(1, 'foo', 'bar')).toBeNull();
  });
  it('math helpers', () => {
    expect(percentOf(15, 240)).toBe(36);
    expect(percentChange(50, 75)).toBe(50);
    expect(percentChange(0, 5)).toBeNull();
    expect(sum([1, 2, 3])).toBe(6);
    expect(average([2, 4])).toBe(3);
    expect(average([])).toBeNull();
    expect(randomInt(5, 5)).toBe(5);
    expect(randomInt(1, 10, () => 0)).toBe(1);
    expect(randomInt(1, 10, () => 0.999)).toBe(10);
  });
  it('text helpers', () => {
    expect(wordCount('  hello   big world ')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(charCount('a b', false)).toBe(2);
    expect(titleCase('hello WORLD')).toBe('Hello World');
    expect(formatDate(new Date(2026, 9, 30), 'iso')).toBe('2026-10-30');
    expect(formatDate(new Date(2026, 9, 30), 'dmy')).toBe('30/10/2026');
    expect(formatDuration(3725)).toBe('1h 2m 5s');
    expect(extractContacts('call +94 77 123 4567 or a@b.com see https://x.lk/a')).toEqual({ phones: ['+94771234567'], emails: ['a@b.com'], urls: ['https://x.lk/a'] });
  });
});

describe('parseWhen', () => {
  const now = new Date(2026, 9, 30, 10, 0, 0);
  it('relative', () => {
    const p = parseWhen('call Kamal in 10 minutes', now)!;
    expect(p.at.getTime() - now.getTime()).toBe(600000);
    expect(p.rest).toBe('call Kamal');
    expect(parseWhen('x after 2 hours', now)!.relativeSeconds).toBe(7200);
  });
  it('clock times', () => {
    expect(parseWhen('drink water at 5 pm', now)!.at.getHours()).toBe(17);
    const past = parseWhen('at 9 am wake', now)!;
    expect(past.at.getDate()).toBe(31);
    expect(parseWhen('tomorrow at 8 am gym', now)!.at.getDate()).toBe(31);
    expect(parseWhen('at 25:00', now)).toBeNull();
  });
  it('sinhala relative', () => {
    expect(parseWhen('විනාඩි 10 කින් ඇමතුම', now)!.relativeSeconds).toBe(600);
  });
  it('nothing to parse', () => { expect(parseWhen('just do it', now)).toBeNull(); });
});

describe('review', () => {
  it('parses decisions', () => {
    expect(parseReviewReply('yes send it')).toBe('send');
    expect(parseReviewReply('යවන්න')).toBe('send');
    expect(parseReviewReply("don't send")).toBe('cancel');
    expect(parseReviewReply('එපා')).toBe('cancel');
    expect(parseReviewReply('edit it')).toBe('edit');
    expect(parseReviewReply('banana')).toBeNull();
  });
  it('never claims delivery', () => {
    for (const si of [true, false]) for (const auto of [true, false]) {
      expect(handoffReply(si, 'WhatsApp', auto)).not.toMatch(/\b(delivered successfully|was sent successfully)\b/i);
    }
    expect(handoffReply(false, 'WhatsApp', false)).toMatch(/cannot confirm/i);
  });
});

describe('capability registry', () => {
  it('has unique ids and honest counts', () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const k = countByKind();
    expect(k.local + k.device + k.ai).toBe(CAPABILITIES.length);
    // eslint-disable-next-line no-console
    console.log('CAPABILITIES', CAPABILITIES.length, k);
  });
});
