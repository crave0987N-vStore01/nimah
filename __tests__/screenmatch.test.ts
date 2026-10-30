import { findElementByLabel, findOcrLine, labelScore, ocrToScreenText, parseCoords, parseElements } from '../src/services/screenmatch';
import { validateAgentStep } from '../src/services/validate';

const screen = [
  '[0] TextView "Settings" @540,100',
  '[1] Switch "Wi-Fi" (tap,checked) #switch_widget @980,400',
  '[2] Button "Play video" (tap) #play @540,900',
  '[3] EditText "" hint="Search" (tap,edit,focused) @500,200',
].join('\n');

describe('screen matching', () => {
  it('parses the numbered screen list', () => {
    const els = parseElements(screen);
    expect(els).toHaveLength(4);
    expect(els[1]).toMatchObject({ id: 1, kind: 'Switch', label: 'Wi-Fi', tap: true, x: 980, y: 400 });
    expect(els[3]).toMatchObject({ edit: true });
  });
  it('scores labels', () => {
    expect(labelScore('Play video', 'play video')).toBe(3);
    expect(labelScore('Play video now', 'play video')).toBe(2);
    expect(labelScore('Click to play the video', 'play video')).toBe(1);
    expect(labelScore('Stop', 'play')).toBe(0);
  });
  it('finds an element by its label, preferring tappable ones', () => {
    expect(findElementByLabel(screen, 'play video')?.id).toBe(2);
    expect(findElementByLabel(screen, 'wifi')).toBeNull();
    expect(findElementByLabel(screen, 'Wi-Fi')?.id).toBe(1);
  });
  it('finds OCR lines and renders them for the AI', () => {
    const lines = [{ text: 'Subscribe', x: 100, y: 200, w: 80, h: 20 }, { text: 'Share', x: 300, y: 200, w: 60, h: 20 }];
    expect(findOcrLine(lines, 'subscribe')?.x).toBe(100);
    expect(findOcrLine(lines, 'download')).toBeNull();
    expect(ocrToScreenText(lines)).toBe('(ocr) "Subscribe" @100,200\n(ocr) "Share" @300,200');
  });
  it('parses coordinates safely', () => {
    expect(parseCoords('540,1200', 2)).toEqual([540, 1200]);
    expect(parseCoords('540 1600 540 600', 4)).toEqual([540, 1600, 540, 600]);
    expect(parseCoords('540', 2)).toBeNull();
    expect(parseCoords('99999,5', 2)).toBeNull();
    expect(parseCoords(null, 2)).toBeNull();
  });
});

describe('new agent actions are validated', () => {
  const base = { thought: '', id: null, direction: null, level: null, submit: null, spoken_reply: '' };
  it('accepts tap_text / tap_xy / swipe_xy / set_hardware', () => {
    expect(validateAgentStep({ ...base, action: 'tap_text', text: 'Subscribe' }, 5).action).toBe('tap_text');
    expect(validateAgentStep({ ...base, action: 'tap_xy', text: '10,20' }, 0).text).toBe('10,20');
    expect(validateAgentStep({ ...base, action: 'swipe_xy', text: '1,2,3,4' }, 0).action).toBe('swipe_xy');
    expect(validateAgentStep({ ...base, action: 'set_hardware', text: 'WiFi', level: 1 }, 0).text).toBe('wifi');
    expect(validateAgentStep({ ...base, action: 'set_hardware', text: 'brightness', level: 250 }, 0).level).toBe(100);
    expect(validateAgentStep({ ...base, action: 'read_ocr' }, 0).action).toBe('read_ocr');
  });
  it('rejects malformed ones', () => {
    expect(() => validateAgentStep({ ...base, action: 'tap_xy', text: 'abc' }, 0)).toThrow();
    expect(() => validateAgentStep({ ...base, action: 'swipe_xy', text: '1,2' }, 0)).toThrow();
    expect(() => validateAgentStep({ ...base, action: 'set_hardware', text: 'nfc', level: 1 }, 0)).toThrow();
    expect(() => validateAgentStep({ ...base, action: 'set_hardware', text: 'wifi' }, 0)).toThrow();
    expect(() => validateAgentStep({ ...base, action: 'tap_text' }, 0)).toThrow();
  });
});
