// Splits one spoken sentence into ordered sub-commands ("open YouTube and then search lofi") and
// runs them one after another. Pure logic, unit-tested. Anything the splitter is unsure about stays
// ONE command and is left to the AI agent, which already plans multi-step jobs.

export const MAX_STEPS = 5;

const EN_CONNECTORS = '(?:and then|and after that|after that|afterwards|then)';
const SI_CONNECTORS = '(?:ඉන්පසු|ඉන්පස්සේ|ඉන් පස්සේ|ඊට පස්සේ|ඊටපස්සේ|ඊළඟට|ඊලඟට|ඊට පසු|ඊටපසු)';
const SPLIT = new RegExp(`\\s*(?:,\\s*)?(?:\\b${EN_CONNECTORS}\\b|${SI_CONNECTORS})\\s*,?\\s*`, 'giu');
const LEAD = /^(?:first(?:ly)?|මුලින්ම|මුලින්)[\s,]+/i;
const LEAD_AND = /^(?:and|ඇනඩ්)\s+/i;

/** Commands that take free text: never cut these in the middle of what the user dictates. */
const FREE_TEXT = /^(?:note|task|add task|remind(?: me)?|checklist|translate|summari[sz]e|rewrite|explain|write|draft|caption|fix grammar|key points)\b/i;
const ONE_WORD_OK = new Set(['screenshot', 'flashlight', 'torch', 'back', 'home', 'mute', 'stop', 'repeat']);

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function splitSteps(input: string): string[] {
  const text = input.trim();
  if (!text || FREE_TEXT.test(text)) return text ? [text] : [];

  // Protect quoted text.
  const quotes: string[] = [];
  const masked = text.replace(/["“”][^"“”]*["“”]/g, (m) => { quotes.push(m); return `\u0001${quotes.length - 1}\u0001`; });
  const restore = (s: string) => s.replace(/\u0001(\d+)\u0001/g, (_m, i) => quotes[Number(i)]);

  const raw = masked.replace(LEAD, '').split(SPLIT).map((p) => p.trim().replace(LEAD_AND, '').replace(/[,.]+$/, '').trim()).filter(Boolean);

  // Merge parts that are too short to be a command into the previous one.
  const parts: string[] = [];
  for (const p of raw) {
    const ok = wordCount(p) >= 2 || ONE_WORD_OK.has(p.toLowerCase());
    if (!ok && parts.length) parts[parts.length - 1] = `${parts[parts.length - 1]} ${p}`;
    else parts.push(p);
  }
  if (parts.length > MAX_STEPS) return [text];
  return parts.map(restore);
}

export interface PlanOutcome { done: number; total: number; ok: boolean; cancelled: boolean }

/** Runs steps in order. Stops at the first failure or when cancelled. */
export async function runPlan(
  steps: string[],
  run: (step: string, index: number, total: number) => Promise<boolean>,
  isCancelled: () => boolean = () => false,
): Promise<PlanOutcome> {
  let done = 0;
  for (let i = 0; i < steps.length; i++) {
    if (isCancelled()) return { done, total: steps.length, ok: false, cancelled: true };
    const ok = await run(steps[i], i, steps.length);
    if (!ok) return { done, total: steps.length, ok: false, cancelled: isCancelled() };
    done += 1;
  }
  return { done, total: steps.length, ok: true, cancelled: false };
}
