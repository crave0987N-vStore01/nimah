// src/hooks/useAssistant.ts
// Orchestrates: mic -> speech -> Gemini -> action (or AI agent) -> spoken reply.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState } from 'react-native';
import { errorMessage, t } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureAccessibility, Nimah, requestPermissions } from '../native/Nimah';
import { executeIntent } from '../services/actions';
import { matchChoice } from '../services/contacts';
import { parseCommand, resetConversation } from '../services/gemini';
import { quickIntent } from '../services/quick';
import { parseYesNo } from '../services/yesno';
import { Choice, ChoiceRequest, HistoryItem, Intent, Settings, Status } from '../types';

type HistoryEntry = Omit<HistoryItem, 'id' | 'ts'>;
interface PendingChoice {
  options: Choice[];
  resolve: (c: Choice | null) => void;
  retried: boolean;
  parse: (spoken: string, options: Choice[]) => Choice | null;
}

const YES_NO = (yes: string, no: string): Choice<boolean>[] => [
  { label: yes, value: true },
  { label: no, value: false },
];

export function useAssistant(settings: Settings, onHistory: (h: HistoryEntry) => void) {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<ChoiceRequest | null>(null);
  const [progress, setProgress] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);

  const statusRef = useRef<Status>('idle');
  const choiceRef = useRef<PendingChoice | null>(null);
  const askRef = useRef<((text: string | null) => void) | null>(null);
  const busyRef = useRef(false);
  const cancelRef = useRef(false);
  const followUps = useRef(0);
  const greetPending = useRef(false);
  const failRef = useRef(0);
  const micBlockedRef = useRef(false);
  const [kick, setKick] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const level = useRef(new Animated.Value(0)).current;

  const updateStatus = useCallback((s: Status) => { statusRef.current = s; setStatus(s); }, []);
  const restStatus = useCallback(() => updateStatus(busyRef.current ? 'processing' : 'idle'), [updateStatus]);

  const say = useCallback(async (text: string) => {
    const s = settingsRef.current;
    if (!s.speakReplies) { restStatus(); return; }
    updateStatus('speaking');
    try { await Nimah.speak(text, s.locale, s.speechRate); } catch {}
    restStatus();
  }, [restStatus, updateStatus]);

  const hint = useCallback((text: string) => {
    const s = settingsRef.current;
    if (s.speakReplies) Nimah.speak(text, s.locale, s.speechRate).catch(() => {});
  }, []);

  const listen = useCallback(async () => {
    updateStatus('listening');
    try { await Nimah.startListening(settingsRef.current.locale); }
    catch (e: any) { failRef.current += 1; setError(e?.message ?? 'Mic error'); restStatus(); }
  }, [restStatus, updateStatus]);

  const ensureListening = useCallback(async () => {
    if (!settingsRef.current.autoListen) return;
    if (statusRef.current !== 'idle' || busyRef.current || choiceRef.current || askRef.current || micBlockedRef.current) return;
    try { await listen(); } catch {}
  }, [listen]);

  const settleChoice = useCallback((picked: Choice | null) => {
    const pending = choiceRef.current;
    if (!pending) return;
    choiceRef.current = null;
    setChoice(null);
    Nimah.stopSpeaking().catch(() => {});
    Nimah.cancelListening().catch(() => {});
    updateStatus('processing');
    pending.resolve(picked);
  }, [updateStatus]);

  const askOptions = useCallback((
    prompt: string, options: Choice[], parse: PendingChoice['parse'] = matchChoice,
  ) => new Promise<Choice | null>((resolve) => {
    choiceRef.current = { options, resolve, retried: false, parse };
    setChoice({ prompt, options });
    void (async () => {
      await say(prompt);
      if (choiceRef.current) await listen();
    })();
  }), [say, listen]);

  const askChoice = useCallback((prompt: string, options: Choice[]) => askOptions(prompt, options), [askOptions]);

  const confirm = useCallback(async (question: string) => {
    const L = settingsRef.current.locale;
    const picked = await askOptions(question, YES_NO(t(L, 'yes'), t(L, 'no')), (spoken, opts) => {
      const v = parseYesNo(spoken);
      return v === null ? null : opts[v ? 0 : 1];
    });
    return picked?.value === true;
  }, [askOptions]);

  const ask = useCallback(async (question: string) => {
    setProgress(question);
    await say(question);
    return new Promise<string | null>((resolve) => {
      askRef.current = (text) => { askRef.current = null; updateStatus('processing'); resolve(text); };
      void listen();
    });
  }, [say, listen, updateStatus]);

  const handleTranscript = useCallback(async (text: string) => {
    const s = settingsRef.current;
    if (text.trim().length < 2) { restStatus(); setKick((k) => k + 1); return; }
    busyRef.current = true;
    cancelRef.current = false;
    updateStatus('processing');
    let parsed: Intent | null = null;
    let startedService = false;
    try {
      const answeringGreeting = greetPending.current;
      greetPending.current = false;
      const quick = answeringGreeting ? null : quickIntent(text, s.locale);
      if (quick) parsed = quick;
      else {
        const [info, front] = await Promise.all([
          Nimah.deviceInfo().catch(() => null),
          Nimah.screenRead().then((sc) => sc.package).catch(() => null),
        ]);
        const context = [
          info ? `Device info: ${info.date}, ${info.time}, battery ${info.battery}%${info.charging ? ' (charging)' : ''}` : '',
          front && front !== 'unknown' ? `App currently on screen: ${front}` : '',
          answeringGreeting ? 'The user is replying to your greeting "Hello! How are you?". Answer warmly in ONE short sentence (action "answer") and ask what they need.' : '',
        ].filter(Boolean).join('. ') || undefined;
        parsed = await parseCommand(text, context);
      }
      setIntent(parsed);

      if (parsed.action === 'phone_task') {
        if (!s.backgroundService && !s.autoListen) { await Nimah.startBackgroundService().catch(() => {}); startedService = true; }
        setAgentRunning(true);
        setProgress(parsed.spoken_reply);
        hint(parsed.spoken_reply);
      }

      const reply = await executeIntent(parsed, {
        countryCode: s.countryCode,
        locale: s.locale,
        autoSend: s.autoSend,
        askChoice,
        fullControl: s.fullControl,
        agent: {
          maxSteps: s.maxSteps,
          confirmRisky: s.confirmRisky,
          say,
          hint,
          ask,
          confirm,
          onProgress: setProgress,
          isCancelled: () => cancelRef.current,
        },
      });

      busyRef.current = false;
      if (reply.trim() === '...') { setIntent(null); setTranscript(''); restStatus(); return; }
      onHistory({ transcript: text, action: parsed.action, summary: reply, ok: parsed.action !== 'unknown' });
      const follow = s.askBack && parsed.action !== 'unknown' && !cancelRef.current;
      await say(follow ? `${reply} ${t(s.locale, 'anythingElse')}` : reply);

      if (parsed.action === 'unknown' && followUps.current < 2 && !cancelRef.current) {
        followUps.current += 1;
        await listen();
      } else followUps.current = 0;
    } catch (e: any) {
      const m = errorMessage(s.locale, e?.code);
      const detail = String(e?.message ?? '').replace(/\s+/g, ' ').slice(0, 220);
      setError(detail && detail !== e?.code && e?.code !== 'QUOTA_EXCEEDED' ? `${m}\n(${detail})` : m);
      onHistory({ transcript: text, action: parsed?.action ?? 'unknown', summary: m, ok: false });
      busyRef.current = false;
      await say(m);
    } finally {
      busyRef.current = false;
      setAgentRunning(false);
      setProgress('');
      if (startedService && !settingsRef.current.backgroundService && !settingsRef.current.autoListen) Nimah.stopBackgroundService().catch(() => {});
      if (statusRef.current === 'processing') updateStatus('idle');
      setKick((k) => k + 1);
    }
  }, [ask, askChoice, confirm, hint, listen, onHistory, say, updateStatus, restStatus]);

  const onResult = useCallback((text: string) => {
    failRef.current = 0;
    if (text.trim()) setTranscript(text);

    if (askRef.current) { askRef.current(text.trim() ? text : null); return; }

    const pending = choiceRef.current;
    if (pending) {
      const picked = pending.parse(text, pending.options);
      if (picked) { settleChoice(picked); return; }
      if (!pending.retried) {
        pending.retried = true;
        void (async () => {
          await say(t(settingsRef.current.locale, 'whichOne'));
          if (choiceRef.current) await listen();
        })();
      } else settleChoice(null);
      return;
    }

    handleTranscript(text);
  }, [handleTranscript, listen, say, settleChoice]);

  const onSpeechError = useCallback((message: string, code?: number) => {
    if (askRef.current) { askRef.current(null); return; }
    if (choiceRef.current) { settleChoice(null); return; }
    const quiet = code === 6 || code === 7;
    if (code === 9) micBlockedRef.current = true;
    if (quiet) failRef.current = 0; else { failRef.current += 1; if (failRef.current > 2) setError(message); }
    restStatus();
    setKick((k) => k + 1);
  }, [restStatus, settleChoice]);

  const latest = useRef({ onResult, onSpeechError });
  latest.current = { onResult, onSpeechError };

  useEffect(() => {
    const subs = [
      Nimah.on('NimahSpeechPartial', ({ text }) => setTranscript(text)),
      Nimah.on('NimahSpeechResult', ({ text }) => latest.current.onResult(text)),
      Nimah.on('NimahSpeechError', ({ message, code }) => latest.current.onSpeechError(message, code)),
      Nimah.on('NimahSpeechRms', ({ level: db }) => {
        Animated.timing(level, { toValue: Math.max(0, Math.min(1, (db + 2) / 12)), duration: 90, useNativeDriver: true }).start();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [level]);

  const stopTask = useCallback(async () => {
    cancelRef.current = true;
    Nimah.stopSpeaking().catch(() => {});
    Nimah.cancelListening().catch(() => {});
    if (askRef.current) askRef.current(null);
    if (choiceRef.current) settleChoice(null);
  }, [settleChoice]);

  const onMicPress = useCallback(async () => {
    const s = statusRef.current;
    if (busyRef.current && s !== 'listening') { await stopTask(); return; }
    if (s === 'listening') { await Nimah.stopListening(); return; }
    if (s === 'speaking') { await Nimah.stopSpeaking(); restStatus(); return; }
    if (s !== 'idle') return;

    setError('');
    setTranscript('');
    setIntent(null);
    followUps.current = 0;
    const perms = await requestPermissions();
    if (!perms.mic) { setError(errorMessage(settingsRef.current.locale, 'NO_MIC_PERMISSION')); return; }
    await listen();
  }, [listen, restStatus, stopTask]);

  const newConversation = useCallback(() => {
    resetConversation();
    setIntent(null);
    setTranscript('');
    setError('');
    followUps.current = 0;
  }, []);

  useEffect(() => {
    if (settings.backgroundService || settings.autoListen) {
      void requestPermissions().then(() => Nimah.startBackgroundService()).catch(() => {});
    } else {
      Nimah.stopBackgroundService().catch(() => {});
    }
  }, [settings.backgroundService, settings.autoListen]);

  useEffect(() => {
    if (!settings.fullControl) return;
    ensureAccessibility(false).catch(() => {});
    AsyncStorage.getItem('nimah.battery.asked').then((v) => {
      if (!v) {
        AsyncStorage.setItem('nimah.battery.asked', '1').catch(() => {});
        Nimah.requestIgnoreBatteryOptimizations().catch(() => {});
      }
    }).catch(() => {});
  }, [settings.fullControl]);

  const permAsked = useRef(false);
  const greeted = useRef(false);
  const lastGreetAt = useRef(0);

  useEffect(() => {
    if (!settings.autoListen) return undefined;
    if (status !== 'idle' || busyRef.current || choiceRef.current || askRef.current || micBlockedRef.current) return undefined;
    const delay = Math.min(350 * 2 ** failRef.current, 8000);
    const id = setTimeout(async () => {
      if (statusRef.current !== 'idle' || busyRef.current || choiceRef.current || askRef.current) return;
      if (!permAsked.current) {
        permAsked.current = true;
        const perms = await requestPermissions();
        if (!perms.mic) { micBlockedRef.current = true; setError(errorMessage(settingsRef.current.locale, 'NO_MIC_PERMISSION')); return; }
      }
      if (statusRef.current === 'idle' && !busyRef.current && settingsRef.current.askBack && !greeted.current) {
        greeted.current = true;
        lastGreetAt.current = Date.now();
        greetPending.current = settingsRef.current.speakReplies;
        await say(t(settingsRef.current.locale, 'greet'));
      }
      if (statusRef.current === 'idle' && !busyRef.current) await listen();
    }, delay);
    return () => clearTimeout(id);
  }, [settings.autoListen, status, kick, listen, say]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (settingsRef.current.askBack && Date.now() - lastGreetAt.current > 60_000) {
          greeted.current = false;
          setKick((k) => k + 1);
        }
        if (settingsRef.current.autoListen) {
          void ensureListening();
        }
      }
    });
    return () => sub.remove();
  }, [ensureListening]);

  useEffect(() => {
    if (!settings.autoListen && statusRef.current === 'listening') Nimah.cancelListening().then(restStatus).catch(() => {});
  }, [settings.autoListen, restStatus]);

  const sendText = useCallback((text: string) => {
    if (busyRef.current || !text.trim()) return;
    setError('');
    setTranscript(text);
    setIntent(null);
    void handleTranscript(text);
  }, [handleTranscript]);

  return {
    status,
    transcript,
    intent,
    error,
    choice,
    level,
    progress,
    agentRunning,
    onMicPress,
    settleChoice,
    newConversation,
    stopTask,
    sendText,
  };
}
