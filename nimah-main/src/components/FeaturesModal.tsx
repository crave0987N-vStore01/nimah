import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Txt';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import pkg from '../../package.json';
import { CAPABILITIES, countByKind, Group } from '../capabilities';
import { loadVoices } from '../services/speech';
import { Palette } from '../theme';
import { Locale } from '../types';

const KIND: Record<string, string> = { local: 'offline', device: 'device', ai: 'AI · online' };

interface Props { visible: boolean; palette: Palette; locale: Locale; online: boolean; a11yOn: boolean; hasKey: boolean; onTry: (example: string) => void; onClose: () => void }

/** Supported features (generated from the real registry) + diagnostics. */
export default function FeaturesModal({ visible, palette, locale, online, a11yOn, hasKey, onTry, onClose }: Props) {
  const si = locale === 'si-LK';
  const [voices, setVoices] = useState(0);
  useEffect(() => { if (visible) loadVoices(true).then((v) => setVoices(v.length)).catch(() => {}); }, [visible]);
  const k = countByKind();
  const groups = Array.from(new Set(CAPABILITIES.map((c) => c.group))) as Group[];
  const diag: [string, string][] = [
    ['Version', `${pkg.version} (Android ${Platform.Version})`],
    ['Network', online ? 'online' : 'offline'],
    ['Gemini key', hasKey ? 'configured' : 'missing — tap the key icon'],
    ['Accessibility service', a11yOn ? 'on' : 'off'],
    ['Installed TTS voices', String(voices)],
  ];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider><SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>{si ? 'හැකියාවන්' : 'Features'} ({CAPABILITIES.length})</Text>
          <Pressable onPress={onClose} style={styles.close}><Text style={{ color: palette.text }}>{si ? 'වසන්න' : 'Close'}</Text></Pressable>
        </View>
        <ScrollView>
          <Text style={{ color: palette.sub, marginBottom: 10 }}>
            {`${k.local} offline · ${k.device} need Android permissions/device · ${k.ai} need internet + Gemini key. Tap one to try its example.`}
          </Text>
          <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Text style={{ color: palette.text, fontWeight: '700', marginBottom: 6 }}>Diagnostics</Text>
            {diag.map(([a, b]) => <Text key={a} style={{ color: palette.sub }}>{a}: <Text style={{ color: palette.text }}>{b}</Text></Text>)}
          </View>
          {groups.map((g) => (
            <View key={g} style={{ marginTop: 14 }}>
              <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>{g}</Text>
              {CAPABILITIES.filter((c) => c.group === g).map((c) => (
                <Pressable key={c.id} onPress={() => { onTry(c.example); onClose(); }} style={[styles.item, { borderColor: palette.border }]}>
                  <Text style={{ color: palette.text, fontSize: 15 }}>{c.name}</Text>
                  <Text style={{ color: palette.sub, fontSize: 12 }}>{KIND[c.kind]}{c.perm ? ` · needs ${c.perm}` : ''} · “{c.example}”</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  close: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, minHeight: 48, justifyContent: 'center' },
});
