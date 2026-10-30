// Voice dictation into any text field: edit commands + punctuation words (pure, unit-tested).
export type DictAction = 'continue' | 'done' | 'send' | 'cancel';
export interface DictResult { buffer: string; action: DictAction }

const norm = (s: string) => s.trim().toLowerCase().replace(/[.!?,]+$/g, '').trim();
const PUNCT: [RegExp, string][] = [
  [/\s*\b(?:full stop|period)\b/gi, '.'], [/\s*\bcomma\b/gi, ','], [/\s*\bquestion mark\b/gi, '?'], [/\s*\bexclamation (?:mark|point)\b/gi, '!'], [/\s*\bcolon\b/gi, ':'],
];

export function applyDictation(buffer: string, utterance: string): DictResult {
  const u = norm(utterance);
  if (/^(?:done|finish(?:ed)?|stop dictation|that'?s all|ඉවරයි|ඉවර|හරි ඉවරයි)$/.test(u)) return { buffer, action: 'done' };
  if (/^(?:send|send it|press enter|enter|යවන්න|send කරන්න)$/.test(u)) return { buffer, action: 'send' };
  if (/^(?:cancel|discard|never mind|අවලංගු|අවලංගු කරන්න|එපා)$/.test(u)) return { buffer: '', action: 'cancel' };
  if (/^(?:new line|next line|new paragraph|අලුත් පේළියක්|ඊළඟ පේළිය)$/.test(u)) return { buffer: `${buffer}\n`, action: 'continue' };
  if (/^(?:delete last word|remove last word|අන්තිම වචනය මකන්න)$/.test(u)) return { buffer: buffer.replace(/\s*\S+\s*$/, ''), action: 'continue' };
  if (/^(?:delete that|undo|delete last sentence|ඒක මකන්න)$/.test(u)) return { buffer: buffer.replace(/[^.!?\n]*[.!?]?\s*$/, '').trimEnd(), action: 'continue' };
  if (/^(?:clear|clear all|delete all|සියල්ල මකන්න)$/.test(u)) return { buffer: '', action: 'continue' };
  let add = utterance.trim();
  for (const [re, sym] of PUNCT) add = add.replace(re, sym);
  if (!add) return { buffer, action: 'continue' };
  const glue = !buffer || /\n$/.test(buffer) || /^[.,?!:]/.test(add) ? '' : ' ';
  return { buffer: `${buffer}${glue}${add}`, action: 'continue' };
}

export const DICTATE_TRIGGER = /^(?:dictate|start dictation|type what i say|let me dictate|ටයිප් කරන්න|මම කියන දේ ටයිප් කරන්න|dictation)$/i;
