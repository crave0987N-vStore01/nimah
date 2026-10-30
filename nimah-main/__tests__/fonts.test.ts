import { fontFor } from '../src/fonts';

describe('fontFor', () => {
  it('uses Rajdhani for normal interface text', () => {
    expect(fontFor(undefined, undefined, false)).toBe('Rajdhani-Regular');
    expect(fontFor(undefined, '600', false)).toBe('Rajdhani-SemiBold');
    expect(fontFor(undefined, 'bold', false)).toBe('Rajdhani-Bold');
  });
  it('uses Cinzel for titles (fontFamily serif)', () => {
    expect(fontFor('serif', '700', false)).toBe('Cinzel-Bold');
    expect(fontFor('serif', '400', false)).toBe('Cinzel-Regular');
  });
  it('switches to Noto Sans Sinhala for Sinhala text', () => {
    expect(fontFor(undefined, '400', true)).toBe('NotoSansSinhala-Regular');
    expect(fontFor(undefined, '700', true)).toBe('NotoSansSinhala-Bold');
  });
  it('keeps monospace for the crash screen', () => {
    expect(fontFor('monospace', '400', false)).toBe('monospace');
  });
});
