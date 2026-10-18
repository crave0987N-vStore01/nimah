import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Quiet maker's mark. */
export default function Footer({ color }: { color: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rule} />
      <Text style={[styles.by, { color }]}>NIMAH DEV</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  by: { fontSize: 10, letterSpacing: 3.2, opacity: 0.75, marginHorizontal: 12 },
  rule: { width: 22, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(245,184,75,0.5)' },
});
