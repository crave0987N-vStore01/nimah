// src/hooks/useAssistant.ts
// Orchestrates: mic -> speech -> Gemini -> action (or AI agent) -> spoken reply.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Share } from 'react-native';
import { errorMessage, t } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureAccessibility, Nimah, requestPermissions } from '../native/Nimah';
import { otherLocale, pickBestAlternative, shouldRetryOtherLocale, ERROR_SPEECH_TIMEOUT } from '../services/bilingual';
import { extendWindow, gateWake } from '../services/hotword';
import { HardwareApi, parseHardware, runHardware } from '../services/hardware';
import { runPlan, splitSteps } from '../services/multistep';
import { callAnnouncement, parseCallCommand } from '../services/calls';
import { DeviceCtx, runDeviceCommand } from '../services/commands';
import { parseEmergency } from '../services/emergency';
import { describeScreen } from '../services/gemini';
import { announceMessage, Dedupe, IncomingMessage, parseReplyDecision } from '../services/incoming';
import { matchRoutine } from '../services/routines';
import { loadRoutines, saveRoutines } from '../services/routineStore';
import { AuthSession, decideVoice, gateCommand, isSensitiveAction } from '../services/voicelock';
import { executeIntent } from '../services/actions';
import { matchChoice } from '../services/contacts';
import { parseCommand, resetConversation } from '../services/gemini';
import { quickIntent } from '../services/quick';
import { runLocal } from '../services/local';
import { loadData, saveData } from '../services/storage';
import { parseReviewReply } from '../services/review';
import { FEATURE_COUNT } from '../capabilities';
import { speakWith } from '../services/speech';
import { parseYesNo } from '../services/yesno';
import { Choice, ChoiceRequest, HistoryItem, Intent, Locale, Settings, Status } from '../types';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; ts: number }
type HistoryEntry = Omit<HistoryItem, 'id' | 'ts'>;
interface PendingChoice {
  options: Choice[];
  resolve: (c: Choice | null) => void;
  retried: boolean;
  parse: (spoken: string, options: Choice[]) => Choice | null;
}

const hwApi: HardwareApi = {
  setWifi: (on) => Nimah.setWifi(on),
  setBluetooth: (on) => Nimah.setBluetooth(on),
  getBrightness: () => Nimah.getBrightness(),
  setBrightness: async (p) => {
    const r = await Nimah.setBrightness(p);
    if (r === 'needs_permission') Nimah.openWriteSettings().catch(() => {});
    return r;
  },
};

interface SpeechExtras { alternatives?: string[]; confidences?: number[]; voiceScore?: number }
type PlanPart = { part: number; total: number };

const YES_NO = (yes: string, no: string): Choice<boolean>[] => [
  { label: yes, value: true },
  { label: no, value: false },
];

