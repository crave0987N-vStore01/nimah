import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { Palette } from '../theme';
import { Choice, ChoiceRequest, Locale } from '../types';

interface Props {
  request: ChoiceRequest;
  palette: Palette;
  locale: Locale;
  onPick: (c: Choice | null) => void;
}

/** "Which Asanka?" — tap an option, or answer by voice ("second", "Perera"). */
export default function ChoiceSheet({ request, palette, locale, onPick }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Text style={[styles.prompt, { color: palette.text }]}>{request.prompt}</Text>
      {request.options.map((o, i) => (
        <Pressable key={o.label} onPress={() => onPick(o)} style={[styles.option, { borderColor: palette.border }]}>
          <Text style={{ color: palette.text, fontSize: 16 }}>{i + 1}. {o.label}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => onPick(null)} style={styles.cancel}>
        <Text style={{ color: palette.err }}>{t(locale, 'cancel')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 12, elevation: 8 },
  prompt: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  option: { borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 8 },
  cancel: { alignSelf: 'flex-end', paddingTop: 10 },
});
