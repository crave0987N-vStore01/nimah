// Pure helper: understands spoken yes / no in English, Sinhala and Singlish.
const YES = ['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'go', 'proceed', 'confirm', 'do', 'please',
  'ow', 'ou', 'owu', 'hari', 'harima', 'ඔව්', 'ඔව', 'හරි', 'ඔවු', 'කරන්න', 'ඕනේ', 'ඔබන්න'];
const NO = ['no', 'nope', 'nah', 'not', "don't", 'dont', 'stop', 'cancel', 'never', 'wait',
  'nehe', 'nae', 'ne', 'epa', 'එපා', 'නැහැ', 'නැ', 'නෑ', 'නවත්වන්න', 'නවතින්න'];

const tokens = (s: string) => s.toLowerCase().split(/[\s.,!?;:]+/).filter(Boolean);

/** true = yes, false = no, null = could not tell. "No" wins when both appear ("no, don't do it"). */
export function parseYesNo(spoken: string): boolean | null {
  const w = tokens(spoken);
  if (w.some((x) => NO.includes(x))) return false;
  if (w.some((x) => YES.includes(x))) return true;
  return null;
}
