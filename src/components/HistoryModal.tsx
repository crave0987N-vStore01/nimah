import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { Palette } from '../theme';
import { HistoryItem, Locale } from '../types';

interface Props {
  visible: boolean; items: HistoryItem[]; palette: Palette; locale: Locale;
  onClear: () => void; onClose: () => void;
}

export default function HistoryModal({ visible, items, palette, locale, onClear, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider><SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>{t(locale, 'history')}</Text>
          <View style={styles.row}>
            <Pressable onPress={onClear}><Text style={{ color: palette.err }}>{t(locale, 'clear')}</Text></Pressable>
            <Pressable onPress={onClose}><Text style={{ color: palette.text }}>{t(locale, 'close')}</Text></Pressable>
          </View>
        </View>
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={<Text style={{ color: palette.sub, textAlign: 'center', marginTop: 40 }}>{t(locale, 'noHistory')}</Text>}
          renderItem={({ item }) => (
            <View style={[styles.item, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={{ color: palette.text, fontSize: 15 }}>“{item.transcript}”</Text>
              <Text style={{ color: item.ok ? palette.ok : palette.err, marginTop: 4 }}>{item.summary}</Text>
              <Text style={{ color: palette.sub, fontSize: 12, marginTop: 4 }}>
                {item.action} · {new Date(item.ts).toLocaleString()}
              </Text>
            </View>
          )}
        />
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 18 },
  title: { fontSize: 22, fontWeight: '700' },
  item: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
});
