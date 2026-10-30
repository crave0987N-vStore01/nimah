// App.tsx — Nimah main screen: voice + chat dashboard (light / dark / system theme).
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Text } from './src/components/Txt';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ChatPanel from './src/components/ChatPanel';
import ChoiceSheet from './src/components/ChoiceSheet';
import FeaturesModal from './src/components/FeaturesModal';
import HistoryModal from './src/components/HistoryModal';
import InputBar from './src/components/InputBar';
import { KeyIcon, SlidersIcon } from './src/components/Icons';
import KeyModal from './src/components/KeyModal';
import Logo from './src/components/Logo';
import NotesModal from './src/components/NotesModal';
import ParticleOrb from './src/components/ParticleOrb';
import QuickActions, { Quick } from './src/components/QuickActions';
import Scenery from './src/components/Scenery';
import SettingsModal from './src/components/SettingsModal';
import VoiceLockModal from './src/components/VoiceLockModal';
import { useAssistant } from './src/hooks/useAssistant';
import { useHistory } from './src/hooks/useHistory';
import { useOnline } from './src/hooks/useOnline';
import { SettingsProvider, useSettings } from './src/hooks/useSettings';
import { t } from './src/i18n';
import { ensureAccessibility, Nimah } from './src/native/Nimah';
import { hasApiKey, setRuntimeKeys } from './src/services/gemini';
import { loadApiKeys } from './src/services/keystore';
import { statusColor, useTheme } from './src/theme';
import { Settings } from './src/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Main />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const { settings, update, ready } = useSettings();
  const history = useHistory();
  const a = useAssistant(settings, history.add);
  const online = useOnline();
  const { palette, isDark } = useTheme(settings.theme);
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [showVoiceLock, setShowVoiceLock] = useState(false);
  const [a11yOn, setA11yOn] = useState(true);
  const [keyOk, setKeyOk] = useState(hasApiKey());
  const [prefill, setPrefill] = useState({ text: '', n: 0 });

  useEffect(() => {
    const sub = Nimah.on('NimahServiceStopped', () => { update({ backgroundService: false, autoListen: false }); a.stopTask(); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadApiKeys().then((k) => { if (k.length) setRuntimeKeys(k); setKeyOk(hasApiKey()); }).catch(() => {});
  }, []);

  useEffect(() => {
    const check = () => Nimah.isAutoSendEnabled().then(setA11yOn).catch(() => {});
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, []);

  const onQuick = useCallback((q: Quick) => {
    if (q.send) a.sendText(q.text); else setPrefill((p) => ({ text: q.text, n: p.n + 1 }));
  }, [a]);

  if (!ready) return null;

  const onSettingsChange = (patch: Partial<Settings>) => {
    update(patch);
    if (patch.autoSend || patch.fullControl) ensureAccessibility(true).catch(() => {});
  };

  const L = settings.locale;
  const si = L === 'si-LK';
  const busy = a.status === 'processing' || a.agentRunning;
  const label = (a.agentRunning ? t(L, 'working')
    : a.status === 'listening' ? t(L, 'listening')
    : a.status === 'processing' ? t(L, 'processing')
    : a.status === 'speaking' ? t(L, 'speaking')
    : a.error ? (si ? 'දෝෂයක්' : 'Error')
    : settings.autoListen ? (si ? 'කතා කරන්න' : 'Ready — listening is on') : (si ? 'නිහඬයි' : 'Idle — tap the mic'));
  const tone = a.error ? '#FF8A80' : a.agentRunning ? statusColor.processing : statusColor[a.status];
  const tools: [string, () => void][] = [
    ['Notes', () => setShowNotes(true)], [si ? 'හැකියාවන්' : 'Features', () => setShowFeatures(true)], [si ? 'ඉතිහාසය' : 'History', () => setShowHistory(true)],
  ];

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      {isDark && <Scenery />}
      {isDark && <View style={styles.shade} pointerEvents="none" />}
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'}/>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <Logo />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.name, { color: palette.text }]}>Nimah</Text>
                <View style={styles.pillRow}>
                  <View style={[styles.dotSm, { backgroundColor: online ? '#3DDC84' : '#FF8A80' }]} />
                  <Text style={{ color: palette.sub, fontSize: 11 }}>
                    {online ? (keyOk ? (si ? 'AI සම්බන්ධයි' : 'AI connected') : (si ? 'API key නැහැ' : 'No API key')) : (si ? 'Offline — local commands පමණයි' : 'Offline — local commands only')}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.tools}>
              <Pressable onPress={() => setShowKey(true)} style={[styles.tool, { borderColor: palette.border }]} accessibilityRole="button" accessibilityLabel="API key">
                <KeyIcon color={palette.text} size={20} />
              </Pressable>
              <Pressable onPress={() => setShowSettings(true)} style={[styles.tool, { borderColor: palette.border }]} accessibilityRole="button" accessibilityLabel={t(L, 'settings')}>
                <SlidersIcon color={palette.text} size={20} />
              </Pressable>
            </View>
          </View>

          <View style={styles.toolRow}>
            {tools.map(([name, fn]) => (
              <Pressable key={name} onPress={fn} accessibilityRole="button" style={[styles.toolBtn, { borderColor: palette.border, backgroundColor: palette.card }]}>
                <Text style={{ color: palette.text, fontSize: 14 }}>{name}</Text>
              </Pressable>
            ))}
          </View>

          {!keyOk && online && (
            <Pressable onPress={() => setShowKey(true)} style={[styles.notice, { borderLeftColor: '#FF5A1F', backgroundColor: palette.glass }]}>
              <Text style={{ color: palette.text, fontSize: 13 }}>{si ? 'AI පිළිතුරු සඳහා Gemini API key එකක් ඕනේ. මෙතැන ඔබන්න. (Offline commands key නැතුව වැඩ කරනවා.)' : 'AI answers need a Gemini API key. Tap here to add it. (Offline commands work without one.)'}</Text>
            </Pressable>
          )}
          {!a11yOn && settings.fullControl && (
            <Pressable onPress={() => ensureAccessibility(true).then((r) => r === 'auto' && setA11yOn(true)).catch(() => {})} style={[styles.notice, { borderLeftColor: '#E9DDD7', backgroundColor: palette.glass }]}>
              <Text style={{ color: palette.text, fontSize: 13 }}>{t(L, 'a11yHint')}</Text>
            </Pressable>
          )}

          <View style={styles.voiceCard}>
            <View style={styles.orbWrap}>
              <View style={{ transform: [{ scale: 0.5 }] }}><ParticleOrb status={a.status} level={a.level} /></View>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: tone }]} />
              <Text style={styles.statusTx} accessibilityLiveRegion="polite">{label}</Text>
            </View>
            {a.status === 'listening' && !!a.transcript && <Text style={styles.live} numberOfLines={2}>{a.transcript}</Text>}
            {!!a.progress && <Text style={styles.live} numberOfLines={2}>{a.progress}</Text>}
            <View style={styles.ctrl}>
              {a.status === 'listening' && <Pressable onPress={a.stopListening} style={styles.ctrlBtn} accessibilityRole="button"><Text style={styles.ctrlTx}>{si ? 'සවන් දීම නවත්වන්න' : 'Stop listening'}</Text></Pressable>}
              {a.status === 'speaking' && <Pressable onPress={a.stopSpeaking} style={styles.ctrlBtn} accessibilityRole="button"><Text style={styles.ctrlTx}>{si ? 'කතාව නවත්වන්න' : 'Stop speaking'}</Text></Pressable>}
              {a.agentRunning && <Pressable onPress={a.stopTask} style={styles.ctrlBtn} accessibilityRole="button"><Text style={styles.ctrlTx}>{t(L, 'stopTask')}</Text></Pressable>}
              {a.status === 'idle' && !a.agentRunning && <Pressable onPress={a.repeatLast} style={styles.ctrlBtn} accessibilityRole="button"><Text style={styles.ctrlTx}>{si ? 'නැවත කියන්න' : 'Repeat last'}</Text></Pressable>}
            </View>
          </View>

          {!!a.error && (
            <View style={[styles.notice, { borderLeftColor: '#FF8A80', backgroundColor: palette.glass }]}>
              <Text style={{ color: palette.err, fontSize: 13 }}>{a.error}</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <ChatPanel messages={a.messages} palette={palette} locale={L} onRepeat={(m) => { void a.speak(m); }} />
          </View>

          {a.choice && <ChoiceSheet request={a.choice} palette={palette} locale={L} onPick={a.settleChoice} />}

          <QuickActions palette={palette} locale={L} onPick={onQuick} />
          <InputBar palette={palette} locale={L} status={a.status} busy={busy} prefill={prefill} onSend={a.sendText} onMic={a.onMicPress} />
        </KeyboardAvoidingView>
      </SafeAreaView>

      <SettingsModal visible={showSettings} settings={settings} palette={palette}
        onChange={onSettingsChange} onNewConversation={a.newConversation} onClose={() => setShowSettings(false)}
        onOpenVoiceLock={() => setShowVoiceLock(true)} />
      <VoiceLockModal visible={showVoiceLock} palette={palette} locale={L} sensitivity={settings.voiceSensitivity} pauseMic={a.pauseMic}
        onSensitivity={(v) => update({ voiceSensitivity: v })} onClose={() => setShowVoiceLock(false)} />
      <KeyModal visible={showKey} palette={palette} locale={L} onClose={() => { setShowKey(false); setKeyOk(hasApiKey()); }} />
      <HistoryModal visible={showHistory} items={history.items} palette={palette} locale={L} onClear={history.clear} onClose={() => setShowHistory(false)} />
      <NotesModal visible={showNotes} palette={palette} locale={L} onClose={() => setShowNotes(false)} />
      <FeaturesModal visible={showFeatures} palette={palette} locale={L} online={online} a11yOn={a11yOn} hasKey={keyOk}
        onTry={(ex) => setPrefill((p) => ({ text: ex, n: p.n + 1 }))} onClose={() => setShowFeatures(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,0,4,0.72)' },
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  name: { fontSize: 22, fontFamily: 'serif', fontWeight: '700', letterSpacing: 2 },
  pillRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dotSm: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  tools: { flexDirection: 'row' },
  tool: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, marginLeft: 8, alignItems: 'center', justifyContent: 'center' },
  toolRow: { flexDirection: 'row', marginTop: 10 },
  toolBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, justifyContent: 'center', marginRight: 8 },
  notice: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderLeftWidth: 3, borderRadius: 6 },
  voiceCard: { marginTop: 10, borderRadius: 24, backgroundColor: '#0A0508', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, overflow: 'hidden' },
  orbWrap: { width: 190, height: 170, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusTx: { color: '#F3EAE6', fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase' },
  live: { color: '#E9DDD7', fontSize: 14, textAlign: 'center', marginTop: 6 },
  ctrl: { flexDirection: 'row', marginVertical: 8, minHeight: 44 },
  ctrlBtn: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, borderWidth: 1, borderColor: '#FF2A2A', justifyContent: 'center', marginHorizontal: 4 },
  ctrlTx: { color: '#F3EAE6', fontSize: 14 },
});
