// App.tsx — Nimah main screen: voice only. Crimson + gold, red-moon scenery, particle sphere.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { Text } from './src/components/Txt';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ChoiceSheet from './src/components/ChoiceSheet';
import Footer from './src/components/Footer';
import { KeyIcon, SlidersIcon } from './src/components/Icons';
import KeyModal, { KEYS_STORAGE } from './src/components/KeyModal';
import Logo from './src/components/Logo';
import ParticleOrb from './src/components/ParticleOrb';
import Scenery from './src/components/Scenery';
import SettingsModal from './src/components/SettingsModal';
import { FadeInUp } from './src/components/Bits';
import { useAssistant } from './src/hooks/useAssistant';
import { useHistory } from './src/hooks/useHistory';
import { SettingsProvider, useSettings } from './src/hooks/useSettings';
import { t } from './src/i18n';
import { ensureAccessibility, Nimah } from './src/native/Nimah';
import { setRuntimeKeys } from './src/services/gemini';
import { glow, palettes, statusColor } from './src/theme';
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
  const palette = palettes.dark;
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [a11yOn, setA11yOn] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(KEYS_STORAGE).then((v) => { if (v) setRuntimeKeys(JSON.parse(v)); }).catch(() => {});
  }, []);

  useEffect(() => {
    const check = () => Nimah.isAutoSendEnabled().then(setA11yOn).catch(() => {});
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, []);

  if (!ready) return null;

  const onSettingsChange = (patch: Partial<Settings>) => {
    update(patch);
    if (patch.autoSend || patch.fullControl) ensureAccessibility(true).catch(() => {});
  };

  const L = settings.locale;
  const si = L === 'si-LK';
  const label = (a.agentRunning ? t(L, 'working')
    : a.status === 'listening' ? t(L, 'listening')
    : a.status === 'processing' ? t(L, 'processing')
    : a.status === 'speaking' ? t(L, 'speaking')
    : settings.autoListen ? (si ? 'කතා කරන්න' : 'Go ahead, I am listening') : (si ? 'නිහඬයි' : 'Listening is off'));
  const tone = a.agentRunning ? statusColor.processing : statusColor[a.status];
  const reply = a.intent?.spoken_reply && a.intent.spoken_reply !== '...' ? a.intent.spoken_reply : '';

  return (
    <View style={styles.screen}>
      <Scenery />
      <View style={styles.shade} pointerEvents="none" />
      <View style={styles.shadeTop} pointerEvents="none" />
      <View style={styles.shadeBottom} pointerEvents="none" />
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />

        <FadeInUp style={styles.header}>
          <View style={styles.brand}>
            <Logo />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.name}>Nimah</Text>
              <Text style={styles.tag}>VOICE ASSISTANCE</Text>
            </View>
          </View>
          <View style={styles.tools}>
            <Pressable onPress={() => setShowKey(true)} style={styles.tool} hitSlop={6} accessibilityRole="button" accessibilityLabel="API key">
              <KeyIcon color="#E9DDD7" size={20} />
            </Pressable>
            <Pressable onPress={() => setShowSettings(true)} style={styles.tool} hitSlop={6} accessibilityRole="button" accessibilityLabel={t(L, 'settings')}>
              <SlidersIcon color="#E9DDD7" size={20} />
            </Pressable>
          </View>
        </FadeInUp>

        {!a11yOn && settings.fullControl && (
          <Pressable onPress={() => ensureAccessibility(true).then((r) => r === 'auto' && setA11yOn(true)).catch(() => {})} style={styles.notice}>
            <View style={styles.noticeDot} />
            <Text style={styles.noticeTx}>
              {t(L, 'a11yHint')}
            </Text>
          </Pressable>
        )}

        <View style={styles.stage}>
          <View style={styles.orbBox}>
            <View style={[styles.ring, { width: 296, height: 296, borderRadius: 148, borderColor: 'rgba(233,221,215,0.16)' }]} pointerEvents="none" />
            <View style={[styles.ring, { width: 336, height: 336, borderRadius: 168, borderColor: 'rgba(255,42,42,0.10)' }]} pointerEvents="none" />
            <ParticleOrb status={a.status} level={a.level} />
          </View>

          <FadeInUp trigger={label} style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: tone }]} />
            <Text style={styles.statusTx}>{label}</Text>
          </FadeInUp>

          <ScrollView style={styles.talk} contentContainerStyle={styles.talkIn} showsVerticalScrollIndicator={false}>
            {!!a.progress && <Text style={styles.progress}>{a.progress}</Text>}
            {!!a.transcript && <Text style={styles.you}>{a.transcript}</Text>}
            {!!reply && <FadeInUp trigger={reply}><Text style={styles.reply}>{reply}</Text></FadeInUp>}
            {!!a.error && <Text style={styles.err}>{a.error}</Text>}
          </ScrollView>

          {a.choice && <FadeInUp trigger={a.choice.prompt} style={{ alignSelf: 'stretch' }}><ChoiceSheet request={a.choice} palette={palette} locale={L} onPick={a.settleChoice} /></FadeInUp>}

          {a.agentRunning && (
            <Pressable onPress={a.stopTask} style={styles.stop} accessibilityRole="button" accessibilityLabel={t(L, 'stopTask')}>
              <Text style={styles.stopTx}>{t(L, 'stopTask')}</Text>
            </Pressable>
          )}
        </View>

        <Footer color="#B9A9A5" />
      </SafeAreaView>

      <SettingsModal visible={showSettings} settings={settings} palette={palette}
        onChange={onSettingsChange} onNewConversation={a.newConversation} onClose={() => setShowSettings(false)} />
      <KeyModal visible={showKey} palette={palette} locale={L} onClose={() => setShowKey(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,0,4,0.56)' },
  shadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 150, backgroundColor: 'rgba(8,0,3,0.45)' },
  shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220, backgroundColor: 'rgba(8,0,3,0.50)' },
  root: { flex: 1, paddingHorizontal: 22, paddingTop: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#F3EAE6', fontSize: 24, fontFamily: 'serif', fontWeight: '700', letterSpacing: 3 },
  tag: { color: '#FF2A2A', fontSize: 10.5, letterSpacing: 3.2, marginTop: 1, fontWeight: '600' },
  tools: { flexDirection: 'row' },
  tool: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,221,215,0.55)', marginLeft: 10, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingVertical: 8, paddingHorizontal: 12, borderLeftWidth: 2, borderLeftColor: glow.gold, backgroundColor: 'rgba(0,0,0,0.28)' },
  noticeDot: { width: 0, height: 0 },
  noticeTx: { color: '#E9DDD7', fontSize: 12.5, flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbBox: { alignItems: 'center', justifyContent: 'center', width: 340, height: 340 },
  ring: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 10 },
  statusTx: { color: '#F3EAE6', fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase', opacity: 0.92 },
  talk: { maxHeight: 150, alignSelf: 'stretch', marginTop: 16 },
  talkIn: { alignItems: 'center', paddingHorizontal: 10 },
  progress: { color: 'rgba(233,221,215,0.8)', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  you: { color: glow.gold, fontSize: 14, textAlign: 'center', letterSpacing: 0.2, marginBottom: 8 },
  reply: { color: '#F3EAE6', fontSize: 18, lineHeight: 26, fontFamily: 'serif', textAlign: 'center' },
  err: { color: '#FF8A80', fontSize: 13, textAlign: 'center', marginTop: 8 },
  stop: { marginTop: 14, borderWidth: 1, borderColor: glow.rose, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 34 },
  stopTx: { color: '#F3EAE6', fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase' },
});
