import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Txt';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Nimah } from '../native/Nimah';
import {
  addNote, addReminder, addTask, cancelReminder, completeTask, Data, deleteNote, deleteTask, EMPTY, upcomingReminders,
} from '../services/notes';
import { parseWhen } from '../services/parseTime';
import { loadData, saveData } from '../services/storage';
import { Palette } from '../theme';
import { Locale } from '../types';

type Tab = 'notes' | 'tasks' | 'reminders';

/** Manage notes, tasks and reminders by touch (same data the voice commands use). */
export default function NotesModal({ visible, palette, locale, onClose }: { visible: boolean; palette: Palette; locale: Locale; onClose: () => void }) {
  const si = locale === 'si-LK';
  const [tab, setTab] = useState<Tab>('notes');
  const [data, setData] = useState<Data>(EMPTY);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (visible) loadData().then(setData).catch(() => {}); }, [visible]);
  const commit = useCallback(async (d: Data) => { setData(d); await saveData(d); }, []);

  const add = async () => {
    const v = text.trim(); if (!v) return;
    setMsg('');
    if (tab === 'notes') await commit(addNote(data, v));
    else if (tab === 'tasks') await commit(addTask(data, v));
    else {
      const w = parseWhen(v, new Date());
      if (!w || !w.rest) { setMsg(si ? 'උදා: call Kamal in 10 minutes / at 5 pm' : 'Example: call Kamal in 10 minutes / at 5 pm'); return; }
      const d = addReminder(data, w.rest, w.at.getTime());
      const r = d.reminders.find((x) => x.text === w.rest && x.at === w.at.getTime())!;
      await Nimah.scheduleReminder(r.id, r.at, r.text).catch(() => {});
      await commit(d);
    }
    setText('');
  };
  const confirmDelete = (what: string, run: () => void) =>
    Alert.alert(si ? 'මකන්නද?' : 'Delete?', what, [{ text: si ? 'එපා' : 'Cancel', style: 'cancel' }, { text: si ? 'මකන්න' : 'Delete', style: 'destructive', onPress: run }]);

  const rows = tab === 'notes' ? data.notes.map((n) => ({ id: n.id, label: n.text, done: false }))
    : tab === 'tasks' ? data.tasks.map((t) => ({ id: t.id, label: t.text, done: t.done }))
    : upcomingReminders(data).map((r) => ({ id: r.id, label: `${new Date(r.at).toLocaleString()} — ${r.text}`, done: false }));

  const tabs: [Tab, string][] = [['notes', 'Notes'], ['tasks', 'Tasks'], ['reminders', si ? 'මතක් කිරීම්' : 'Reminders']];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider><SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>Notes · Tasks · Reminders</Text>
          <Pressable onPress={onClose} style={styles.close}><Text style={{ color: palette.text }}>{si ? 'වසන්න' : 'Close'}</Text></Pressable>
        </View>
        <View style={styles.tabs}>
          {tabs.map(([k, l]) => (
            <Pressable key={k} onPress={() => { setTab(k); setMsg(''); }} style={[styles.tab, { borderColor: palette.border, backgroundColor: tab === k ? '#C4141C' : palette.card }]}>
              <Text style={{ color: tab === k ? '#fff' : palette.text }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={add}
            placeholder={tab === 'reminders' ? (si ? 'call Kamal in 10 minutes' : 'call Kamal in 10 minutes') : (si ? 'අලුතින් එකතු කරන්න…' : 'Add new…')}
            placeholderTextColor={palette.sub} style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card }]} />
          <Pressable onPress={add} style={styles.addBtn}><Text style={{ color: '#fff', fontWeight: '700' }}>{si ? 'එකතු' : 'Add'}</Text></Pressable>
        </View>
        {!!msg && <Text style={{ color: palette.err, marginBottom: 6 }}>{msg}</Text>}
        <ScrollView>
          {rows.length === 0 && <Text style={{ color: palette.sub, textAlign: 'center', marginTop: 30 }}>{si ? 'කිසිවක් නැහැ.' : 'Nothing here yet.'}</Text>}
          {rows.map((r) => (
            <View key={r.id} style={[styles.item, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <Text style={{ flex: 1, color: palette.text, fontSize: 16, textDecorationLine: r.done ? 'line-through' : 'none' }}>{r.label}</Text>
              {tab === 'tasks' && !r.done && (
                <Pressable onPress={() => commit(completeTask(data, r.id))} style={styles.small}><Text style={{ color: palette.ok }}>{si ? 'අවසන්' : 'Done'}</Text></Pressable>
              )}
              <Pressable style={styles.small} onPress={() => confirmDelete(r.label, async () => {
                if (tab === 'notes') await commit(deleteNote(data, r.id));
                else if (tab === 'tasks') await commit(deleteTask(data, r.id));
                else { await Nimah.cancelReminder(r.id).catch(() => {}); await commit(cancelReminder(data, r.id)); }
              })}><Text style={{ color: palette.err }}>{tab === 'reminders' ? (si ? 'අවලංගු' : 'Cancel') : (si ? 'මකන්න' : 'Delete')}</Text></Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  close: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  tabs: { flexDirection: 'row', marginBottom: 12 },
  tab: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, justifyContent: 'center', marginRight: 8 },
  addRow: { flexDirection: 'row', marginBottom: 10 },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, marginRight: 8 },
  addBtn: { minWidth: 70, minHeight: 48, borderRadius: 14, backgroundColor: '#C4141C', alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, minHeight: 56 },
  small: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
});
