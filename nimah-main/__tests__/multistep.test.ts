import { runPlan, splitSteps } from '../src/services/multistep';

describe('splitSteps', () => {
  it('splits English connectors', () => {
    expect(splitSteps('open YouTube and then search lofi songs')).toEqual(['open YouTube', 'search lofi songs']);
    expect(splitSteps('first turn on wifi, then open Chrome, then search weather')).toEqual(['turn on wifi', 'open Chrome', 'search weather']);
  });
  it('splits Sinhala connectors', () => {
    expect(splitSteps('YouTube open කරන්න ඉන්පසු lofi songs search කරන්න')).toEqual(['YouTube open කරන්න', 'lofi songs search කරන්න']);
    expect(splitSteps('wifi on කරන්න ඊට පස්සේ camera open කරන්න')).toEqual(['wifi on කරන්න', 'camera open කරන්න']);
  });
  it('keeps single commands and free-text commands whole', () => {
    expect(splitSteps('open YouTube')).toEqual(['open YouTube']);
    expect(splitSteps('note: buy milk and then bread')).toEqual(['note: buy milk and then bread']);
    expect(splitSteps('remind me to call Kamal and then buy tea')).toEqual(['remind me to call Kamal and then buy tea']);
    expect(splitSteps('')).toEqual([]);
  });
  it('protects quoted text and merges tiny fragments', () => {
    expect(splitSteps('send whatsapp to Kamal "see you and then some" then call Amma')).toEqual(['send whatsapp to Kamal "see you and then some"', 'call Amma']);
    expect(splitSteps('open Chrome then ok')).toEqual(['open Chrome ok']);
    expect(splitSteps('open Chrome then screenshot')).toEqual(['open Chrome', 'screenshot']);
  });
  it('refuses absurdly long plans', () => {
    const long = 'a b then c d then e f then g h then i j then k l';
    expect(splitSteps(long)).toEqual([long]);
  });
});

describe('runPlan', () => {
  it('runs in order and stops at the first failure', async () => {
    const seen: string[] = [];
    const out = await runPlan(['a b', 'c d', 'e f'], async (s) => { seen.push(s); return s !== 'c d'; });
    expect(seen).toEqual(['a b', 'c d']);
    expect(out).toMatchObject({ done: 1, total: 3, ok: false });
  });
  it('completes all steps', async () => {
    const out = await runPlan(['x y', 'z w'], async () => true);
    expect(out).toMatchObject({ done: 2, ok: true, cancelled: false });
  });
  it('stops when cancelled', async () => {
    let n = 0;
    const out = await runPlan(['a b', 'c d'], async () => { n += 1; return true; }, () => n >= 1);
    expect(out).toMatchObject({ done: 1, ok: false, cancelled: true });
  });
});
