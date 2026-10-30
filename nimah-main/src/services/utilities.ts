// Offline utilities: no network, no AI. All pure functions (unit-tested).

// ---------------- safe math (no eval) ----------------
const WORD_OPS: [RegExp, string][] = [
  [/\b(multiplied by|times)\b/gi, '*'], [/\b(divided by|over)\b/gi, '/'], [/\bplus\b/gi, '+'],
  [/\bminus\b/gi, '-'], [/\bto the power of\b/gi, '^'], [/[×x](?=\s*\d|\s*\()/g, '*'], [/÷/g, '/'],
];

export function normalizeExpr(raw: string): string {
  let s = raw.replace(/,/g, '');
  for (const [re, rep] of WORD_OPS) s = s.replace(re, rep);
  return s.replace(/\s+/g, '');
}

/** Evaluates + - * / ^ % and parentheses. Returns null if the input is not a valid expression. */
export function evalMath(raw: string): number | null {
  const s = normalizeExpr(raw);
  if (!s || !/^[0-9+\-*/^%().]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw new Error('paren'); i++; return postfix(v); }
    if (peek() === '-') { i++; return -unary(); }
    if (peek() === '+') { i++; return unary(); }
    const m = /^\d*\.?\d+/.exec(s.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return postfix(parseFloat(m[0]));
  };
  const postfix = (v: number) => { while (peek() === '%') { i++; v /= 100; } return v; };
  const unary = (): number => num();
  const pow = (): number => { let b = num(); if (peek() === '^') { i++; b = Math.pow(b, pow()); } return b; };
  const mul = (): number => {
    let v = pow();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++]; const r = pow();
      if (op === '/' && r === 0) throw new Error('div0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = mul(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  try {
    const v = add();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch { return null; }
}

export const fmtNum = (n: number) => String(parseFloat(n.toPrecision(10)));

export const percentOf = (p: number, n: number) => (p / 100) * n;
export const percentChange = (from: number, to: number) => (from === 0 ? null : ((to - from) / Math.abs(from)) * 100);

// ---------------- units ----------------
type Dim = 'length' | 'mass' | 'volume' | 'time' | 'speed' | 'data';
const U: Record<string, { dim: Dim; f: number }> = {
  mm: { dim: 'length', f: 0.001 }, cm: { dim: 'length', f: 0.01 }, m: { dim: 'length', f: 1 }, km: { dim: 'length', f: 1000 },
  in: { dim: 'length', f: 0.0254 }, ft: { dim: 'length', f: 0.3048 }, yd: { dim: 'length', f: 0.9144 }, mi: { dim: 'length', f: 1609.344 },
  mg: { dim: 'mass', f: 0.000001 }, g: { dim: 'mass', f: 0.001 }, kg: { dim: 'mass', f: 1 }, oz: { dim: 'mass', f: 0.028349523 }, lb: { dim: 'mass', f: 0.45359237 },
  ml: { dim: 'volume', f: 0.001 }, l: { dim: 'volume', f: 1 }, gal: { dim: 'volume', f: 3.785411784 },
  s: { dim: 'time', f: 1 }, min: { dim: 'time', f: 60 }, h: { dim: 'time', f: 3600 }, day: { dim: 'time', f: 86400 }, week: { dim: 'time', f: 604800 },
  kmh: { dim: 'speed', f: 1 / 3.6 }, mph: { dim: 'speed', f: 0.44704 }, ms: { dim: 'speed', f: 1 },
  b: { dim: 'data', f: 1 }, kb: { dim: 'data', f: 1024 }, mb: { dim: 'data', f: 1048576 }, gb: { dim: 'data', f: 1073741824 },
};
const ALIAS: Record<string, string> = {
  millimeter: 'mm', millimeters: 'mm', centimeter: 'cm', centimeters: 'cm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', inch: 'in', inches: 'in', foot: 'ft', feet: 'ft',
  yard: 'yd', yards: 'yd', mile: 'mi', miles: 'mi', milligram: 'mg', milligrams: 'mg', gram: 'g', grams: 'g',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', milliliters: 'ml', liter: 'l', liters: 'l', litre: 'l', litres: 'l', gallon: 'gal', gallons: 'gal',
  second: 's', seconds: 's', sec: 's', minute: 'min', minutes: 'min', hour: 'h', hours: 'h', hr: 'h', hrs: 'h', days: 'day', weeks: 'week',
  'km/h': 'kmh', kph: 'kmh', 'm/s': 'ms', byte: 'b', bytes: 'b', kilobytes: 'kb', megabytes: 'mb', gigabytes: 'gb',
  celsius: 'c', fahrenheit: 'f', kelvin: 'k', '°c': 'c', '°f': 'f', '℃': 'c', '℉': 'f', degrees: 'c',
};
const unitKey = (u: string) => { const k = u.toLowerCase().trim(); return ALIAS[k] ?? k; };

export function convert(value: number, from: string, to: string): number | null {
  const a = unitKey(from), b = unitKey(to);
  if (['c', 'f', 'k'].includes(a) && ['c', 'f', 'k'].includes(b)) {
    const c = a === 'c' ? value : a === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    return b === 'c' ? c : b === 'f' ? (c * 9) / 5 + 32 : c + 273.15;
  }
  const ua = U[a], ub = U[b];
  if (!ua || !ub || ua.dim !== ub.dim) return null;
  return (value * ua.f) / ub.f;
}

// ---------------- text ----------------
export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
export const charCount = (t: string, withSpaces = true) => (withSpaces ? t.length : t.replace(/\s/g, '').length);
export const extractNumbers = (t: string) => (t.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
export const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);
export const average = (n: number[]) => (n.length ? sum(n) / n.length : null);
export const titleCase = (t: string) => t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
export const sentenceCase = (t: string) => t.trim().replace(/^\p{L}/u, (c) => c.toUpperCase());
export const collapseSpaces = (t: string) => t.replace(/\s+/g, ' ').trim();

export function randomInt(min: number, max: number, rng: () => number = Math.random): number {
  const lo = Math.ceil(Math.min(min, max)), hi = Math.floor(Math.max(min, max));
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

// ---------------- dates ----------------
const p2 = (n: number) => String(n).padStart(2, '0');
export type DateFmt = 'iso' | 'dmy' | 'mdy' | 'long';
export function formatDate(d: Date, fmt: DateFmt): string {
  const y = d.getFullYear(), m = p2(d.getMonth() + 1), day = p2(d.getDate());
  if (fmt === 'iso') return `${y}-${m}-${day}`;
  if (fmt === 'dmy') return `${day}/${m}/${y}`;
  if (fmt === 'mdy') return `${m}/${day}/${y}`;
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
export const formatTime = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${p2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
};
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h}h`, m && `${m}m`, (sec || (!h && !m)) && `${sec}s`].filter(Boolean).join(' ');
}

/** Extracts phone numbers, e-mails, URLs from text (used by screen reading). */
export function extractContacts(text: string) {
  return {
    phones: Array.from(new Set((text.match(/(?:\+?\d[\d\s-]{7,}\d)/g) ?? []).map((p) => p.replace(/[\s-]/g, '')))),
    emails: Array.from(new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])),
    urls: Array.from(new Set(text.match(/https?:\/\/[^\s)]+/g) ?? [])),
  };
}
