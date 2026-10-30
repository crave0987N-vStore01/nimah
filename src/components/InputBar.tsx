import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Txt';
import { Palette } from '../theme';
import { Locale, Status } from '../types';

interface Props {
  palette: Palette; locale: Locale; status: Status; busy: boolean;
  prefill: { text: string; n: number };
  onSend: (text: string) => void; onMic: () => void;
}

export default function InputBar({ palette, locale, status, busy, prefill, onSend, onMic }: Props) {
  const si = locale === 'si-LK';
  const [text, setText] = useState('');
  useEffect(() => { if (prefill.n) setText(prefill.text); }, [prefill]);
  const submit = () => { const v = text.trim(); if (!v || busy) return; setText(''); onSend(v); };
  const listening = status === 'listening';
  return (
    <View style={styles.row}>
      <TextInput
        value={text} onChangeText={setText} onSubmitEditing={submit} returnKeyType="send" blurOnSubmit={false}
        placeholder={si ? 'පණිවිඩයක් type කරන්න…' : 'Type a message…'} placeholderTextColor={palette.sub}
        accessibilityLabel={si ? 'පණිවිඩය' : 'Message'}
        style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
      />
      {text.trim().length > 0 ? (
        <Pressable onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: busy ? palette.border : '#C4141C' }]} accessibilityRole="button" accessibilityLabel={si ? 'යවන්න' : 'Send'}>
          <Text style={styles.btnTx}>{si ? 'යවන්න' : 'Send'}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onMic} style={[styles.btn, { backgroundColor: listening ? '#FF2A2A' : '#C4141C' }]} accessibilityRole="button"
          accessibilityLabel={listening ? (si ? 'සවන් දීම නවත්වන්න' : 'Stop listening') : (si ? 'කතා කරන්න' : 'Speak')}>
          <Text style={styles.btnTx}>{listening ? (si ? 'නවත්වන්න' : 'Stop') : (si ? 'කතා' : 'Mic')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  input: { flex: 1, minHeight: 52, borderRadius: 26, borderWidth: 1, paddingHorizontal: 18, fontSize: 16, marginRight: 10 },
  btn: { minWidth: 72, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnTx: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
