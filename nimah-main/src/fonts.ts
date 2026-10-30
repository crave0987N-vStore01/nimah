// Which bundled font file to use for a given style (pure function, unit-tested).
export function fontFor(flatFamily: string | undefined, weight: string | number | undefined, sinhala: boolean): string {
  const w = String(weight ?? '400');
  const bold = w === 'bold' || ['700', '800', '900'].includes(w);
  const semi = w === '600';
  const medium = w === '500';
  if (flatFamily === 'monospace') return 'monospace';
  if (flatFamily === 'serif') return bold ? 'Cinzel-Bold' : semi || medium ? 'Cinzel-SemiBold' : 'Cinzel-Regular';
  if (sinhala) return bold || semi ? 'NotoSansSinhala-Bold' : medium ? 'NotoSansSinhala-Medium' : 'NotoSansSinhala-Regular';
  return bold ? 'Rajdhani-Bold' : semi ? 'Rajdhani-SemiBold' : medium ? 'Rajdhani-Medium' : 'Rajdhani-Regular';
}
