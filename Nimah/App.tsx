// App.tsx — Nimah main screen.
import React, { useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ChoiceSheet from './src/components/ChoiceSheet';
import HistoryModal from './src/components/HistoryModal';
import SettingsModal from './src/components/SettingsModal';
import { Dots, FadeInUp, RotatingHint } from './src/components/Bits';
import Footer from './src/components/Footer';
import Logo from './src/components/Logo';
import Orb from './src/components/Orb';
import Scenery from './src/components/Scenery';
import Waveform from './src/components/Waveform';
import { useAssistant } from './src/hooks/useAssistant';
import { useHistory } from './src/hooks/useHistory';
import { SettingsProvider, useSettings } from './src/hooks/useSettings';
import { t } from './src/i18n';
import { Nimah } from './src/native/Nimah';
import { Settings } from './src/types';
import { accent, statusColor, useTheme } from './src/theme';

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
  // The red-moon wallpaper is dark, so the main screen always uses the dark palette.
  const { palette } = useTheme('dark');
  const isDark = true;
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  if (!ready) return null; // wait for persisted settings

  // Turning on Auto-send: if the accessibility service is off, jump to Android's settings to enable "Nimah".
  const onSettingsChange = (patch: Partial<Settings>) => {
    update(patch);
    if (patch.autoSend || patch.fullControl) {
      Nimah.isAutoSendEnabled()
        .then((on) => { if (!on) Nimah.openAccessibilitySettings(); })
        .catch(() => {});
    }
  };

  const L = settings.locale;
  const labels = {
    idle: t(L, 'tapToSpeak'), listening: t(L, 'listening'),
    processing: t(L, 'processing'), speaking: t(L, 'speaking'),
  };
  const examples = L === 'si-LK'
    ? ['“Wi-Fi off කරන්න”', '“අසංක ට WhatsApp එකක් යවන්න”', '“උදේ 6 ට alarm එකක් දාන්න”', '“මගේ notifications කියවන්න”', '“YouTube එකේ lofi play කරන්න”']
    : ['“Turn off Wi-Fi”', '“Send WhatsApp to Asanka: come tomorrow”', '“Set an alarm for 6 am”', '“Read my notifications”', '“Play lofi on YouTube”'];
  const statusText = a.agentRunning ? t(L, 'working') : labels[a.status];
  const sc = statusColor[a.status];

  return (
    <View style={styles.screen}>
    <Scenery />
    <View style={styles.shade} pointerEvents="none" />
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <FadeInUp style={styles.header}>
        <View style={styles.brand}>
          <Logo />
          <View>
            <Text style={[styles.title, { color: palette.text }]}>Nimah</Text>
            <Text style={[styles.tag, { color: accent.pink }]}>{L === 'si-LK' ? 'ඔබේ හඬ ෆෝන් සහායක' : 'Your voice, your phone'}</Text>
          </View>
        </View>
        <View style={styles.pills}>
          <Pressable onPress={() => setShowHistory(true)} style={[styles.pill, { backgroundColor: palette.glass, borderColor: palette.border }]}>
            <Text style={{ color: palette.text, fontSize: 13 }}>🕘 {t(L, 'history')}</Text>
          </Pressable>
          <Pressable onPress={() => setShowSettings(true)} style={[styles.pill, { backgroundColor: palette.glass, borderColor: palette.border }]}>
            <Text style={{ color: palette.text, fontSize: 13 }}>⚙️ {t(L, 'settings')}</Text>
          </Pressable>
        </View>
      </FadeInUp>

      <View style={styles.hintBox}><RotatingHint items={examples} color={palette.sub} /></View>

      <View style={styles.center}>
        <Orb status={a.status} level={a.level} onPress={a.onMicPress} label={statusText} />
        <View style={styles.waveBox}>
          <Waveform level={a.level} active={a.status === 'listening'} color={sc} />
        </View>
        <FadeInUp trigger={statusText} style={styles.statusBox}>
          <Text style={[styles.status, { color: palette.text }]}>{statusText}</Text>
        </FadeInUp>
        {(a.status === 'processing' || a.agentRunning) && !a.progress && <Dots color={sc} />}
        {!!a.progress && (
          <FadeInUp trigger={a.progress}>
            <Text style={[styles.progress, { color: palette.sub }]} numberOfLines={3}>{a.progress}</Text>
          </FadeInUp>
        )}
        {a.agentRunning && (
          <FadeInUp>
            <Pressable onPress={a.stopTask} style={[styles.stop, { backgroundColor: palette.err }]}
              accessibilityRole="button" accessibilityLabel={t(L, 'stopTask')}>
              <Text style={styles.stopText}>■ {t(L, 'stopTask')}</Text>
            </Pressable>
          </FadeInUp>
        )}
      </View>

      {a.choice && <FadeInUp trigger={a.choice.prompt}><ChoiceSheet request={a.choice} palette={palette} locale={L} onPick={a.settleChoice} /></FadeInUp>}

      {(!!a.transcript || !!a.intent || !!a.error) && (
        <ScrollView style={styles.chat} showsVerticalScrollIndicator={false}>
          {!!a.transcript && (
            <FadeInUp trigger={a.transcript} style={styles.rowRight}>
              <View style={[styles.bubble, styles.me, { backgroundColor: '#E11D48' }]}>
                <Text style={styles.meText}>{a.transcript}</Text>
              </View>
            </FadeInUp>
          )}
          {!!a.intent && (
            <FadeInUp trigger={a.intent.spoken_reply + a.intent.action} style={styles.rowLeft}>
              <View style={[styles.bubble, { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 }]}>
                <View style={[styles.chip, { backgroundColor: palette.glass, borderColor: accent.pink }]}>
                  <Text style={{ color: accent.pink, fontSize: 11, fontWeight: '700' }}>{a.intent.action.replace('_', ' ').toUpperCase()}</Text>
                </View>
                {!!a.intent.spoken_reply && <Text style={{ color: palette.text, fontSize: 15, marginTop: 6 }}>{a.intent.spoken_reply}</Text>}
              </View>
            </FadeInUp>
          )}
          {!!a.error && <FadeInUp trigger={a.error}><Text style={{ color: palette.err, marginTop: 8, textAlign: 'center' }}>{a.error}</Text></FadeInUp>}
        </ScrollView>
      )}

      <Text style={[styles.stopHint, { color: palette.sub }]}>{t(L, 'stopHint')}</Text>
      <Footer color={palette.sub} />

      <SettingsModal visible={showSettings} settings={settings} palette={palette}
        onChange={onSettingsChange} onNewConversation={a.newConversation} onClose={() => setShowSettings(false)} />
      <HistoryModal visible={showHistory} items={history.items} palette={palette} locale={L}
        onClear={history.clear} onClose={() => setShowHistory(false)} />
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  shade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.34)' },
  root: { flex: 1, paddingHorizontal: 18, paddingTop: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  tag: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  hintBox: { marginTop: 14, minHeight: 24, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  waveBox: { height: 56, marginTop: -26 },
  statusBox: { marginTop: 4 },
  status: { fontSize: 20, fontWeight: '700' },
  progress: { fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 4 },
  stop: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 26, marginTop: 10, elevation: 6 },
  stopText: { color: '#0B0F1A', fontSize: 16, fontWeight: '800' },
  chat: { maxHeight: 200, marginBottom: 6 },
  rowRight: { alignItems: 'flex-end', marginBottom: 8 },
  rowLeft: { alignItems: 'flex-start', marginBottom: 8 },
  bubble: { maxWidth: '86%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  me: { borderBottomRightRadius: 4 },
  meText: { color: '#fff', fontSize: 15 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  stopHint: { textAlign: 'center', fontSize: 10.5, opacity: 0.8 },
});
