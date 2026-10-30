import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Txt';
import { Nimah } from '../native/Nimah';
import { loadVoices, speakWith } from '../services/speech';
import { looksFemale, looksMale, voicesForLocale, VoiceInfo } from '../services/voice';
import { Palette } from '../theme';
import { Settings } from '../types';

/** Lists the TTS voices installed on this phone. Tap to choose, "Preview" to hear it. */
export default function VoicePicker({ settings: s, palette, onChange }: {
  settings: Settings; palette: Palette; onChange: (patch: Partial<Settings>) => void;
}) {
  const si = s.locale === 'si-LK';
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { loadVoices(true).then(setVoices); }, [s.locale]);
  const list = voicesForLocale(voices, s.locale);
  const noneForLocale = list.length === 0;
  const shown = (noneForLocale ? voicesForLocale(voices, 'en') : list)
    .slice().sort((a, b) => Number(looksMale(b.name)) - Number(looksMale(a.name)) || Number(looksFemale(a.name)) - Number(looksFemale(b.name)));
  const sample = si ? 'ආයුබෝවන් සර්, මම නිමා.' : 'Hello sir, I am Nimah.';

  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button"
        style={[styles.btn, { borderColor: palette.border, backgroundColor: palette.card }]}>
        <Text style={{ color: palette.text }}>{s.voiceName ? s.voiceName : (si ? 'ස්වයංක්‍රීය (පිරිමි හඬ)' : 'Automatic (male-sounding)')}</Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 8 }}>
          {noneForLocale && (
            <View>
              <Text style={{ color: palette.sub, marginBottom: 8 }}>
                {si ? 'සිංහල හඬ phone එකේ install වෙලා නැහැ. English හඬ පෙන්වනවා.' : 'No voice installed for this language; showing English voices.'}
              </Text>
              <Pressable onPress={() => { Nimah.openSettings('tts').catch(() => {}); }} style={[styles.btn, { borderColor: palette.border }]}>
                <Text style={{ color: palette.text }}>{si ? 'Voice data install කරන්න' : 'Install voice data'}</Text>
              </Pressable>
            </View>
          )}
          <Pressable onPress={() => onChange({ voiceName: '' })} style={[styles.item, { borderColor: palette.border }]}>
            <Text style={{ color: palette.text }}>{si ? 'ස්වයංක්‍රීය' : 'Automatic'}{!s.voiceName ? '  ✓' : ''}</Text>
          </Pressable>
          {shown.map((v) => (
            <View key={v.name} style={[styles.item, { borderColor: palette.border }]}>
              <Pressable style={{ flex: 1 }} onPress={() => onChange({ voiceName: v.name })}>
                <Text style={{ color: palette.text }}>{v.name}{s.voiceName === v.name ? '  ✓' : ''}</Text>
                <Text style={{ color: palette.sub, fontSize: 12 }}>
                  {v.locale}{looksMale(v.name) ? ' · male' : looksFemale(v.name) ? ' · female' : ''}{v.requiresNetwork ? ' · online' : ''}
                </Text>
              </Pressable>
              <Pressable onPress={() => { speakWith(sample, { ...s, voiceName: v.name }).catch(() => {}); }} style={styles.prev}>
                <Text style={{ color: palette.text }}>{si ? 'අසන්න' : 'Preview'}</Text>
              </Pressable>
            </View>
          ))}
          <Text style={{ color: palette.sub, fontSize: 12, marginTop: 8 }}>
            {si ? 'Android වල හඬේ ස්ත්‍රී/පුරුෂ භාවය හඳුනාගන්න නිල ක්‍රමයක් නැහැ. Preview කරලා ඔබට ඕන පිරිමි හඬ තෝරන්න.'
                : 'Android has no official gender flag for voices. Preview them and pick the male one you like.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 48, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, minHeight: 48 },
  prev: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, justifyContent: 'center' },
});
