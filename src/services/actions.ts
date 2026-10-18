// src/services/actions.ts — maps a validated Intent to native calls.
import { makeError } from '../errors';
import { t } from '../i18n';
import { ensureAccessibility, Nimah } from '../native/Nimah';
import { Choice, Intent, Locale } from '../types';
import { AgentHooks, runAgent } from './agent';
import { ContactGroup, groupContacts, looksLikeNumber } from './contacts';

export interface ActionContext {
  countryCode: string;
  locale: Locale;
  autoSend: boolean;
  /** Speaks a question, shows buttons AND listens; resolves null if cancelled. */
  askChoice: (prompt: string, options: Choice<ContactGroup>[]) => Promise<Choice<ContactGroup> | null>;
  /** Full phone control (AI drives any app). */
  fullControl: boolean;
  /** Everything the agent needs from the voice layer; built by useAssistant. */
  agent: Omit<AgentHooks, 'locale'>;
}

/** Name or number -> a phone number. Asks the user when several contacts match. */
async function resolveRecipient(recipient: string, ctx: ActionContext): Promise<string> {
  if (looksLikeNumber(recipient)) return recipient;

  const groups = groupContacts(await Nimah.findContacts(recipient), recipient);
  if (groups.length === 0) throw makeError('CONTACT_NOT_FOUND');
  if (groups.length === 1) return groups[0].numbers[0];

  const options = groups.slice(0, 5).map((g) => ({ label: g.name, value: g }));
  const names = options.map((o, i) => `${i + 1}. ${o.label}`).join(', ');
  const picked = await ctx.askChoice(`${t(ctx.locale, 'whichOne')} ${names}`, options);
  if (!picked) throw makeError('CANCELLED');
  return picked.value.numbers[0];
}

type Handler = (i: Intent, c: ActionContext) => Promise<unknown>;

// Fields were checked by validateIntent(), hence the non-null assertions.
const handlers: Record<string, Handler> = {
  send_whatsapp: async (i, c) =>
    Nimah.openWhatsApp(await resolveRecipient(i.recipient!, c), i.message!, c.countryCode, c.autoSend),
  send_sms: async (i, c) =>
    Nimah.sendSms(await resolveRecipient(i.recipient!, c), i.message!, c.countryCode, c.autoSend),
  call_contact: async (i, c) =>
    Nimah.callNumber(await resolveRecipient(i.recipient!, c), c.countryCode),
  set_alarm: (i) => Nimah.setAlarm(i.hour!, i.minute!, i.message ?? 'Nimah'),
  set_timer: (i) => Nimah.setTimer(Math.round(i.duration_seconds!), i.message ?? 'Nimah'),
  open_app: (i) => Nimah.openApp(i.target!),
  navigate: (i) => Nimah.navigate(i.target!),
  play_music: (i) => Nimah.playMusic(i.target!),
  flashlight: (i) => Nimah.setFlashlight(i.state === 'on'),
};

/** Runs the intent and returns the sentence Nimah should speak. */
export async function executeIntent(intent: Intent, ctx: ActionContext): Promise<string> {
  if (intent.action === 'phone_task') {
    if (!ctx.fullControl) return t(ctx.locale, 'errA11y');
    const res = await runAgent(intent.target!, { ...ctx.agent, locale: ctx.locale });
    return res.reply;
  }
  if (intent.action === 'enable_accessibility') {
    const r = await ensureAccessibility(true);
    return t(ctx.locale, r === 'on' ? 'a11yAlready' : r === 'auto' ? 'a11yAuto' : 'a11yManual');
  }
  const handler = handlers[intent.action];
  if (handler) await handler(intent, ctx);
  return intent.spoken_reply; // for "unknown" this is Gemini's clarifying question
}
