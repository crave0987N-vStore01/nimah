// Pure helpers for contact disambiguation ("which Asanka?").
import { Choice } from '../types';

export interface RawContact { name: string; number: string }
export interface ContactGroup { name: string; numbers: string[] }

export const looksLikeNumber = (s: string) => /^\+?[\d\s\-()]{6,}$/.test(s.trim());

const digitsKey = (n: string) => n.replace(/\D/g, '').slice(-9); // same number, different formatting

/** Groups rows by contact name; prefers exact name matches when present. */
export function groupContacts(rows: RawContact[], query: string): ContactGroup[] {
  const map = new Map<string, ContactGroup>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const g = map.get(key) ?? { name: r.name.trim(), numbers: [] };
    if (!g.numbers.some((n) => digitsKey(n) === digitsKey(r.number))) g.numbers.push(r.number);
    map.set(key, g);
  }
  const groups = [...map.values()];
  const q = query.trim().toLowerCase();
  const exact = groups.filter((g) => g.name.toLowerCase() === q);
  return exact.length ? exact : groups;
}

const ORDINALS: string[][] = [
  ['1', 'one', 'first', 'පළමු', 'පළමුවැනි', 'එක'],
  ['2', 'two', 'second', 'දෙවන', 'දෙවැනි', 'දෙක'],
  ['3', 'three', 'third', 'තෙවන', 'තුන'],
  ['4', 'four', 'fourth', 'හතරවන', 'හතර'],
  ['5', 'five', 'fifth', 'පස්වන', 'පහ'],
];
const tokens = (s: string) => s.toLowerCase().split(/[\s.,!?;:]+/).filter(Boolean);

/** Picks an option from a spoken answer: by name/surname, else by ordinal ("second", "2"). */
export function matchChoice<T>(spoken: string, options: Choice<T>[]): Choice<T> | null {
  const said = tokens(spoken);
  const scores = options.map((o) => {
    const words = tokens(o.label).filter((w) => w.length >= 2);
    return said.filter((w) => w.length >= 2 && words.includes(w)).length;
  });
  const best = Math.max(...scores, 0);
  if (best > 0 && scores.filter((s) => s === best).length === 1) return options[scores.indexOf(best)];

  // "එක" is both "one" and the suffix in "දෙවන එක" ("the second one"), so it only counts as a last resort.
  const WEAK = new Set(['එක']);
  for (const allowWeak of [false, true]) {
    for (let i = 0; i < Math.min(options.length, ORDINALS.length); i++) {
      if (ORDINALS[i].some((w) => said.includes(w) && (allowWeak || !WEAK.has(w)))) return options[i];
    }
  }
  return null;
}
