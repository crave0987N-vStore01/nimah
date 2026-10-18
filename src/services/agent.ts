// src/services/agent.ts — the AI drives the phone: look at screen -> decide -> act -> repeat.
import { makeError } from '../errors';
import { ensureAccessibility, Nimah } from '../native/Nimah';
import { AgentStep, Locale, ScreenState } from '../types';
import { decideNextStep } from './gemini';
import { buildAgentPrompt } from './prompt';

export interface AgentHooks {
  locale: Locale;
  maxSteps: number;
  confirmRisky: boolean;
  /** Speak and wait until finished. */
  say: (text: string) => Promise<void>;
  /** Speak without waiting (progress chatter). */
  hint: (text: string) => void;
  /** Speak a question, then return what the person says (null = no answer). */
  ask: (question: string) => Promise<string | null>;
  /** Yes/No question by voice (or button). */
  confirm: (question: string) => Promise<boolean>;
  /** Shown on screen / in history. */
  onProgress: (text: string) => void;
  isCancelled: () => boolean;
}

export interface AgentResult { ok: boolean; reply: string; steps: number }

// ---- small pure helpers (unit-tested) ---------------------------------------------------

/** Words that make a tap potentially irreversible / costly. */
const RISKY = /\b(pay|pay now|buy|buy now|place order|order now|purchase|checkout|check out|delete|erase|remove all|uninstall|factory reset|reset phone|transfer|send money|confirm payment|clear data|format|subscribe)\b/i;

export const isRiskyLabel = (label: string) => RISKY.test(label);

/** Pulls the line for element [id] out of the screen text. */
export function elementLine(screenText: string, id: number): string | null {
  const prefix = `[${id}] `;
  return screenText.split('\n').find((l) => l.startsWith(prefix)) ?? null;
}

export function elementLabel(screenText: string, id: number): string {
  const line = elementLine(screenText, id);
  const m = line?.match(/"([^"]*)"/);
  return m ? m[1] : '';
}

/** Same action on the same target — used to detect the AI going in circles. */
export const signature = (s: AgentStep, screenText: string) =>
  `${s.action}|${s.id ?? ''}|${s.id !== null ? elementLabel(screenText, s.id) : ''}|${s.text ?? ''}|${s.direction ?? ''}`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const msg = (locale: Locale, en: string, si: string) => (locale === 'si-LK' ? si : en);

function describe(step: AgentStep, screenText: string): string {
  const label = step.id !== null ? elementLabel(screenText, step.id) : '';
  switch (step.action) {
    case 'tap': case 'long_press': return `${step.action} [${step.id}] "${label}"`;
    case 'type': return `type "${step.text}"${step.submit ? ' + Enter' : ''} into [${step.id ?? 'focused field'}]`;
    case 'scroll': return `scroll ${step.direction}`;
    case 'set_volume': return `set_volume ${step.level}`;
    case 'wait': return `wait ${step.level}s`;
    default: return step.text ? `${step.action} "${step.text}"` : step.action;
  }
}

// ---- the loop ------------------------------------------------------------------------

export async function runAgent(goal: string, h: AgentHooks): Promise<AgentResult> {
  const language = h.locale === 'si-LK' ? 'Sinhala' : 'English';
  const log: string[] = [];
  let notes = '';
  let lastSig = '';
  let repeats = 0;
  let confirmedAtStep = -99;
  let unreadable = 0;

  const stopped = () => msg(h.locale, 'Okay, I stopped.', 'හරි, නැවැත්තුවා.');

  if ((await ensureAccessibility(true)) === 'manual') throw makeError('A11Y_NOT_ENABLED');
  await sleep(600);
  await Nimah.consumeStopRequest().catch(() => false); // clear any stale stop

  for (let n = 0; n < h.maxSteps; n++) {
    if (h.isCancelled() || (await Nimah.consumeStopRequest().catch(() => false))) {
      return { ok: false, reply: stopped(), steps: n };
    }

    // 1) LOOK
    let screen: ScreenState;
    try { screen = await Nimah.screenRead(); }
    catch { throw makeError('A11Y_NOT_ENABLED'); }

    if (screen.count === 0 && screen.package === 'unknown') {
      if (++unreadable >= 3) {
        return { ok: false, steps: n, reply: msg(h.locale,
          "I can't read the screen. Is the phone locked?", 'තිරය කියවන්න බැහැ. phone එක lock වෙලාද?') };
      }
      await sleep(1000);
      continue;
    }
    unreadable = 0;
    // Few readable elements (game, video, canvas, WebView) -> also send a picture.
    const image = screen.count < 3 ? await Nimah.screenshot().catch(() => null) : null;

    // 2) THINK
    const prompt = buildAgentPrompt({ goal, language, log, notes, screen });
    const step = await decideNextStep(prompt, image, screen.count);
    notes = '';
    h.onProgress(step.thought || describe(step, screen.text));

    // 3) FINISH?
    if (step.action === 'done') return { ok: true, reply: step.spoken_reply || msg(h.locale, 'Done.', 'හරි, ඉවරයි.'), steps: n + 1 };
    if (step.action === 'fail') return { ok: false, reply: step.spoken_reply || msg(h.locale, "I couldn't do that.", 'ඒක කරන්න බැරි වුණා.'), steps: n + 1 };

    // 4) LOOP GUARD
    const sig = signature(step, screen.text);
    repeats = sig === lastSig ? repeats + 1 : 0;
    lastSig = sig;
    if (repeats >= 4) {
      return { ok: false, steps: n + 1, reply: msg(h.locale,
        "I'm stuck and can't make progress.", 'මම හිරවුණා, ඉදිරියට යන්න බැහැ.') };
    }
    if (repeats >= 2) notes = `You have repeated "${describe(step, screen.text)}" ${repeats + 1} times with no progress. Try something different.`;

    // 5) SAFETY NET (code-level, in addition to the prompt)
    if (h.confirmRisky && (step.action === 'tap' || step.action === 'long_press') && step.id !== null) {
      const label = elementLabel(screen.text, step.id);
      if (isRiskyLabel(label) && n - confirmedAtStep > 3) {
        const yes = await h.confirm(msg(h.locale, `Should I tap "${label}"?`, `"${label}" ඔබන්නද?`));
        if (!yes) { log.push(`(user refused to tap "${label}") `); continue; }
        confirmedAtStep = n;
      }
    }

    // 6) ACT
    const result = await execute(step, h, log.length, () => { confirmedAtStep = n; });
    log.push(`${describe(step, screen.text)} -> ${result}`);
    if (log.length > 14) log.splice(0, log.length - 14); // keep the prompt small

    if (step.spoken_reply && !['say', 'ask_user', 'confirm'].includes(step.action)) h.hint(step.spoken_reply);
  }
  return { ok: false, steps: h.maxSteps, reply: msg(h.locale,
    "That's taking too long, so I stopped.", 'ඒක ගොඩක් වෙලා ගියා, ඒ නිසා නැවැත්තුවා.') };
}

