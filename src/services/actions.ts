// src/services/actions.ts — maps a validated Intent to native calls.
import { makeError } from '../errors';
import { t } from '../i18n';
import { ensureAccessibility, Nimah } from '../native/Nimah';
import { Choice, Intent, Locale } from '../types';
import { AgentHooks, runAgent } from './agent';
import { ContactGroup, groupContacts, looksLikeNumber } from './contacts';
import { handoffReply } from './review';

export interface ActionContext {
  countryCode: string;
  locale: Locale;
  autoSend: boolean;
  /** Speaks a question, shows buttons AND listens; resolves null if cancelled. */
  askChoice: (prompt: string, options: Choice<ContactGroup>[]) => Promise<Choice<ContactGroup> | null>;
  /** Shows the recipient + full message; the user may send, edit or cancel. Nothing is sent without it. */
  review: (who: string, message: string) => Promise<{ send: boolean; message: string }>;
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

async function reviewed(i: Intent, c: ActionContext, app: 'WhatsApp' | 'SMS'): Promise<string> {
  const phone = await resolveRecipient(i.recipient!, c);
  const si = c.locale === 'si-LK';
  const r = await c.review(i.recipient!, i.message!);
  if (!r.send) return si ? 'පණිවිඩය යැව්වේ නැහැ සර්. අවලංගු කළා.' : 'Okay sir, I did not send anything.';
  if (app === 'WhatsApp') await Nimah.openWhatsApp(phone, r.message, c.countryCode, c.autoSend);
  else await Nimah.sendSms(phone, r.message, c.countryCode, c.autoSend);
  return handoffReply(si, app, c.autoSend);
}

// Fields were checked by validateIntent(), hence the non-null assertions.
const handlers: Record<string, Handler> = {
  send_whatsapp: (i, c) => reviewed(i, c, 'WhatsApp'),
  send_sms: (i, c) => reviewed(i, c, 'SMS'),
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
  if (handler) {
    try {
      const out = await handler(intent, ctx);
      if ((intent.action === 'send_whatsapp' || intent.action === 'send_sms') && typeof out === 'string') return out;
    }
    catch (e: any) {
      // Unknown app name: let the AI look for it (app drawer / search) instead of giving up.
      if (intent.action === 'open_app' && e?.code === 'APP_NOT_FOUND' && ctx.fullControl) {
        const res = await runAgent(`Open the app called "${intent.target}" (look for it in the app list or search for it).`, { ...ctx.agent, locale: ctx.locale });
        return res.reply;
      }
      throw e;
    }
  }
  return intent.spoken_reply; // for "unknown" this is Gemini's clarifying question
}