export function useAssistant(settings: Settings, onHistory: (h: HistoryEntry) => void) {
  const [status, setStatus] = useState<Status>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const lastReplyRef = useRef('');
  const newChatRef = useRef<() => void>(() => {});
  const pushMsg = useCallback((role: ChatMessage['role'], text: string) => {
    if (!text.trim()) return;
    const now = Date.now();
    setMessages((m) => [...m, { id: `${now}-${m.length}`, role, text: text.trim(), ts: now }].slice(-60));
  }, []);
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
  const pausedRef = useRef(false);                 // mic paused (e.g. voice-lock enrolment needs the microphone)
  const planRef = useRef(false);                   // a multi-step plan is running
  const activeUntilRef = useRef(0);                // follow-ups before this time need no wake word
  const retriedLocaleRef = useRef(false);
  const listenLocaleRef = useRef<Locale>(settings.locale);
  const voiceEnrolledRef = useRef(false);
  const authSession = useRef(new AuthSession()).current;
  const overlayRef = useRef(false);                // numbered overlay is showing
  const callPromptRef = useRef(false);             // an incoming-call prompt is open
  const dedupe = useRef(new Dedupe()).current;
  const handleRef = useRef<(t: string, o?: PlanPart) => Promise<boolean>>(async () => false);
  const [kick, setKick] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const level = useRef(new Animated.Value(0)).current;

  const updateStatus = useCallback((s: Status) => { statusRef.current = s; setStatus(s); }, []);
  const restStatus = useCallback(() => updateStatus(busyRef.current ? 'processing' : 'idle'), [updateStatus]);

  const say = useCallback(async (text: string) => {
    const s = settingsRef.current;
    pushMsg('assistant', text);
    if (!s.speakReplies) { restStatus(); return; }
    updateStatus('speaking');
    try { await speakWith(text, s); } catch {}
    restStatus();
  }, [restStatus, updateStatus, pushMsg]);

  const hint = useCallback((text: string) => {
    const s = settingsRef.current;
    if (s.speakReplies) speakWith(text, s).catch(() => {});
  }, []);

  const listen = useCallback(async (localeOverride?: Locale) => {
    updateStatus('listening');
    const s = settingsRef.current;
    const loc = localeOverride ?? s.locale;
    listenLocaleRef.current = loc;
    try {
      if (s.voiceLock) voiceEnrolledRef.current = await Nimah.voiceIsEnrolled().catch(() => false);
      await Nimah.startListeningEx(loc, !!s.preferOffline, !!s.voiceLock && voiceEnrolledRef.current, s.autoLanguage ? otherLocale(loc) : '');
    } catch (e: any) { failRef.current += 1; setError(e?.message ?? 'Mic error'); restStatus(); }
  }, [restStatus, updateStatus]);

  const ensureListening = useCallback(async () => {
    if (!settingsRef.current.autoListen) return;
    if (statusRef.current !== 'idle' || busyRef.current || choiceRef.current || askRef.current || micBlockedRef.current || pausedRef.current || planRef.current) return;
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
    if (question) { setProgress(question); await say(question); }
    return new Promise<string | null>((resolve) => {
      askRef.current = (text) => { askRef.current = null; updateStatus('processing'); resolve(text); };
      void listen();
    });
  }, [say, listen, updateStatus]);

  const review = useCallback(async (who: string, message: string) => {
    const si = settingsRef.current.locale === 'si-LK';
    let msg = message;
    for (let round = 0; round < 5; round += 1) {
      const options: Choice[] = [
        { label: si ? 'යවන්න' : 'Send', value: 'send' },
        { label: si ? 'වෙනස් කරන්න' : 'Edit', value: 'edit' },
        { label: si ? 'අවලංගු' : 'Cancel', value: 'cancel' },
      ];
      const prompt = si ? `${who} ට: "${msg}". යවන්නද, වෙනස් කරන්නද, අවලංගු කරන්නද?` : `To ${who}: "${msg}". Send, edit, or cancel?`;
      const picked = await askOptions(prompt, options, (spoken, o) => {
        const v = parseReviewReply(spoken);
        return v ? o.find((x) => x.value === v) ?? null : null;
      });
      if (!picked || picked.value === 'cancel') return { send: false, message: msg };
      if (picked.value === 'send') return { send: true, message: msg };
      const edited = await ask(si ? 'අලුත් පණිවිඩය මොකක්ද?' : 'What should the message say?');
      if (!edited) return { send: false, message: msg };
      msg = edited.trim();
    }
    return { send: false, message: msg };
  }, [askOptions, ask]);

  /** Fingerprint / face / PIN, remembered for a minute. Resolves ok | denied | unavailable. */
  const deviceAuth = useCallback(async (reason: string): Promise<'ok' | 'denied' | 'unavailable'> => {
    if (authSession.valid(Date.now())) return 'ok';
    hint(t(settingsRef.current.locale, 'deviceUnlockNeeded'));
    const r = await Nimah.authenticate(reason).catch(() => 'unavailable');
    if (r === 'ok') { authSession.grant(Date.now()); return 'ok'; }
    return r === 'unavailable' ? 'unavailable' : 'denied';
  }, [authSession, hint]);

  /** Owner-voice filter. A mismatch is a SOFT failure: the owner can still continue with the phone's own unlock. */
  const voiceGate = useCallback(async (voiceScore?: number): Promise<boolean> => {
    const s = settingsRef.current;
    if (!s.voiceLock) return true;
    voiceEnrolledRef.current = await Nimah.voiceIsEnrolled().catch(() => false);
    const decision = decideVoice(voiceScore, s.voiceSensitivity, voiceEnrolledRef.current);
    const outcome = gateCommand({ voiceLock: true, decision, sensitive: false, sessionValid: authSession.valid(Date.now()) });
    if (outcome === 'allow') return true;
    const r = await deviceAuth(s.locale === 'si-LK' ? 'ඔබ බව තහවුරු කරන්න' : 'Confirm it is you');
    if (r === 'ok') return true;
    await say(t(s.locale, r === 'unavailable' ? 'deviceUnlockUnavailable' : 'voiceDenied'));
    return false;
  }, [authSession, deviceAuth, say]);

  const handleTranscript = useCallback(async (text: string, opts?: PlanPart): Promise<boolean> => {
    const s = settingsRef.current;
    if (text.trim().length < 2) { restStatus(); setKick((k) => k + 1); return false; }

    // "open YouTube and then search lofi" -> ordered steps (each runs through this same function).
    const routine = opts ? null : matchRoutine(text, await loadRoutines());
    if (!opts && (routine || s.multiStep)) {
      const steps = routine ? routine.steps : splitSteps(text);
      if (routine || steps.length > 1) {
        pushMsg('user', text);
        planRef.current = true;
        try {
          const out = await runPlan(steps, (st, i, total) => handleRef.current(st, { part: i, total }), () => cancelRef.current);
          if (!out.ok && !cancelRef.current) await say(t(s.locale, 'planStopped'));
          return out.ok;
        } finally {
          planRef.current = false;
          setKick((k) => k + 1);
        }
      }
    }
    busyRef.current = true;
    cancelRef.current = false;
    updateStatus('processing');
    let parsed: Intent | null = null;
    let startedService = false;
    try {
      const answeringGreeting = greetPending.current;
      greetPending.current = false;
      if (!opts) pushMsg('user', text);
      const si = s.locale === 'si-LK' || /[\u0D80-\u0DFF]/.test(text);
      const hw = answeringGreeting ? null : parseHardware(text);
      const hwReply = hw ? await runHardware(hw, hwApi, si) : null;
      const deviceCtx: DeviceCtx = {
        si, native: Nimah as any, overlay: { get: () => overlayRef.current, set: (v) => { overlayRef.current = v; } },
        ask, say, confirm, describe: describeScreen, emergencyContacts: s.emergencyContacts, countryCode: s.countryCode,
        routines: { load: loadRoutines, save: saveRoutines },
      };
      const devReply = hwReply !== null || answeringGreeting ? null : await runDeviceCommand(text, deviceCtx).catch((e) => {
        const code = String(e?.code ?? '');
        return code === 'A11Y_NOT_ENABLED' ? t(s.locale, 'errA11y') : null;
      });
      const localReply = hwReply ?? devReply ?? (answeringGreeting ? null : await runLocal(text, {
        locale: s.locale, now: () => new Date(), lastReply: lastReplyRef.current, featureCount: FEATURE_COUNT,
        data: loadData, save: saveData, confirm, newChat: () => newChatRef.current(),
        share: async (m) => { await Share.share({ message: m }); },
        native: {
          openSettings: Nimah.openSettings, openUrl: Nimah.openUrl, setVolume: Nimah.setVolume,
          setTimer: Nimah.setTimer, setAlarm: Nimah.setAlarm, deviceInfo: Nimah.deviceInfo, screenRead: Nimah.screenRead,
          scheduleReminder: Nimah.scheduleReminder, cancelReminder: Nimah.cancelReminder,
        },
      }).catch(() => null));
      const quick = answeringGreeting || localReply !== null ? null : quickIntent(text, s.locale);
      if (localReply !== null) {
        parsed = { action: 'answer', app: 'none', recipient: null, message: null, target: null, hour: null, minute: null,
          duration_seconds: null, state: null, spoken_reply: localReply };
      } else if (quick) parsed = quick;
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

      // Messages always need the phone's own unlock when Voice lock is on (a voice match alone is never enough).
      if (s.voiceLock && isSensitiveAction(parsed.action)) {
        voiceEnrolledRef.current = await Nimah.voiceIsEnrolled().catch(() => false);
        const outcome = gateCommand({ voiceLock: true, decision: voiceEnrolledRef.current ? 'match' : 'not_enrolled', sensitive: true, sessionValid: authSession.valid(Date.now()) });
        if (outcome === 'needDeviceAuth') {
          const r = await deviceAuth(s.locale === 'si-LK' ? 'පණිවිඩය යවන්න තහවුරු කරන්න' : 'Confirm to send the message');
          if (r !== 'ok') {
            busyRef.current = false;
            await say(t(s.locale, r === 'unavailable' ? 'deviceUnlockUnavailable' : 'voiceDenied'));
            return false;
          }
        }
      }

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
        review,
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
          authorize: async (reason: string) => {
            if (!settingsRef.current.voiceLock) return true;
            voiceEnrolledRef.current = await Nimah.voiceIsEnrolled().catch(() => false);
            if (!voiceEnrolledRef.current) return true;
            return (await deviceAuth(reason)) === 'ok';
          },
        },
      });

      busyRef.current = false;
      if (reply.trim() === '...') { setIntent(null); setTranscript(''); restStatus(); return true; }
      lastReplyRef.current = reply;
      onHistory({ transcript: text, action: parsed.action, summary: reply, ok: parsed.action !== 'unknown' });
      const lastPart = !opts || opts.part === opts.total - 1;
      const follow = s.askBack && parsed.action !== 'unknown' && !cancelRef.current && lastPart;
      await say(follow ? `${reply} ${t(s.locale, 'anythingElse')}` : reply);

      if (parsed.action === 'unknown' && !opts && followUps.current < 2 && !cancelRef.current) {
        followUps.current += 1;
        await listen();
      } else followUps.current = 0;
      return parsed.action !== 'unknown' && !cancelRef.current;
    } catch (e: any) {
      const m = errorMessage(s.locale, e?.code);
      const detail = String(e?.message ?? '').replace(/\s+/g, ' ').slice(0, 220);
      setError(detail && detail !== e?.code && e?.code !== 'QUOTA_EXCEEDED' ? `${m}\n(${detail})` : m);
      onHistory({ transcript: text, action: parsed?.action ?? 'unknown', summary: m, ok: false });
      busyRef.current = false;
      await say(m);
      return false;
    } finally {
      activeUntilRef.current = extendWindow(Date.now());
      busyRef.current = false;
      setAgentRunning(false);
      setProgress('');
      if (startedService && !settingsRef.current.backgroundService && !settingsRef.current.autoListen) Nimah.stopBackgroundService().catch(() => {});
      if (statusRef.current === 'processing') updateStatus('idle');
      setKick((k) => k + 1);
    }
  }, [ask, askChoice, confirm, review, hint, listen, onHistory, say, pushMsg, updateStatus, restStatus, authSession, deviceAuth]);
  handleRef.current = handleTranscript;

  const onResult = useCallback((rawText: string, extras: SpeechExtras = {}) => {
    failRef.current = 0;
    retriedLocaleRef.current = false;
    const s = settingsRef.current;
    const alts = (extras.alternatives ?? []).map((a, i) => ({ text: a, confidence: extras.confidences?.[i] }));
    const text = alts.length > 1 ? pickBestAlternative(alts, listenLocaleRef.current) || rawText : rawText;

    if (askRef.current) { if (text.trim()) setTranscript(text); askRef.current(text.trim() ? text : null); return; }

    const pending = choiceRef.current;
    if (pending) {
      if (text.trim()) setTranscript(text);
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

    // "help" / "උදව්" always works: no wake word, no voice check (a person in trouble may be anyone).
    if (parseEmergency(text)) { Nimah.wakeScreen().catch(() => {}); setTranscript(text); void handleTranscript(text); return; }

    // Wake word: ignore everything that is not meant for Nimah (nothing is stored or sent anywhere).
    const gate = gateWake({ text, enabled: s.wakeWord, activeUntil: activeUntilRef.current, now: Date.now() });
    if (gate.accept || gate.wakeOnly) Nimah.wakeScreen().catch(() => {});
    if (!gate.accept) {
      if (gate.wakeOnly) {
        activeUntilRef.current = extendWindow(Date.now());
        void say(t(s.locale, 'wakeAck')).then(() => setKick((k) => k + 1));
      } else { restStatus(); setKick((k) => k + 1); }
      return;
    }
    setTranscript(gate.text);

    if (s.voiceLock) {
      busyRef.current = true;
      updateStatus('processing');
      void (async () => {
        const ok = await voiceGate(extras.voiceScore);
        busyRef.current = false;
        if (!ok) { restStatus(); setKick((k) => k + 1); return; }
        await handleTranscript(gate.text);
      })();
      return;
    }
    void handleTranscript(gate.text);
  }, [handleTranscript, listen, say, settleChoice, restStatus, updateStatus, voiceGate]);

  const onSpeechError = useCallback((message: string, code?: number) => {
    if (askRef.current) { askRef.current(null); return; }
    if (choiceRef.current) { settleChoice(null); return; }
    if (code === ERROR_SPEECH_TIMEOUT) retriedLocaleRef.current = false;
    // Heard something but understood nothing: try the other language (Sinhala <-> English) once.
    if (shouldRetryOtherLocale({ code, auto: settingsRef.current.autoLanguage, alreadyRetried: retriedLocaleRef.current }) && !pausedRef.current) {
      retriedLocaleRef.current = true;
      void listen(otherLocale(listenLocaleRef.current));
      return;
    }
    const quiet = code === 6 || code === 7;
    if (code === 9) micBlockedRef.current = true;
    if (quiet) failRef.current = 0; else { failRef.current += 1; if (failRef.current > 2) setError(message); }
    restStatus();
    setKick((k) => k + 1);
  }, [restStatus, settleChoice, listen]);

  /** Incoming call: say who it is and let the user answer / reject by voice. */
  const onCall = useCallback(async (c: { state: string; number: string; name: string }) => {
    const s = settingsRef.current;
    if (c.state !== 'RINGING') { if (callPromptRef.current && choiceRef.current) settleChoice(null); return; }
    activeUntilRef.current = extendWindow(Date.now(), 40_000);   // "answer" needs no wake word while it rings
    if (!s.announceCalls || callPromptRef.current || busyRef.current || choiceRef.current || askRef.current) return;
    callPromptRef.current = true;
    busyRef.current = true;
    try {
      Nimah.stopSpeaking().catch(() => {});
      await Nimah.cancelListening().catch(() => {});
      const si = s.locale === 'si-LK';
      const picked = await askOptions(callAnnouncement(c.name, c.number, si),
        [{ label: si ? 'ගන්න' : 'Answer', value: 'answer' }, { label: si ? 'කපන්න' : 'Reject', value: 'reject' }],
        (spoken, o) => { const v = parseCallCommand(spoken); return v === 'answer' ? o[0] : v === 'reject' ? o[1] : null; });
      if (picked?.value === 'answer') await Nimah.answerCall().catch(() => false);
      else if (picked?.value === 'reject') await Nimah.endCall().catch(() => false);
    } finally {
      callPromptRef.current = false;
      busyRef.current = false;
      restStatus();
      setKick((k) => k + 1);
    }
  }, [askOptions, restStatus, settleChoice]);

  /** New message: read it, offer a voice reply, send it through the notification's own reply action. */
  const onMessage = useCallback(async (m: IncomingMessage) => {
    const s = settingsRef.current;
    if (!s.readMessages || busyRef.current || choiceRef.current || askRef.current || planRef.current || pausedRef.current) return;
    if (!dedupe.fresh(`${m.key}|${m.text}`, Date.now())) return;
    busyRef.current = true;
    try {
      const si = s.locale === 'si-LK';
      Nimah.stopSpeaking().catch(() => {});
      await Nimah.cancelListening().catch(() => {});
      for (let round = 0; round < 3; round += 1) {
        const picked = await askOptions(announceMessage(m, si),
          m.canReply ? [{ label: si ? 'Reply' : 'Reply', value: 'reply' }, { label: si ? 'ඉන්න' : 'Ignore', value: 'ignore' }, { label: si ? 'නැවත' : 'Repeat', value: 'repeat' }]
            : [{ label: 'OK', value: 'ignore' }],
          (spoken, o) => { const v = parseReplyDecision(spoken); return v ? o.find((x) => x.value === v) ?? null : null; });
        if (picked?.value === 'repeat') continue;
        if (picked?.value !== 'reply') break;
        const text = await ask(si ? 'මොකද්ද කියන්න ඕනේ?' : 'What should I say?');
        if (!text) break;
        const r = await review(m.sender, text);
        if (!r.send) { await say(si ? 'හරි, යැව්වේ නැහැ.' : 'Okay, nothing sent.'); break; }
        if (s.voiceLock) {
          voiceEnrolledRef.current = await Nimah.voiceIsEnrolled().catch(() => false);
          if (voiceEnrolledRef.current && (await deviceAuth(si ? 'පණිවිඩය යවන්න තහවුරු කරන්න' : 'Confirm to send the reply')) !== 'ok') { await say(t(s.locale, 'voiceDenied')); break; }
        }
        const ok = await Nimah.replyNotification(m.key, r.message).catch(() => false);
        await say(ok ? (si ? 'Reply එක යැව්වා.' : 'Reply sent.') : (si ? 'Reply කරන්න බැරි වුණා.' : "I couldn't send the reply."));
        break;
      }
    } finally {
      busyRef.current = false;
      restStatus();
      setKick((k) => k + 1);
    }
  }, [ask, askOptions, dedupe, deviceAuth, restStatus, review, say]);

  const latest = useRef({ onResult, onSpeechError, onCall, onMessage });
  latest.current = { onResult, onSpeechError, onCall, onMessage };

  useEffect(() => {
    const subs = [
      Nimah.on('NimahSpeechPartial', ({ text }) => setTranscript(text)),
      Nimah.on('NimahSpeechResult', (p) => latest.current.onResult(p.text, p)),
      Nimah.on('NimahCall', (c) => { void latest.current.onCall(c); }),
      Nimah.on('NimahMessage', (m) => { void latest.current.onMessage(m); }),
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
    activeUntilRef.current = extendWindow(Date.now());   // tapping the mic = talking to Nimah: no wake word needed
    const perms = await requestPermissions();
    if (!perms.mic) { setError(errorMessage(settingsRef.current.locale, 'NO_MIC_PERMISSION')); return; }
    await listen();
  }, [listen, restStatus, stopTask]);

  const newConversation = useCallback(() => {
    resetConversation();
    setMessages([]);
    lastReplyRef.current = '';
    setIntent(null);
    setTranscript('');
    setError('');
    followUps.current = 0;
  }, []);

  newChatRef.current = newConversation;

  useEffect(() => {
    if (settings.dailyBriefing) Nimah.scheduleDailyBriefing(8, 0).catch(() => {});
    else Nimah.cancelDailyBriefing().catch(() => {});
  }, [settings.dailyBriefing]);

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
    if (status !== 'idle' || busyRef.current || choiceRef.current || askRef.current || micBlockedRef.current || pausedRef.current || planRef.current) return undefined;
    const delay = Math.min(350 * 2 ** failRef.current, 8000);
    const id = setTimeout(async () => {
      if (statusRef.current !== 'idle' || busyRef.current || choiceRef.current || askRef.current || pausedRef.current || planRef.current) return;
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
        activeUntilRef.current = extendWindow(Date.now());   // the reply to the greeting needs no wake word
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

  const repeatLast = useCallback(() => {
    if (lastReplyRef.current) void say(lastReplyRef.current);
  }, [say]);

  /** Pauses / resumes the always-on microphone (voice-lock enrolment needs exclusive use of the mic). */
  const pauseMic = useCallback((paused: boolean) => {
    pausedRef.current = paused;
    if (paused) Nimah.cancelListening().then(restStatus).catch(() => {});
    else setKick((k) => k + 1);
  }, [restStatus]);

  const stopSpeaking = useCallback(async () => { await Nimah.stopSpeaking().catch(() => {}); restStatus(); }, [restStatus]);
  const stopListening = useCallback(async () => { await Nimah.cancelListening().catch(() => {}); restStatus(); }, [restStatus]);

  return {
    messages,
    repeatLast,
    speak: say,
    stopSpeaking,
    stopListening,
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
    pauseMic,
  };
}
