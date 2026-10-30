// Finding things on screen: UI node hierarchy first (fast, exact), OCR text second. Pure, unit-tested.
// NOTE: on-device OCR (ML Kit Latin model) does NOT read Sinhala script. For Sinhala screens the agent
// attaches a screenshot for Gemini vision instead.

export interface OcrLine { text: string; x: number; y: number; w: number; h: number }
export interface Element { id: number; kind: string; label: string; tap: boolean; edit: boolean; x: number; y: number }

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Parses the numbered screen list produced by NimahAccessibilityService.snapshot(). */
export function parseElements(screenText: string): Element[] {
  const out: Element[] = [];
  for (const line of screenText.split('\n')) {
    const m = /^\[(\d+)\] (\S+)(?: "([^"]*)")?(?: hint="[^"]*")?(?: \(([^)]*)\))?(?: #\S+)? @(-?\d+),(-?\d+)/.exec(line);
    if (!m) continue;
    const flags = (m[4] ?? '').split(',');
    out.push({ id: Number(m[1]), kind: m[2], label: m[3] ?? '', tap: flags.includes('tap'), edit: flags.includes('edit'), x: Number(m[5]), y: Number(m[6]) });
  }
  return out;
}

/** 3 exact, 2 starts-with, 1 contains-all-words, 0 no match. */
export function labelScore(label: string, query: string): number {
  const a = norm(label); const q = norm(query);
  if (!a || !q) return 0;
  if (a === q) return 3;
  if (a.startsWith(q) || q.startsWith(a)) return 2;
  if (a.includes(q)) return 1;
  const words = q.split(' ');
  return words.length > 1 && words.every((w) => a.includes(w)) ? 1 : 0;
}

export function findElementByLabel(screenText: string, query: string): Element | null {
  let best: Element | null = null; let bestScore = 0;
  for (const e of parseElements(screenText)) {
    const s = labelScore(e.label, query) * 10 + (e.tap ? 2 : 0) + (e.edit ? 1 : 0);
    if (labelScore(e.label, query) > 0 && s > bestScore) { best = e; bestScore = s; }
  }
  return best;
}

export function findOcrLine(lines: OcrLine[], query: string): OcrLine | null {
  let best: OcrLine | null = null; let bestScore = 0;
  for (const l of lines) {
    const s = labelScore(l.text, query);
    if (s > bestScore) { best = l; bestScore = s; }
  }
  return best;
}

/** Lines appended to the screen text when the UI tree is (almost) empty. The AI can then use tap_xy. */
export function ocrToScreenText(lines: OcrLine[], max = 40): string {
  return lines.slice(0, max).map((l) => `(ocr) "${l.text.replace(/\n/g, ' ').slice(0, 80)}" @${Math.round(l.x)},${Math.round(l.y)}`).join('\n');
}

/** "540,1200" / "540 1200" -> numbers (or null). Used for tap_xy and swipe_xy. */
export function parseCoords(text: string | null | undefined, count: 2 | 4): number[] | null {
  if (!text) return null;
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return nums.length === count && nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 10_000) ? nums : null;
}
