// Direct hardware commands: Wi-Fi, Bluetooth, brightness. Parser + runner are pure (unit-tested);
// the native side lives in NimahModule.kt.
//
// Honest limits (Android 10+): apps may NOT switch Wi-Fi / Bluetooth on or off directly. Nimah tries the
// direct API where the OS still allows it and otherwise opens the system panel and flips the switch
// through the Accessibility service. Brightness needs the "Modify system settings" permission.

export type HwKind = 'wifi' | 'bluetooth' | 'brightness' | 'airplane' | 'dnd' | 'hotspot' | 'location' | 'rotate' | 'mobiledata';
export type ToggleKind = Exclude<HwKind, 'brightness' | 'wifi' | 'bluetooth'>;
export interface HwCommand { kind: HwKind; on?: boolean; level?: number; delta?: number }
export type HwResult = 'done' | 'already' | 'needs_permission' | 'needs_accessibility' | 'failed';

export interface HardwareApi {
  setWifi(on: boolean): Promise<string>;
  setBluetooth(on: boolean): Promise<string>;
  getBrightness(): Promise<number>;
  setBrightness(percent: number): Promise<string>;
  /** airplane | dnd | hotspot | location | rotate | mobiledata */
  setToggle?(kind: ToggleKind, on: boolean): Promise<string>;
}

const WIFI = /\bwi-?\s?fi\b|වයි[\s-]?ෆයි|වයිෆයි/i;
const BT = /bluetooth|බ්ල[ූු]ට[ූු]ත්/i;
const TOGGLES: [ToggleKind, RegExp][] = [
  ['airplane', /airplane|aeroplane|flight mode|ගුවන් යානා මාදිලිය|ෆ්ලයිට් මෝඩ්/i],
  ['dnd', /do not disturb|\bdnd\b|silent mode|නිශ්ශබ්ද මාදිලිය|disturb කරන්න එපා/i],
  ['hotspot', /hot ?spot|හොට්ස්පොට්/i],
  ['mobiledata', /mobile data|cellular data|mobile network|දත්ත සම්බන්ධතාව|මොබයිල් ඩේටා/i],
  ['rotate', /auto[- ]?rotate|screen rotation|rotation lock|ඔටෝ රොටේට්/i],
  ['location', /\blocation\b|\bgps\b|ස්ථානය/i],
];
const BRIGHT = /brightness|screen light|දීප්තිය|දිප්තිය|ෂයිනි/i;
const OFF = /\boff\b|disable|turn off|switch off|ඕෆ්|නවත්වන්න|අක්‍රීය|ක්‍රියා විරහිත|ඕෆ් කරන්න/i;
const ON = /\bon\b|enable|turn on|switch on|ඔන්|සක්‍රීය|ක්‍රියාත්මක/i;
const QUESTION = /^(?:is|are|what|why|how|does|do(?! not disturb)|can)\b|\?$/i;
const SETTINGS_WORD = /settings?|සැකසුම්/i;

export function parseHardware(input: string): HwCommand | null {
  const text = input.trim().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/i, '').replace(/[.!]+$/, '');
  if (!text || QUESTION.test(text)) return null;

  if (BRIGHT.test(text)) {
    const num = /(\d{1,3})\s*(?:%|percent|පර්සන්ට්)?/.exec(text);
    if (num) return { kind: 'brightness', level: Math.max(1, Math.min(100, Number(num[1]))) };
    if (/\b(?:max|maximum|full|highest)\b|උපරිම/i.test(text)) return { kind: 'brightness', level: 100 };
    if (/\b(?:min|minimum|lowest)\b|අවම/i.test(text)) return { kind: 'brightness', level: 5 };
    if (/\b(?:up|increase|raise|more|brighter|higher)\b|වැඩි/i.test(text)) return { kind: 'brightness', delta: 20 };
    if (/\b(?:down|decrease|lower|less|dim|dimmer|reduce)\b|අඩු/i.test(text)) return { kind: 'brightness', delta: -20 };
    return null;
  }

  const kind: HwKind | null = WIFI.test(text) ? 'wifi' : BT.test(text) ? 'bluetooth' : TOGGLES.find(([, re]) => re.test(text))?.[0] ?? null;
  if (!kind || SETTINGS_WORD.test(text)) return null;
  if (OFF.test(text)) return { kind, on: false };
  if (ON.test(text)) return { kind, on: true };
  return null;
}

