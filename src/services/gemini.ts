// src/services/gemini.ts
// Voice text -> validated Intent, with conversation memory, retry and optional backend proxy.
import { Content, GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_PROXY_URL, PROXY_TOKEN } from '../config';
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

/** Fails fast with a clear message when the build has no Gemini key. */
function requireKey() {
  if (!GEMINI_PROXY_URL && (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith('YOUR_'))) {
    throw makeError('NO_API_KEY', 'GEMINI_API_KEY is empty in this build');
  }
}

let model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
function getModel() {
  if (!model) {
    model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: buildSchema(SchemaType),
        temperature: 0.1,
      },
    });
  }
  return model;
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
  const chat = getModel().startChat({ history });
  const result = await chat.sendMessage(sent);
  return result.response.text();
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
      const raw = await withTimeout(callModel(text, context), 15000);
      const intent = validateIntent(JSON.parse(raw));
      remember(text, raw);
      return intent;
    } catch (e) {
      if ((e as { code?: string })?.code === 'NO_API_KEY') throw e;
      lastError = e;
      if (i < attempts - 1) await sleep(500 * 2 ** i);
    }
  }
  throw makeError('GEMINI_FAILED', String((lastError as Error)?.message ?? lastError));
}

// ---------------------------------------------------------------------------------------
// Agent: one decision per screen. Stateless — the step log is part of the prompt.
// ---------------------------------------------------------------------------------------
let agentModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
function getAgentModel() {
  if (!agentModel) {
    agentModel = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: AGENT_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: buildAgentSchema(SchemaType),
        temperature: 0.2,
      },
    });
  }
  return agentModel;
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
  const result = await getAgentModel().generateContent({ contents: [{ role: 'user', parts }] });
  return result.response.text();
}

/** Asks Gemini for the next single action. Retries on network / parse errors. */
export async function decideNextStep(
  prompt: string, imageBase64: string | null, screenCount: number, attempts = 3,
): Promise<AgentStep> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await withTimeout(callAgentModel(prompt, imageBase64), 25000);
      return validateAgentStep(JSON.parse(raw), screenCount);
    } catch (e) {
      if ((e as { code?: string })?.code === 'NO_API_KEY') throw e;
      lastError = e;
      if (i < attempts - 1) await sleep(500 * 2 ** i);
    }
  }
  throw makeError('GEMINI_FAILED', String((lastError as Error)?.message ?? lastError));
}