/** Performs one step. Returns a short outcome string for the log. Never throws for normal failures. */
async function execute(step: AgentStep, h: AgentHooks, _n: number, markConfirmed: () => void): Promise<string> {
  try {
    switch (step.action) {
      case 'tap': case 'long_press': {
        const ok = await Nimah.uiClick(step.id!, step.action === 'long_press');
        await Nimah.waitForIdle(350, 2500);
        return ok ? 'ok' : 'failed';
      }
      case 'type': {
        const ok = await Nimah.uiType(step.id ?? -1, step.text!, !!step.submit);
        await Nimah.waitForIdle(300, 2000);
        return ok ? 'ok' : 'failed (field not editable?)';
      }
      case 'scroll': {
        const ok = await Nimah.uiScroll(step.direction ?? 'down', step.id ?? -1);
        await Nimah.waitForIdle(300, 2000);
        return ok ? 'ok' : 'cannot scroll further';
      }
      case 'back': case 'home': case 'recents': case 'notifications':
      case 'quick_settings': case 'lock_screen': case 'power_menu': {
        const ok = await Nimah.uiGlobal(step.action);
        await Nimah.waitForIdle(400, 2500);
        return ok ? 'ok' : 'not supported';
      }
      case 'screenshot': {
        const ok = await Nimah.uiGlobal('take_screenshot');
        await Nimah.waitForIdle(500, 3000);
        return ok ? 'ok (saved to gallery)' : 'not supported on this Android version';
      }
      case 'open_app':
        await Nimah.openApp(step.text!);
        await Nimah.waitForIdle(700, 6000);
        return 'ok';
      case 'open_url':
        await Nimah.openUrl(step.text!);
        await Nimah.waitForIdle(900, 7000);
        return 'ok';
      case 'open_settings':
        await Nimah.openSettings(step.text ?? 'main');
        await Nimah.waitForIdle(600, 4000);
        return 'ok';
      case 'set_volume':
        await Nimah.setVolume(step.level!, 'music');
        return 'ok';
      case 'wait':
        await sleep((step.level ?? 2) * 1000);
        return 'ok';
      case 'read_notifications': {
        const list = await Nimah.getNotifications();
        if (!list.length) return 'no notifications';
        return 'notifications:\n' + list.slice(0, 12)
          .map((x) => `  key=${x.key} | ${x.app}: ${x.title} - ${x.text}`).join('\n');
      }
      case 'dismiss_notification':
        await Nimah.dismissNotification(step.text!);
        return 'ok';
      case 'say':
        await h.say(step.text!);
        return 'spoken';
      case 'ask_user': {
        const a = await h.ask(step.text!);
        return a ? `user answered: "${a}"` : 'user did not answer';
      }
      case 'confirm': {
        const yes = await h.confirm(step.text!);
        if (yes) markConfirmed();
        return yes ? 'user said YES' : 'user said NO';
      }
      default:
        return 'ignored';
    }
  } catch (e: any) {
    if (e?.code === 'A11Y_NOT_ENABLED') throw e;
    return `error: ${e?.message ?? e}`;
  }
}
