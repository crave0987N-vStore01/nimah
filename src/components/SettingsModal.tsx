import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Text } from './Txt';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { Nimah } from '../native/Nimah';
import { Palette } from '../theme';
import { Settings } from '../types';

interface Props {
  visible: boolean; settings: Settings; palette: Palette;
  onChange: (patch: Partial<Settings>) => void; onNewConversation: () => void; onClose: () => void;
}

function Segmented<T extends string | number>(
  { value, options, onChange, palette }:
  { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void; palette: Palette },
) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)}
            style={[styles.segItem, { borderColor: palette.border, backgroundColor: on ? '#C4141C' : palette.card }]}>
            <Text style={{ color: on ? '#fff' : palette.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsModal({ visible, settings: s, palette, onChange, onNewConversation, onClose }: Props) {
  const L = s.locale;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={styles.rowBlock}>
      <Text style={[styles.label, { color: palette.sub }]}>{label}</Text>
      {children}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider><SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>{t(L, 'settings')}</Text>
          <Pressable onPress={onClose}><Text style={{ color: palette.text }}>{t(L, 'close')}</Text></Pressable>
        </View>
        <ScrollView>
          <Row label={t(L, 'language')}>
            <Segmented palette={palette} value={s.locale} onChange={(v) => onChange({ locale: v })}
              options={[{ label: 'English', value: 'en-US' }, { label: 'සිංහල', value: 'si-LK' }]} />
          </Row>
          <Row label={t(L, 'countryCode')}>
            <TextInput value={s.countryCode} keyboardType="number-pad" maxLength={4}
              onChangeText={(v) => onChange({ countryCode: v.replace(/\D/g, '') })}
              style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card }]} />
          </Row>
          <Row label={t(L, 'speechRate')}>
            <Segmented palette={palette} value={s.speechRate} onChange={(v) => onChange({ speechRate: v })}
              options={[{ label: '0.8×', value: 0.8 }, { label: '1×', value: 1 }, { label: '1.25×', value: 1.25 }]} />
          </Row>
          <Row label={t(L, 'theme')}>
            <Segmented palette={palette} value={s.theme} onChange={(v) => onChange({ theme: v })}
              options={[{ label: t(L, 'system'), value: 'system' }, { label: t(L, 'dark'), value: 'dark' }, { label: t(L, 'light'), value: 'light' }]} />
          </Row>
          {([
            ['autoListen', 'autoListen'], ['askBack', 'askBack'], ['speakReplies', 'speakReplies'], ['fullControl', 'fullControl'], ['confirmRisky', 'confirmRisky'],
            ['autoSend', 'autoSend'], ['backgroundService', 'background'],
          ] as const).map(([field, label]) => (
            <View key={field} style={styles.switchRow}>
              <Text style={{ color: palette.text, fontSize: 16 }}>{t(L, label)}</Text>
              <Switch value={s[field]} onValueChange={(v) => onChange({ [field]: v })}
                trackColor={{ false: '#2A1B1C', true: '#8E0F15' }} thumbColor={s[field] ? '#E9DDD7' : '#8A7F7C'} />
            </View>
          ))}
          <Pressable onPress={() => { Nimah.openAccessibilitySettings().catch(() => {}); }} style={[styles.btn, { borderColor: palette.border }]}>
            <Text style={{ color: palette.text }}>{t(L, 'setupControl')}</Text>
          </Pressable>
          <Pressable onPress={() => { Nimah.openNotificationAccessSettings().catch(() => {}); }} style={[styles.btn, { borderColor: palette.border }]}>
            <Text style={{ color: palette.text }}>{t(L, 'setupNotif')}</Text>
          </Pressable>
          <Pressable onPress={() => { onNewConversation(); onClose(); }} style={[styles.btn, { borderColor: palette.border }]}>
            <Text style={{ color: palette.text }}>{t(L, 'newChat')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontFamily: 'serif', fontWeight: '600' },
  rowBlock: { marginBottom: 18 },
  label: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  seg: { flexDirection: 'row', gap: 8 },
  segItem: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 16, width: 100 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,92,124,0.25)' },
  btn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 12 },
});
