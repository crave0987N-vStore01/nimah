import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Txt';
import { saveApiKeys } from '../services/keystore';
import { setRuntimeKeys } from '../services/gemini';
import { glow, Palette } from '../theme';
import { Locale } from '../types';

/** Paste one or more Gemini API keys (one per line). Used first; stored encrypted on this phone only. */
export default function KeyModal({ visible, palette, locale, onClose }: { visible: boolean; palette: Palette; locale: Locale; onClose: () => void }) {
  const si = locale === 'si-LK';
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const keys = text.split(/[\s,]+/).filter(Boolean);
    setRuntimeKeys(keys);
    await saveApiKeys(keys).catch(() => {});
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.text }]}>Gemini API key</Text>
          <Text style={{ color: palette.sub, fontSize: 12, marginBottom: 10 }}>
            {si ? 'Key එකක් (හෝ කිහිපයක්, එක පේළියකට එකක්) paste කරන්න. quota ඉවර වුණාම ඊළඟ එකට මාරු වෙනවා.'
                : 'Paste one key (or several, one per line). When one runs out of quota Nimah switches to the next.'}
          </Text>
          <TextInput value={text} onChangeText={setText} multiline autoCapitalize="none" autoCorrect={false}
            placeholder="AIza..." placeholderTextColor="#555"
            style={[styles.input, { color: palette.text, borderColor: palette.border, fontFamily: 'Rajdhani-Medium' }]} />
          <View style={styles.row}>
            <Pressable onPress={onClose} style={[styles.btn, { borderColor: palette.border }]}><Text style={{ color: palette.text }}>{si ? 'වසන්න' : 'Close'}</Text></Pressable>
            <Pressable onPress={save} style={[styles.btn, { backgroundColor: glow.rose, borderColor: glow.rose }]}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{saved ? 'OK' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 90, textAlignVertical: 'top', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  btn: { borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 20 },
});
