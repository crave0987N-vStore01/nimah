// Pure validation of Gemini's JSON — never trust model output before acting on it.
import { ActionName, AgentActionName, AgentStep, AGENT_ACTIONS, Intent, KNOWN_ACTIONS } from '../types';

const FALLBACK_QUESTION = 'Sorry, I need a bit more detail. Could you say that again?';
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** True if the action has everything it needs to run. */
function isComplete(i: Intent): boolean {
  switch (i.action) {
    case 'send_whatsapp':
    case 'send_sms': return !!i.recipient && !!i.message;
    case 'call_contact': return !!i.recipient;
    case 'set_alarm':
      return i.hour !== null && Number.isInteger(i.hour) && i.hour >= 0 && i.hour <= 23 &&
             i.minute !== null && Number.isInteger(i.minute) && i.minute >= 0 && i.minute <= 59;
    case 'set_timer': return i.duration_seconds !== null && i.duration_seconds > 0;
    case 'open_app':
    case 'navigate':
    case 'play_music':
    case 'phone_task': return !!i.target;
    case 'flashlight': return i.state !== null;
    default: return true;
  }
}

export function validateIntent(raw: unknown): Intent {
  if (!raw || typeof raw !== 'object') throw new Error('Gemini returned non-object JSON');
  const r = raw as Record<string, unknown>;

  const intent: Intent = {
    action: (KNOWN_ACTIONS.includes(r.action as ActionName) ? r.action : 'unknown') as ActionName,
    app: str(r.app) ?? 'none',
    recipient: str(r.recipient),
    message: str(r.message),
    target: str(r.target),
    hour: num(r.hour),
    minute: num(r.minute),
    duration_seconds: num(r.duration_seconds),
    state: r.state === 'on' || r.state === 'off' ? r.state : null,
    spoken_reply: str(r.spoken_reply) ?? FALLBACK_QUESTION,
  };

  if (intent.action === 'set_alarm' && intent.minute === null) intent.minute = 0; // "7 pm" -> 19:00
  if (!isComplete(intent)) return { ...intent, action: 'unknown' }; // spoken_reply asks for the missing info
  return intent;
}

// ---- Agent steps ----------------------------------------------------------------------

const DIRS = ['up', 'down', 'left', 'right'] as const;
const NEEDS_ID: AgentActionName[] = ['tap', 'long_press'];
const NEEDS_TEXT: AgentActionName[] = [
  'type', 'open_app', 'open_url', 'ask_user', 'confirm', 'say', 'dismiss_notification',
];

/** Validates one agent decision. Throws if it cannot be acted on safely. */
export function validateAgentStep(raw: unknown, screenCount: number): AgentStep {
  if (!raw || typeof raw !== 'object') throw new Error('Agent returned non-object JSON');
  const r = raw as Record<string, unknown>;
  if (!AGENT_ACTIONS.includes(r.action as AgentActionName)) throw new Error(`Unknown agent action: ${String(r.action)}`);

  const step: AgentStep = {
    thought: str(r.thought) ?? '',
    action: r.action as AgentActionName,
    id: num(r.id) !== null ? Math.trunc(num(r.id)!) : null,
    text: str(r.text),
    direction: (DIRS as readonly unknown[]).includes(r.direction) ? (r.direction as AgentStep['direction']) : null,
    level: num(r.level) !== null ? Math.round(num(r.level)!) : null,
    submit: typeof r.submit === 'boolean' ? r.submit : null,
    spoken_reply: str(r.spoken_reply) ?? '',
  };

  if (step.action === 'swipe_to') step.action = 'scroll';
  if (NEEDS_ID.includes(step.action) && (step.id === null || step.id < 0 || step.id >= screenCount)) {
    throw new Error(`Agent chose an element that is not on screen (${step.id})`);
  }
  if (step.action === 'type' && step.id !== null && (step.id < 0 || step.id >= screenCount)) step.id = null;
  if (step.action === 'scroll' && !step.direction) step.direction = 'down';
  if (NEEDS_TEXT.includes(step.action) && !step.text) throw new Error(`Agent action "${step.action}" needs text`);
  if (step.action === 'set_volume') {
    if (step.level === null) throw new Error('set_volume needs a level');
    step.level = Math.max(0, Math.min(100, step.level));
  }
  if (step.action === 'wait') step.level = Math.max(1, Math.min(5, step.level ?? 2));
  return step;
}
