// backend/server.js — keeps the Gemini key (and prompt) off the phone.
//   cd backend && npm install
//   GEMINI_API_KEY=... NIMAH_TOKEN=some-long-random-string npm start
// Deploy anywhere that runs Node (Cloud Run, Render, Fly.io, a VPS). It requires
// ../src/services/prompt.js, so deploy the whole project folder (or copy that file).
const express = require('express');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { SYSTEM_INSTRUCTION, buildSchema, AGENT_INSTRUCTION, buildAgentSchema } = require('../src/services/prompt');

const { GEMINI_API_KEY, NIMAH_TOKEN, PORT = 8787 } = process.env;
if (!GEMINI_API_KEY || !NIMAH_TOKEN) {
  console.error('Set GEMINI_API_KEY and NIMAH_TOKEN'); process.exit(1);
}

const model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  systemInstruction: SYSTEM_INSTRUCTION,
  generationConfig: { responseMimeType: 'application/json', responseSchema: buildSchema(SchemaType), temperature: 0.1 },
});

const agentModel = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  systemInstruction: AGENT_INSTRUCTION,
  generationConfig: { responseMimeType: 'application/json', responseSchema: buildAgentSchema(SchemaType), temperature: 0.2 },
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' })); // agent requests may carry a small JPEG screenshot

// Tiny in-memory rate limit: 120 requests / minute / IP.
const hits = new Map(); // /nimah is one call per command; /agent is one per screen step, so the limit is higher
app.use((req, res, next) => {
  const now = Date.now();
  const h = hits.get(req.ip);
  if (!h || now > h.reset) hits.set(req.ip, { count: 1, reset: now + 60_000 });
  else if (++h.count > 120) return res.status(429).json({ error: 'rate_limited' });
  next();
});

app.post('/nimah', async (req, res) => {
  if (req.get('x-nimah-token') !== NIMAH_TOKEN) return res.status(401).json({ error: 'unauthorized' });

  const { text, history } = req.body ?? {};
  const validHistory = Array.isArray(history) && history.length <= 20 &&
    history.every((m) => (m.role === 'user' || m.role === 'model') && typeof m.parts?.[0]?.text === 'string');
  if (typeof text !== 'string' || !text.trim() || text.length > 1000 || !validHistory) {
    return res.status(400).json({ error: 'bad_request' });
  }

  try {
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(text);
    res.json({ text: result.response.text() });
  } catch (e) {
    console.error('Gemini error:', e.message);
    res.status(502).json({ error: 'gemini_failed' });
  }
});

// One step of the phone-driving agent: { prompt, image? (base64 JPEG) } -> { text: "<json step>" }
app.post('/agent', async (req, res) => {
  if (req.get('x-nimah-token') !== NIMAH_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const { prompt, image } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 30000 ||
      (image != null && (typeof image !== 'string' || image.length > 600000))) {
    return res.status(400).json({ error: 'bad_request' });
  }
  try {
    const parts = [{ text: prompt }];
    if (image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
    const result = await agentModel.generateContent({ contents: [{ role: 'user', parts }] });
    res.json({ text: result.response.text() });
  } catch (e) {
    console.error('Gemini agent error:', e.message);
    res.status(502).json({ error: 'gemini_failed' });
  }
});

// Screen description: { prompt, image (base64 JPEG) } -> { text }
const plainModel = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-2.5-flash-lite', generationConfig: { temperature: 0.2 } });
app.post('/describe', async (req, res) => {
  if (req.get('x-nimah-token') !== NIMAH_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const { prompt, image } = req.body ?? {};
  if (typeof prompt !== 'string' || prompt.length > 1000 || typeof image !== 'string' || image.length > 600000) {
    return res.status(400).json({ error: 'bad_request' });
  }
  try {
    const result = await plainModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: image } }] }] });
    res.json({ text: result.response.text() });
  } catch (e) {
    console.error('Gemini describe error:', e.message);
    res.status(502).json({ error: 'gemini_failed' });
  }
});

app.get('/health', (_req, res) => res.send('ok'));
app.listen(PORT, () => console.log(`Nimah backend on :${PORT}`));
