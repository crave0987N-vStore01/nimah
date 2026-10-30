import React, { useRef } from 'react';
import { FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text } from './Txt';
import { ChatMessage } from '../hooks/useAssistant';
import { Palette } from '../theme';
import { Locale } from '../types';

interface Props { messages: ChatMessage[]; palette: Palette; locale: Locale; onRepeat: (text: string) => void }

/** User / assistant bubbles with real per-message actions (Speak again, Share). */
export default function ChatPanel({ messages, palette, locale, onRepeat }: Props) {
  const si = locale === 'si-LK';
  const list = useRef<FlatList<ChatMessage>>(null);
  return (
    <FlatList
      ref={list}
      data={messages}
      keyExtractor={(m) => m.id}
      onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
      contentContainerStyle={messages.length ? styles.pad : styles.empty}
      ListEmptyComponent={
        <View style={styles.emptyBox}>
          <Text style={{ color: palette.text, fontSize: 18, textAlign: 'center' }}>{si ? 'ආයුබෝවන් සර්' : 'Hello, sir'}</Text>
          <Text style={{ color: palette.sub, textAlign: 'center', marginTop: 8 }}>
            {si ? 'mic එක ඔබන්න, නැත්නම් පහළින් type කරන්න. උදා: “remind me to call Kamal in 10 minutes”.'
                : 'Tap the mic or type below. Try: “remind me to call Kamal in 10 minutes”.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const mine = item.role === 'user';
        return (
          <View style={[styles.row, mine ? styles.right : styles.left]}>
            <View style={[styles.bubble, { backgroundColor: mine ? '#C4141C' : palette.card, borderColor: palette.border }]}>
              <Text selectable style={{ color: mine ? '#fff' : palette.text, fontSize: 16, lineHeight: 23 }}>{item.text}</Text>
              {!mine && (
                <View style={styles.actions}>
                  <Pressable onPress={() => onRepeat(item.text)} style={styles.act} accessibilityRole="button" accessibilityLabel={si ? 'නැවත කියන්න' : 'Speak again'}>
                    <Text style={{ color: palette.sub, fontSize: 13 }}>{si ? 'නැවත' : 'Speak'}</Text>
                  </Pressable>
                  <Pressable onPress={() => { Share.share({ message: item.text }).catch(() => {}); }} style={styles.act} accessibilityRole="button" accessibilityLabel="Share">
                    <Text style={{ color: palette.sub, fontSize: 13 }}>{si ? 'බෙදාගන්න' : 'Share'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: 8 },
  empty: { flexGrow: 1, justifyContent: 'center' },
  emptyBox: { paddingHorizontal: 24 },
  row: { flexDirection: 'row', marginBottom: 8 },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '86%', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  actions: { flexDirection: 'row', marginTop: 6 },
  act: { minHeight: 36, minWidth: 48, justifyContent: 'center', paddingRight: 14 },
});
