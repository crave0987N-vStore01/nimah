// src/hooks/useAssistant.ts
// Orchestrates: mic -> speech -> Gemini -> action (or AI agent) -> spoken reply.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { errorMessage, t } from '../i18n';
import { Nimah, requestPermissions } from '../native/Nimah';
import { executeIntent } from '../services/actions';
import { matchChoice } from '../services/contacts';
import { parseCommand, resetConversation } from '../services/gemini';
import { parseYesNo } from '../services/yesno';
import { Choice, ChoiceRequest, HistoryItem, Intent, Settings, Status } from '../types';

type HistoryEntry = Omit<HistoryItem, 'id' | 'ts'>;
interface PendingChoice {
  options: Choice[];
  resolve: (c: Choice | null) => void;
  retried: boolean;
  /** How a spoken answer is turned into an option (default: by name / ordinal). */
  parse: (spoken: string, options: Choice[]) => Choice | null;
}

const YES_NO = (yes: string, no: string): Choice<boolean>[] => [
  { label: yes, value: true }, { label: no, value: false },
];

export function useAssistant(settings: Settings, onHistory: (h: HistoryEntry) => void) {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<ChoiceRequest | null>(null);
  const [progress, setProgress] = useState('');          // what the AI is doing right now
  const [agentRunning, setAgentRunning] = useState(false);

  const statusRef = useRef<Status>('idle');
  const choiceRef = useRef<PendingChoice | null>(null);
  const askRef = useRef<((text: string | null) => void) | null>(null);
  const busyRef = useRef(false);                          // true while a command / agent task runs
  const cancelRef = useRef(false);
  const followUps = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const level = useRef(new Animated.Value(0)).current;    // mic loudness 0..1 for the waveform

  const updateStatus = useCallback((s: Status) => { statusRef.current = s; setStatus(s); }, []);
  const restStatus = useCallback(() => updateStatus(busyRef.current ? 'processing' : 'idle'), [updateStatus]);

  // ---- speech out ------------------------------------------------------------
  const say = useCallback(async (text: string) => {
    const s = settingsRef.current;
    if (!s.speakReplies) { restStatus(); return; }
    updateStatus('speaking');
    try { await Nimah.speak(text, s.locale, s.speechRate); } catch { /* TTS failure is non-fatal */ }
    restStatus();
  }, [restStatus, updateStatus]);

  /** Speak without waiting (progress chatter while the AI works). */
  const hint = useCallback((text: string) => {
    const s = settingsRef.current;
    if (s.speakReplies) Nimah.speak(text, s.locale, s.speechRate).catch(() => {});
  }, []);

  // ---- speech in -------------------------------------------------------------
  const listen = useCallback(async () => {
    updateStatus('listening');
    try { await Nimah.startListening(settingsRef.current.locale); }
    catch (e: any) { setError(e?.message ?? 'Mic error'); restStatus(); }
  }, [restStatus, updateStatus]);

  // ---- choices: "which Asanka?" and yes / no ------------------------------------------
  const settleChoice = useCallback((picked: Choice | null) => {
    const pending = choiceRef.current;
    if (!pending) return;
    choiceRef.current = null;
    setChoice(null);
    Nimah.stopSpeaking().catch(() => {});
    Nimah.cancelListening().catch(() => {}); // silent: no result event
    updateStatus('processing');
    pending.resolve(picked);
  }, [updateStatus]);

  const askOptions = useCallback((
    prompt: string, options: Choice[], parse: PendingChoice['parse'] = matchChoice,
  ) => new Promise<Choice | null>((resolve) => {
    choiceRef.current = { options, resolve, retried: false, parse };
    setChoice({ prompt, options });
    (async () => {
      await say(prompt);
      if (choiceRef.current) await listen(); // still unanswered (no tap) -> listen for voice
    })();
  }), [say, listen]);

  const askChoice = useCallback((prompt: string, options: Choice[]) => askOptions(prompt, options), [askOptions]);

  /** Spoken yes / no (buttons work too). Unclear or no answer = NO (safe default). */
  const confirm = useCallback(async (question: string) => {
    const L = settingsRef.current.locale;
    const picked = await askOptions(question, YES_NO(t(L, 'yes'), t(L, 'no')),
      (spoken, opts) => {
        const v = parseYesNo(spoken);
        return v === null ? null : opts[v ? 0 : 1];
      });
    return picked?.value === true;
  }, [askOptions]);

  /** Speaks a question and returns the person's free-form answer (null = none). */
  const ask = useCallback(async (question: string) => {
    setProgress(question);
    await say(question);
    return new Promise<string | null>((resolve) => {
      askRef.current = (text) => { askRef.current = null; updateStatus('processing'); resolve(text); };
      listen();
    });
  }, [say, listen, updateStatus]);

  // ---- the main pipeline ---------------------------------------------------------
  const handleTranscript = useCallback(async (text: string) => {
    const s = settingsRef.current;
    if (!text.trim()) { await say(t(s.locale, 'didntCatch')); return; }
    busyRef.current = true;
    cancelRef.current = false;
    updateStatus('processing');
    let parsed: Intent | null = null;
    let startedService = false;
    try {
      const info = await Nimah.deviceInfo().catch(() => null);
      const context = info
        ? `Device info: ${info.date}, ${info.time}, battery ${info.battery}%${info.charging ? ' (charging)' : ''}`
        : undefined;
      parsed = await parseCommand(text, context);
      setIntent(parsed);

      if (parsed.action === 'phone_task') {
        // Keep the mic + process alive while other apps are in front.
        if (!s.backgroundService) { await Nimah.startBackgroundService().catch(() => {}); startedService = true; }
        setAgentRunning(true);
        setProgress(parsed.spoken_reply);
        hint(parsed.spoken_reply);
      }

      const reply = await executeIntent(parsed, {
        countryCode: s.countryCode, locale: s.locale, autoSend: s.autoSend, askChoice,
        fullControl: s.fullControl,
        agent: {
          maxSteps: s.maxSteps, confirmRisky: s.confirmRisky,
          say, hint, ask, confirm, onProgress: setProgress, isCancelled: () => cancelRef.current,
        },
      });
      onHistory({ transcript: text, action: parsed.action, summary: reply, ok: parsed.action !== 'unknown' });
      busyRef.current = false;
      await say(reply);

      // Assistant asked a question -> listen for the answer without another tap.
      if (parsed.action === 'unknown' && followUps.current < 2 && !cancelRef.current) {
        followUps.current += 1;
        await listen();
      } else followUps.current = 0;
    } catch (e: any) {
      const m = errorMessage(s.locale, e?.code);
      const detail = String(e?.message ?? '').replace(/\s+/g, ' ').slice(0, 220);
      setError(detail && detail !== e?.code ? `${m}\n(${detail})` : m);
      onHistory({ transcript: text, action: parsed?.action ?? 'unknown', summary: m, ok: false });
      busyRef.current = false;
      await say(m);
    } finally {
      busyRef.current = false;
      setAgentRunning(false);
      setProgress('');
      if (startedService && !settingsRef.current.backgroundService) Nimah.stopBackgroundService().catch(() => {});
      if (statusRef.current === 'processing') updateStatus('idle');
    }
  }, [ask, askChoice, confirm, hint, listen, onHistory, say, updateStatus]);

  const onResult = useCallback((text: string) => {
    setTranscript(text);

    // 1) The AI asked a free-form question
    if (askRef.current) { askRef.current(text.trim() ? text : null); return; }

    // 2) A choice / yes-no is waiting
    const pending = choiceRef.current;
    if (pending) {
      const picked = pending.parse(text, pending.options);
      if (picked) { settleChoice(picked); return; }
      if (!pending.retried) {                       // one polite retry
        pending.retried = true;
        (async () => { await say(t(settingsRef.current.locale, 'whichOne')); if (choiceRef.current) await listen(); })();
      } else settleChoice(null);
      return;
    }

    // 3) A normal new command
    handleTranscript(text);
  }, [handleTranscript, listen, say, settleChoice]);

  const onSpeechError = useCallback((message: string) => {
    if (askRef.current) { askRef.current(null); return; }
    if (choiceRef.current) { settleChoice(null); return; }
    setError(message);
    restStatus();
  }, [restStatus, settleChoice]);

  // Subscribe once; always call the latest handlers via a ref.
  const latest = useRef({ onResult, onSpeechError });
  latest.current = { onResult, onSpeechError };
  useEffect(() => {
    const subs = [
      Nimah.on('NimahSpeechPartial', ({ text }) => setTranscript(text)),
      Nimah.on('NimahSpeechResult', ({ text }) => latest.current.onResult(text)),
      Nimah.on('NimahSpeechError', ({ message }) => latest.current.onSpeechError(message)),
      Nimah.on('NimahSpeechRms', ({ level: db }) => {
        Animated.timing(level, { toValue: Math.max(0, Math.min(1, (db + 2) / 12)), duration: 90, useNativeDriver: true }).start();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [level]);

  // ---- stop everything (button or emergency key) -------------------------------------
  const stopTask = useCallback(async () => {
    cancelRef.current = true;
    Nimah.stopSpeaking().catch(() => {});
    Nimah.cancelListening().catch(() => {});
    if (askRef.current) askRef.current(null);
    if (choiceRef.current) settleChoice(null);
  }, [settleChoice]);

  // ---- mic button ----------------------------------------------------------------
  const onMicPress = useCallback(async () => {
    const s = statusRef.current;
    if (busyRef.current && s !== 'listening') { await stopTask(); return; } // tap while the AI works = stop
    if (s === 'listening') { await Nimah.stopListening(); return; }
    if (s === 'speaking') { await Nimah.stopSpeaking(); restStatus(); return; }
    if (s !== 'idle') return;

    setError(''); setTranscript(''); setIntent(null); followUps.current = 0;
    const perms = await requestPermissions();
    if (!perms.mic) { setError(errorMessage(settingsRef.current.locale, 'NO_MIC_PERMISSION')); return; }
    await listen();
  }, [listen, restStatus, stopTask]);

  const newConversation = useCallback(() => {
    resetConversation(); setIntent(null); setTranscript(''); setError(''); followUps.current = 0;
  }, []);

  // ---- background (foreground-service) mode ----------------------------------------
  useEffect(() => {
    if (settings.backgroundService) requestPermissions().then(() => Nimah.startBackgroundService()).catch(() => {});
    else Nimah.stopBackgroundService().catch(() => {});
  }, [settings.backgroundService]);

  return {
    status, transcript, intent, error, choice, level, progress, agentRunning,
    onMicPress, settleChoice, newConversation, stopTask,
  };
}
