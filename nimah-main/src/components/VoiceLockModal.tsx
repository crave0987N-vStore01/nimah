import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { Nimah, requestPermissions } from '../native/Nimah';
import { decideVoice, ENROLL_PHRASES, ENROLL_SAMPLES, ENROLL_SECONDS, thresholdFor } from '../services/voicelock';
import { Palette } from '../theme';
import { Locale } from '../types';
import { Text } from './Txt';

interface Props {
  visible: boolean; palette: Palette; locale: Locale;
  sensitivity: number; onSensitivity: (v: number) => void;
  /** Pauses the always-on recogniser: enrolment needs exclusive use of the microphone. */
  pauseMic: (paused: boolean) => void;
  onClose: () => void;
}

const MIN_FRAMES_PER_SAMPLE = 40;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function VoiceLockModal({ visible, palette, locale: L, sensitivity, onSensitivity, pauseMic, onClose }: Props) {
  const si = L === 'si-LK';
  const phrases = si ? ENROLL_PHRASES.si : ENROLL_PHRASES.en;
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [msg, setMsg] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(() => Nimah.voiceIsEnrolled().then(setEnrolled).catch(() => setEnrolled(false)), []);

  useEffect(() => {
    alive.current = visible;
    if (visible) { pauseMic(true); refresh(); setMsg(''); setScore(null); setPhrase(''); }
    else pauseMic(false);
    return () => { alive.current = false; };
  }, [visible, pauseMic, refresh]);

  const enroll = async () => {
    if (!(await requestPermissions()).mic) { setMsg(t(L, 'errMicPerm')); return; }
    setBusy(true); setMsg(''); setScore(null);
    try {
      await Nimah.voiceEnrollReset();
      for (let i = 0; i < ENROLL_SAMPLES && alive.current; i++) {
        setPhrase(`${i + 1}/${ENROLL_SAMPLES}  ${phrases[i % phrases.length]}`);
        await sleep(700);
        const r = await Nimah.voiceEnrollSample(ENROLL_SECONDS);
        if (r.voicedFrames < MIN_FRAMES_PER_SAMPLE) { setMsg(t(L, 'voiceTooQuiet')); i -= 1; await sleep(900); setMsg(''); }
      }
      const ok = await Nimah.voiceEnrollFinish();
      setMsg(t(L, ok ? 'voiceDone' : 'voiceNeedMore'));
    } catch (e: any) { setMsg(String(e?.message ?? e)); }
    setPhrase(''); setBusy(false); refresh();
  };

  const test = async () => {
    if (!(await requestPermissions()).mic) { setMsg(t(L, 'errMicPerm')); return; }
    setBusy(true); setMsg(''); setScore(null);
    try {
      setPhrase(phrases[0]);
      await sleep(500);
      const r = await Nimah.voiceTest(3);
      setScore(r.score);
      const d = decideVoice(r.score, sensitivity, true);
      setMsg(d === 'unavailable' ? t(L, 'voiceNoAudio') : d === 'match' ? '✔' : '✘');
    } catch (e: any) { setMsg(String(e?.message ?? e)); }
    setPhrase(''); setBusy(false);
  };

  const remove = async () => { await Nimah.voiceDelete().catch(() => {}); setScore(null); setMsg(''); refresh(); };

  const btn = (label: string, onPress: () => void, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled || busy} style={[styles.btn, { borderColor: palette.border, opacity: disabled || busy ? 0.5 : 1 }]}>
      <Text style={{ color: palette.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider><SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>{t(L, 'voiceEnrollTitle')}</Text>
          <Pressable onPress={onClose} disabled={busy}><Text style={{ color: palette.text }}>{t(L, 'close')}</Text></Pressable>
        </View>
        <ScrollView>
          <Text style={{ color: '#FFB4A8', marginBottom: 14, lineHeight: 20 }}>{t(L, 'voiceLockHonest')}</Text>
          <Text style={{ color: palette.sub, marginBottom: 10 }}>{enrolled ? t(L, 'voiceEnrolled') : t(L, 'voiceNotEnrolled')}</Text>

          <Text style={[styles.label, { color: palette.sub }]}>{t(L, 'voiceSensitivity')}</Text>
          <View style={styles.seg}>
            {[1, 2, 3, 4, 5].map((v) => (
              <Pressable key={v} onPress={() => onSensitivity(v)}
                style={[styles.segItem, { borderColor: palette.border, backgroundColor: v === sensitivity ? '#C4141C' : palette.card }]}>
                <Text style={{ color: v === sensitivity ? '#fff' : palette.text }}>{v}</Text>
              </Pressable>
            ))}
          </View>

          {phrase ? (
            <View style={[styles.say, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <Text style={{ color: palette.sub, marginBottom: 6 }}>{t(L, 'voiceSay')}</Text>
              <Text style={{ color: palette.text, fontSize: 18, lineHeight: 26 }}>{phrase}</Text>
              <ActivityIndicator style={{ marginTop: 10 }} color="#C4141C" />
            </View>
          ) : null}
          {msg ? <Text style={{ color: palette.text, marginTop: 12, fontSize: 16 }}>{msg}</Text> : null}
          {score !== null ? (
            <Text style={{ color: palette.sub, marginTop: 6 }}>
              {t(L, 'voiceScore')}: {score < 0 ? '—' : score.toFixed(2)}  (≥ {thresholdFor(sensitivity).toFixed(2)})
            </Text>
          ) : null}

          {btn(t(L, 'voiceStart'), enroll)}
          {btn(t(L, 'voiceTestBtn'), test, !enrolled)}
          {btn(t(L, 'voiceDelete'), remove, !enrolled)}
          {si ? null : <Text style={{ color: palette.sub, marginTop: 18, fontSize: 12 }}>Audio is processed in memory on this phone only; nothing is uploaded or saved as a recording.</Text>}
          {si ? <Text style={{ color: palette.sub, marginTop: 18, fontSize: 12 }}>හඬ සකසන්නේ මේ ෆෝන් එකේ මතකයේ පමණයි; කිසිවක් upload කරන්නේ හෝ පටිගත කර සුරකින්නේ නැහැ.</Text> : null}
        </ScrollView>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontFamily: 'serif', fontWeight: '600' },
  label: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  segItem: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  say: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 8 },
  btn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 12 },
});
