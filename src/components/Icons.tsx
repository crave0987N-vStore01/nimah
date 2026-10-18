import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Small hand-drawn line icons (no emoji, no icon font) so they look identical on every phone. */
export function KeyIcon({ color, size = 22 }: { color: string; size?: number }) {
  const u = size / 22;
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: '-35deg' }] }}>
      <View style={{ position: 'absolute', left: 1 * u, top: 6 * u, width: 10 * u, height: 10 * u, borderRadius: 5 * u, borderWidth: 1.8, borderColor: color }} />
      <View style={{ position: 'absolute', left: 10.5 * u, top: 10 * u, width: 11 * u, height: 1.8, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 16 * u, top: 10 * u, width: 1.8, height: 4.5 * u, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 19.5 * u, top: 10 * u, width: 1.8, height: 3.5 * u, backgroundColor: color }} />
    </View>
  );
}

export function SlidersIcon({ color, size = 22 }: { color: string; size?: number }) {
  const rows = [{ y: 4, k: 14 }, { y: 10, k: 6 }, { y: 16, k: 12 }];
  return (
    <View style={{ width: size, height: size }}>
      {rows.map((r, i) => (
        <View key={i}>
          <View style={[styles.line, { top: r.y * size / 22 + 2, backgroundColor: color, width: size }]} />
          <View style={{ position: 'absolute', top: r.y * size / 22 - 1, left: r.k * size / 22 - 3, width: 7, height: 7, borderRadius: 4, backgroundColor: '#14060A', borderWidth: 1.8, borderColor: color }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ line: { position: 'absolute', left: 0, height: 1.6, borderRadius: 1 } });
