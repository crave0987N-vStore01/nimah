// Voice-made routines ("good morning": wifi on, brightness 80, read my briefing). Pure logic.
export interface Routine { name: string; steps: string[] }
export type RoutineCmd =
  | { type: 'create'; name: string; steps: string[] }
  | { type: 'delete'; name: string }
  | { type: 'list' };

export const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const splitList = (s: string) => s.split(/\s*(?:,|;|\band then\b|\bthen\b|ඉන්පසු|ඊට පස්සේ)\s*/i).map((x) => x.trim()).filter(Boolean);

export function parseRoutineCommand(input: string): RoutineCmd | null {
  const t = input.trim().replace(/[.!?]+$/, '');
  let m = /^(?:create|make|save|add|new)\s+(?:a\s+)?routine\s+(?:called\s+|named\s+)?["“]?(.+?)["”]?\s*(?::|=|\bthat does\b|\bto do\b|\bwith\b)\s*(.+)$/i.exec(t)
    ?? /^routine\s+(?:එකක්\s+)?(?:හදන්න|හදමු)\s+["“]?(.+?)["”]?\s*[:：]\s*(.+)$/i.exec(t);
  if (m) { const steps = splitList(m[2]); if (steps.length && normName(m[1])) return { type: 'create', name: normName(m[1]), steps }; }
  m = /^(?:delete|remove|forget)\s+(?:the\s+)?routine\s+["“]?(.+?)["”]?$/i.exec(t) ?? /^routine\s+(?:එක\s+)?["“]?(.+?)["”]?\s+(?:මකන්න)$/i.exec(t);
  if (m) return { type: 'delete', name: normName(m[1]) };
  if (/^(?:list|show|what are)\s+(?:my\s+)?routines?$|^මගේ routines?$/i.test(t)) return { type: 'list' };
  return null;
}

/** "run routine good morning", "good morning routine" or just the name. */
export function matchRoutine(input: string, routines: Routine[]): Routine | null {
  const t = normName(input.replace(/^(?:hey |ok |okay |please |nimah\s+)+/i, ''));
  const stripped = t.replace(/^(?:run|start|do|begin|play)\s+(?:the\s+)?(?:routine\s+)?/, '').replace(/\s+routine$/, '').trim();
  return routines.find((r) => r.name === stripped || r.name === t) ?? null;
}

export const upsert = (list: Routine[], r: Routine): Routine[] => [...list.filter((x) => x.name !== r.name), r].slice(-30);
export const remove = (list: Routine[], name: string): Routine[] => list.filter((x) => x.name !== name);
