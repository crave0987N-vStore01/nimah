import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from './Txt';
import { Palette } from '../theme';
import { Locale } from '../types';

export interface Quick { en: string; si: string; text: string; send: boolean }
// send=true runs immediately; send=false puts the start of the command in the input box for you to finish.
export const QUICK: Quick[] = [
  { en: 'WhatsApp', si: 'WhatsApp', text: 'Send a WhatsApp message to ', send: false },
  { en: 'Call', si: 'ඇමතුම', text: 'Call ', send: false },
  { en: 'Remind me', si: 'මතක් කරන්න', text: 'Remind me to ', send: false },
  { en: 'Timer', si: 'Timer', text: 'Timer 5 minutes', send: false },
  { en: 'Alarm', si: 'Alarm', text: 'Set alarm at ', send: false },
  { en: 'Notes', si: 'Notes', text: 'show notes', send: true },
  { en: 'Tasks', si: 'Tasks', text: 'my tasks', send: true },
  { en: 'Briefing', si: 'සාරාංශය', text: 'briefing', send: true },
  { en: 'Time', si: 'වෙලාව', text: 'what time is it', send: true },
  { en: 'Read screen', si: 'තිරය කියවන්න', text: 'read my screen', send: true },
  { en: 'Search', si: 'සොයන්න', text: 'Search for ', send: false },
  { en: 'Translate', si: 'පරිවර්තනය', text: 'Translate to Sinhala: ', send: false },
  { en: 'Summarize', si: 'සාරාංශ කරන්න', text: 'Summarize: ', send: false },
  { en: 'Explain', si: 'පැහැදිලි කරන්න', text: 'Explain ', send: false },
];

export default function QuickActions({ palette, locale, onPick }: { palette: Palette; locale: Locale; onPick: (q: Quick) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {QUICK.map((q) => (
        <Pressable key={q.en} onPress={() => onPick(q)} accessibilityRole="button"
          style={[styles.chip, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={{ color: palette.text, fontSize: 14 }}>{locale === 'si-LK' ? q.si : q.en}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, justifyContent: 'center', marginRight: 8 },
});
