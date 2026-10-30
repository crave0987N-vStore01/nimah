import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Txt';

/** "Powered by Nimah Dev" — quiet ash text, crimson maker's name. */
export default function Footer({ color }: { color: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rule} />
      <Text style={[styles.by, { color }]}>POWERED BY</Text>
      <Text style={styles.brand}>NIMAH DEV</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  by: { fontSize: 10.5, letterSpacing: 3, opacity: 0.7, marginLeft: 10 },
  brand: { fontSize: 12, letterSpacing: 3.4, color: '#FF2A2A', fontFamily: 'serif', fontWeight: '700', marginLeft: 7, marginRight: 10 },
  rule: { width: 22, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,42,42,0.55)' },
});
