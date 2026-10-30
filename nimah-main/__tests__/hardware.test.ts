import { HardwareApi, parseHardware, runHardware } from '../src/services/hardware';

describe('parseHardware', () => {
  it('Wi-Fi and Bluetooth on/off (English, Sinhala, Singlish)', () => {
    expect(parseHardware('turn off wifi')).toEqual({ kind: 'wifi', on: false });
    expect(parseHardware('Wi-Fi on')).toEqual({ kind: 'wifi', on: true });
    expect(parseHardware('wifi off කරන්න')).toEqual({ kind: 'wifi', on: false });
    expect(parseHardware('වයිෆයි ඔන් කරන්න')).toEqual({ kind: 'wifi', on: true });
    expect(parseHardware('bluetooth on')).toEqual({ kind: 'bluetooth', on: true });
    expect(parseHardware('බ්ලූටූත් off කරන්න')).toEqual({ kind: 'bluetooth', on: false });
    expect(parseHardware('please switch on bluetooth')).toEqual({ kind: 'bluetooth', on: true });
  });
  it('brightness level / up / down / max / min', () => {
    expect(parseHardware('brightness 70')).toEqual({ kind: 'brightness', level: 70 });
    expect(parseHardware('set brightness to 40 percent')).toEqual({ kind: 'brightness', level: 40 });
    expect(parseHardware('brightness up')).toEqual({ kind: 'brightness', delta: 20 });
    expect(parseHardware('දීප්තිය අඩු කරන්න')).toEqual({ kind: 'brightness', delta: -20 });
    expect(parseHardware('brightness max')).toEqual({ kind: 'brightness', level: 100 });
    expect(parseHardware('brightness lowest')).toEqual({ kind: 'brightness', level: 5 });
    expect(parseHardware('brightness 500')).toEqual({ kind: 'brightness', level: 100 });
  });
  it('ignores settings pages and questions', () => {
    expect(parseHardware('open wifi settings')).toBeNull();
    expect(parseHardware('is wifi on?')).toBeNull();
    expect(parseHardware('wifi')).toBeNull();
    expect(parseHardware('open YouTube')).toBeNull();
  });
});

const api = (over: Partial<HardwareApi> = {}): HardwareApi => ({
  setWifi: async () => 'done', setBluetooth: async () => 'done', getBrightness: async () => 50, setBrightness: async () => 'done', ...over,
});

describe('runHardware', () => {
  it('reports results honestly', async () => {
    expect(await runHardware({ kind: 'wifi', on: true }, api(), false)).toMatch(/Wi-Fi turned on/);
    expect(await runHardware({ kind: 'wifi', on: true }, api({ setWifi: async () => 'already' }), false)).toMatch(/already on/);
    expect(await runHardware({ kind: 'bluetooth', on: false }, api({ setBluetooth: async () => 'needs_accessibility' }), false)).toMatch(/Accessibility/);
    expect(await runHardware({ kind: 'bluetooth', on: false }, api({ setBluetooth: async () => 'failed' }), true)).toMatch(/බැරි/);
  });
  it('brightness: relative change is clamped, missing permission is explained', async () => {
    let set = -1;
    const a = api({ getBrightness: async () => 95, setBrightness: async (p) => { set = p; return 'done'; } });
    await runHardware({ kind: 'brightness', delta: 20 }, a, false);
    expect(set).toBe(100);
    expect(await runHardware({ kind: 'brightness', level: 30 }, api({ setBrightness: async () => 'needs_permission' }), false)).toMatch(/Modify system settings/);
  });
  it('maps a thrown A11Y error to a helpful reply', async () => {
    const r = await runHardware({ kind: 'wifi', on: true }, api({ setWifi: async () => { throw Object.assign(new Error('x'), { code: 'A11Y_NOT_ENABLED' }); } }), false);
    expect(r).toMatch(/Accessibility/);
  });
});
