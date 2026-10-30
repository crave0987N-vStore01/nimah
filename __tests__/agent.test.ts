// agent.ts imports the native bridge; stub it so the pure helpers can be tested in Node.
jest.mock('../src/native/Nimah', () => ({ Nimah: {} }));
jest.mock('../src/services/gemini', () => ({ decideNextStep: jest.fn() }));

import { elementLabel, elementLine, isRiskyLabel, signature } from '../src/services/agent';
import { parseYesNo } from '../src/services/yesno';
import { AgentStep } from '../src/types';

const screen = [
  '[0] TextView "Checkout" @540,100',
  '[1] Button "Place order" (tap) #buy @540,2200',
  '[2] EditText "hello" hint="Type a message" (tap,edit,focused) @500,2000',
].join('\n');

describe('screen helpers', () => {
  it('finds an element line and its label', () => {
    expect(elementLine(screen, 1)).toContain('Place order');
    expect(elementLabel(screen, 2)).toBe('hello');
    expect(elementLine(screen, 7)).toBeNull();
    expect(elementLabel(screen, 7)).toBe('');
  });
  it('flags risky labels', () => {
    ['Place order', 'Buy now', 'Delete', 'Uninstall', 'Send money', 'Factory reset'].forEach((l) => expect(isRiskyLabel(l)).toBe(true));
    ['Send', 'Search', 'Settings', 'Delivery options'].forEach((l) => expect(isRiskyLabel(l)).toBe(false));
  });
  it('builds a stable signature for loop detection', () => {
    const s: AgentStep = { thought: '', action: 'tap', id: 1, text: null, direction: null, level: null, submit: null, spoken_reply: '' };
    expect(signature(s, screen)).toBe(signature({ ...s }, screen));
    expect(signature(s, screen)).not.toBe(signature({ ...s, id: 2 }, screen));
  });
});

describe('parseYesNo', () => {
  it('understands English, Sinhala and Singlish', () => {
    expect(parseYesNo('yes please')).toBe(true);
    expect(parseYesNo('ඔව්')).toBe(true);
    expect(parseYesNo('ow hari')).toBe(true);
    expect(parseYesNo('no')).toBe(false);
    expect(parseYesNo('එපා')).toBe(false);
    expect(parseYesNo('epa epa')).toBe(false);
  });
  it('"no" wins over "yes" in mixed answers, unknown -> null', () => {
    expect(parseYesNo("no, don't do it ok")).toBe(false);
    expect(parseYesNo('maybe later')).toBeNull();
  });
});