const NAME: Record<HwKind, [string, string]> = {
  wifi: ['Wi-Fi', 'Wi-Fi'], bluetooth: ['Bluetooth', 'බ්ලූටූත්'], brightness: ['Brightness', 'දීප්තිය'],
  airplane: ['Airplane mode', 'Airplane mode'], dnd: ['Do not disturb', 'Do not disturb'], hotspot: ['Hotspot', 'Hotspot'],
  location: ['Location', 'Location'], rotate: ['Auto-rotate', 'Auto-rotate'], mobiledata: ['Mobile data', 'Mobile data'],
};

export function hwReply(kind: HwKind, result: HwResult | string, si: boolean, o: { on?: boolean; percent?: number } = {}): string {
  const n = NAME[kind][si ? 1 : 0];
  switch (result) {
    case 'already': return si ? `${n} දැනටමත් ${o.on ? 'on' : 'off'} සර්.` : `${n} is already ${o.on ? 'on' : 'off'}, sir.`;
    case 'done':
      if (kind === 'brightness') return si ? `දීප්තිය ${o.percent}% කළා සර්.` : `Brightness set to ${o.percent}%, sir.`;
      return si ? `${n} ${o.on ? 'on' : 'off'} කළා සර්.` : `${n} turned ${o.on ? 'on' : 'off'}, sir.`;
    case 'needs_permission':
      if (kind === 'dnd') return si ? 'Do not disturb පාලනයට අවසරය අවශ්‍යයි. Settings එක open කළා, Nimah on කරන්න.' : 'I need Do Not Disturb access. I opened that setting: switch Nimah on.';
      if (kind === 'rotate') return si ? 'Auto-rotate වලට "Modify system settings" අවසරය අවශ්‍යයි.' : 'I need the "Modify system settings" permission for auto-rotate.';
      return si ? 'දීප්තිය වෙනස් කරන්න "Modify system settings" අවසරය අවශ්‍යයි. Settings වලින් ඒක දෙන්න.' : 'I need the "Modify system settings" permission to change brightness. You can grant it in Nimah settings.';
    case 'needs_accessibility':
      return si ? `${n} මාරු කරන්න Accessibility (ෆෝන් පාලනය) on කරන්න ඕනේ.` : `To switch ${n} I need phone control (Accessibility) turned on.`;
    default:
      return si ? `${n} මාරු කරන්න බැරි වුණා සර්.` : `I couldn't change ${n}, sir.`;
  }
}

export async function runHardware(cmd: HwCommand, api: HardwareApi, si: boolean): Promise<string> {
  try {
    if (cmd.kind === 'wifi' || cmd.kind === 'bluetooth') {
      const on = cmd.on === true;
      const res = await (cmd.kind === 'wifi' ? api.setWifi(on) : api.setBluetooth(on));
      return hwReply(cmd.kind, res, si, { on });
    }
    if (cmd.kind !== 'brightness') {
      const on = cmd.on === true;
      const res = api.setToggle ? await api.setToggle(cmd.kind, on) : 'failed';
      return hwReply(cmd.kind, res, si, { on });
    }
    let pct = cmd.level;
    if (pct === undefined) {
      const cur = await api.getBrightness();
      pct = Math.max(1, Math.min(100, cur + (cmd.delta ?? 0)));
    }
    const res = await api.setBrightness(pct);
    return hwReply('brightness', res, si, { percent: pct });
  } catch (e: any) {
    const code = String(e?.code ?? '');
    if (code === 'A11Y_NOT_ENABLED') return hwReply(cmd.kind, 'needs_accessibility', si);
    return hwReply(cmd.kind, 'failed', si);
  }
}
