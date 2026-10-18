import { validateAgentStep, validateIntent } from '../src/services/validate';

const base = {
  action: 'unknown', app: 'none', recipient: null, message: null, target: null,
  hour: null, minute: null, duration_seconds: null, state: null, spoken_reply: 'ok',
};

describe('validateIntent', () => {
  it('accepts a complete WhatsApp intent', () => {
    const i = validateIntent({ ...base, action: 'send_whatsapp', app: 'whatsapp', recipient: ' Asanka ', message: 'Come tomorrow' });
    expect(i.action).toBe('send_whatsapp');
    expect(i.recipient).toBe('Asanka');
  });
  it('downgrades to unknown when the message is missing', () => {
    expect(validateIntent({ ...base, action: 'send_whatsapp', recipient: 'Asanka' }).action).toBe('unknown');
  });
  it('rejects out-of-range alarm hours', () => {
    expect(validateIntent({ ...base, action: 'set_alarm', hour: 25, minute: 0 }).action).toBe('unknown');
  });
  it('defaults alarm minutes to 0', () => {
    const i = validateIntent({ ...base, action: 'set_alarm', hour: 19 });
    expect(i.action).toBe('set_alarm');
    expect(i.minute).toBe(0);
  });
  it('requires a positive timer duration', () => {
    expect(validateIntent({ ...base, action: 'set_timer', duration_seconds: 0 }).action).toBe('unknown');
    expect(validateIntent({ ...base, action: 'set_timer', duration_seconds: 120 }).action).toBe('set_timer');
  });
  it('maps unrecognised actions to unknown', () => {
    expect(validateIntent({ ...base, action: 'launch_rocket' }).action).toBe('unknown');
  });
  it('throws on non-object JSON', () => {
    expect(() => validateIntent('nope')).toThrow();
  });
});

describe('validateIntent (new actions)', () => {
  it('accepts a phone_task with a target', () => {
    const i = validateIntent({ ...base, action: 'phone_task', app: 'agent', target: 'Turn on wifi' });
    expect(i.action).toBe('phone_task');
  });
  it('downgrades phone_task without a target', () => {
    expect(validateIntent({ ...base, action: 'phone_task' }).action).toBe('unknown');
  });
  it('keeps answer as is', () => {
    expect(validateIntent({ ...base, action: 'answer', spoken_reply: 'It is 5 pm.' }).action).toBe('answer');
  });
});

const step = {
  thought: 't', action: 'tap', id: 2, text: null, direction: null, level: null, submit: null, spoken_reply: '',
};

describe('validateAgentStep', () => {
  it('accepts a tap on an element that exists', () => {
    expect(validateAgentStep({ ...step }, 5).id).toBe(2);
  });
  it('rejects a tap on an element that is not on screen', () => {
    expect(() => validateAgentStep({ ...step, id: 9 }, 5)).toThrow();
    expect(() => validateAgentStep({ ...step, id: null }, 5)).toThrow();
  });
  it('rejects unknown actions', () => {
    expect(() => validateAgentStep({ ...step, action: 'format_disk' }, 5)).toThrow();
  });
  it('type needs text; invalid field id falls back to the focused field', () => {
    expect(() => validateAgentStep({ ...step, action: 'type' }, 5)).toThrow();
    const s = validateAgentStep({ ...step, action: 'type', id: 99, text: 'hello' }, 5);
    expect(s.id).toBeNull();
  });
  it('scroll defaults to down; swipe_to becomes scroll', () => {
    expect(validateAgentStep({ ...step, action: 'scroll', id: null }, 5).direction).toBe('down');
    expect(validateAgentStep({ ...step, action: 'swipe_to', id: null, direction: 'left' }, 5).action).toBe('scroll');
  });
  it('clamps volume and wait', () => {
    expect(validateAgentStep({ ...step, action: 'set_volume', id: null, level: 250 }, 0).level).toBe(100);
    expect(validateAgentStep({ ...step, action: 'wait', id: null, level: 99 }, 0).level).toBe(5);
  });
  it('ask_user / confirm need a question', () => {
    expect(() => validateAgentStep({ ...step, action: 'ask_user', id: null }, 0)).toThrow();
    expect(validateAgentStep({ ...step, action: 'confirm', id: null, text: 'Send it?' }, 0).text).toBe('Send it?');
  });
});
