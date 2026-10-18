import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { accent } from '../theme';

const LETTERS = 'Nimah Dev'.split('');
const COLORS = ['#A78BFA', '#8B5CF6', '#6366F1', '#38BDF8', '#22D3EE', '', '#34D399', '#86EFAC', '#BEF264'];

/** "Powered by Nimah Dev" with a colourful, gently shimmering brand name. */
export default function Footer({ color }: { color: string }) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [glow]);
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: accent.violet }]} />
      <Text style={[styles.by, { color }]}>Powered by </Text>
      <Animated.View style={{ flexDirection: 'row', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }}>
        {LETTERS.map((ch, i) => (
          <Text key={i} style={[styles.brand, { color: COLORS[i] || 'transparent' }]}>{ch}</Text>
        ))}
      </Animated.View>
      <View style={[styles.dot, { backgroundColor: accent.green }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  by: { fontSize: 12, letterSpacing: 0.4 },
  brand: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  dot: { width: 5, height: 5, borderRadius: 3, marginHorizontal: 8 },
});
