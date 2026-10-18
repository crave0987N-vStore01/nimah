// src/services/gemini.ts
// Voice text -> validated Intent, with conversation memory, retry and optional backend proxy.
import { Content, GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GEMINI_API_KEY, GEMINI_API_KEYS, GEMINI_MODEL, GEMINI_PROXY_URL, PROXY_TOKEN } from '../config';
import { makeError } from '../errors';
import { AgentStep, Intent } from '../types';
import { AGENT_INSTRUCTION, SYSTEM_INSTRUCTION, buildAgentSchema, buildSchema } from './prompt';
import { validateAgentStep, validateIntent } from './validate';

const MAX_HISTORY_MESSAGES = 12; // last 6 exchanges
let history: Content[] = [];

/** Forget earlier turns ("new conversation"). */
export const resetConversation = () => { history = []; };

function remember(userText: string, modelJson: string) {
  history.push({ role: 'user', parts: [{ text: userText }] });
  history.push({ role: 'model', parts: [{ text: modelJson }] });
  history = history.slice(-MAX_HISTORY_MESSAGES);
  while (history.length && history[0].role !== 'user') history.shift(); // Gemini needs a user-first history
}

// ---- keys + models, with automatic fallback ----------------------------------------------
// Every (model, key) pair has its OWN free quota. On HTTP 429 ("You exceeded your current quota")
// we put that pair to sleep and move on to the next one, so one empty quota never stops Nimah.
const isRealKey = (k?: string) => !!k && !k.startsWith('YOUR_');
let runtimeKeys: string[] = [];                      // keys the user pasted inside the app (KEY button)
const allKeys = () => Array.from(new Set([...runtimeKeys, GEMINI_API_KEY, ...(GEMINI_API_KEYS ?? [])].filter(isRealKey)));
/** Replaces the in-app keys (used first). Clears all cool-downs so the new key is tried at once. */
export function setRuntimeKeys(keys: string[]) { runtimeKeys = keys.map((k) => k.trim()).filter(isRealKey); sleepUntil.clear(); }
// Command parsing is a simple job -> the FAST (lite) models go first. The screen agent reasons more -> smarter first.
const ALL_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const FAST_FIRST = Array.from(new Set(['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', GEMINI_MODEL, ...ALL_MODELS]));
const SMART_FIRST = Array.from(new Set([GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.5-flash', ...ALL_MODELS]));
interface Combo { id: string; key: string; model: string }
const combos = (models: string[]): Combo[] => { const ks = allKeys(); return models.flatMap((m) => ks.map((k) => ({ id: `${m}#${k.slice(-6)}`, key: k, model: m }))); };
const sleepUntil = new Map<string, number>();   // combo id -> epoch ms when it may be used again
const FOREVER = Number.MAX_SAFE_INTEGER;

const errText = (e: unknown) => String((e as Error)?.message ?? e);
const isQuota = (e: unknown) => /\b429\b|quota|RESOURCE_EXHAUSTED|rate.?limit|too many requests/i.test(errText(e));
const isGone = (e: unknown) => /\b404\b|no longer available|not found|is not supported/i.test(errText(e));
const isBusy = (e: unknown) => /\b(500|502|503|504)\b|overloaded|UNAVAILABLE|high demand/i.test(errText(e));
const isDaily = (e: unknown) => /PerDay|per day|daily/i.test(errText(e));

/** Fails fast with a clear message when the build has no Gemini key. */
function requireKey() {
  if (!GEMINI_PROXY_URL && allKeys().length === 0) throw makeError('NO_API_KEY', 'GEMINI_API_KEY is empty in this build');
}

function nextCombo(models: string[]): Combo | null {
  const now = Date.now();
  return combos(models).find((c) => (sleepUntil.get(c.id) ?? 0) <= now) ?? null;
}

/** Runs fn with the first usable (model, key); on quota / overload / retired model, moves to the next. */
async function withModelFallback<T>(fn: (c: Combo) => Promise<T>, models: string[] = FAST_FIRST): Promise<T> {
  let lastErr: unknown;
  for (;;) {
    const c = nextCombo(models);
    if (!c) throw makeError('QUOTA_EXCEEDED', lastErr ? errText(lastErr) : 'All Gemini models/keys are rate-limited');
    try { return await fn(c); }
    catch (e) {
      lastErr = e;
      if (isGone(e)) sleepUntil.set(c.id, FOREVER);
      else if (isQuota(e)) sleepUntil.set(c.id, Date.now() + (isDaily(e) ? 60 * 60_000 : 65_000));
      else if (isBusy(e)) sleepUntil.set(c.id, Date.now() + 15_000);
      else throw e;
    }
  }
}

const modelCache = new Map<string, ReturnType<GoogleGenerativeAI['getGenerativeModel']>>();
function getModel(c: Combo) {
  const id = `chat|${c.id}`;
  let m = modelCache.get(id);
  if (!m) {
    m = new GoogleGenerativeAI(c.key).getGenerativeModel({
      model: c.model,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: buildSchema(SchemaType),
        temperature: 0.1,
      },
    });
    modelCache.set(id, m);
  }
  return m;
}

/** One round-trip: direct to Gemini (dev) or through your backend (production). */
async function callModel(text: string, context?: string): Promise<string> {
  requireKey();
  const sent = context ? `${text}\n\n(${context})` : text;
  if (GEMINI_PROXY_URL) {
    const res = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nimah-token': PROXY_TOKEN },
      body: JSON.stringify({ text: sent, history }),
    });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    return (await res.json()).text as string;
  }
  return withModelFallback(async (c) => {
    const chat = getModel(c).startChat({ history });
    const result = await chat.sendMessage(sent);
    return result.response.text();
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Gemini request timed out')), ms))]);

/**
 * @param text transcript from speech recognition
 * Retries with exponential backoff (0.5s, 1s) on network / parse / validation failures.
 */
export async function parseCommand(text: string, context?: string, attempts = 3): Promise<Intent> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await withTimeout(callModel(text, context), 12000);
      const intent = validateIntent(JSON.parse(raw));
      remember(text, raw);
      return intent;
    } catch (e) {
      if (['NO_API_KEY', 'QUOTA_EXCEEDED'].includes((e as { code?: string })?.code ?? '')) throw e;
      lastError = e;
      if (i < attempts - 1) await sleep(500 * 2 ** i);
    }
  }
  throw makeError('GEMINI_FAILED', String((lastError as Error)?.message ?? lastError));
}

// ---------------------------------------------------------------------------------------
// Agent: one decision per screen. Stateless — the step log is part of the prompt.
// ---------------------------------------------------------------------------------------
function getAgentModel(c: Combo) {
  const id = `agent|${c.id}`;
  let m = modelCache.get(id);
  if (!m) {
    m = new GoogleGenerativeAI(c.key).getGenerativeModel({
      model: c.model,
      systemInstruction: AGENT_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: buildAgentSchema(SchemaType),
        temperature: 0.2,
      },
    });
    modelCache.set(id, m);
  }
  return m;
}

/** "https://host/nimah" -> "https://host/agent" */
const agentProxyUrl = () => GEMINI_PROXY_URL.replace(/\/nimah\/?$/, '') + '/agent';

async function callAgentModel(prompt: string, imageBase64: string | null): Promise<string> {
  requireKey();
  if (GEMINI_PROXY_URL) {
    const res = await fetch(agentProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nimah-token': PROXY_TOKEN },
      body: JSON.stringify({ prompt, image: imageBase64 }),
    });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    return (await res.json()).text as string;
  }
  const parts: any[] = [{ text: prompt }];
  if (imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
  return withModelFallback(async (c) => {
    const result = await getAgentModel(c).generateContent({ contents: [{ role: 'user', parts }] });
    return result.response.text();
  }, SMART_FIRST);
}

/** Asks Gemini for the next single action. Retries on network / parse errors. */
export async function decideNextStep(
  prompt: string, imageBase64: string | null, screenCount: number, attempts = 3,
): Promise<AgentStep> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await withTimeout(callAgentModel(prompt, imageBase64), 16000);
      return validateAgentStep(JSON.parse(raw), screenCount);
    } catch (e) {
      if (['NO_API_KEY', 'QUOTA_EXCEEDED'].includes((e as { code?: string })?.code ?? '')) throw e;
      lastError = e;
      if (i < attempts - 1) await sleep(500 * 2 ** i);
    }
  }
  throw makeError('GEMINI_FAILED', String((lastError as Error)?.message ?? lastError));
}
