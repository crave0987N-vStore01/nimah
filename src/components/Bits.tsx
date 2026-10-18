import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/** Fades + slides its children in whenever it mounts (or `trigger` changes). */
export function FadeInUp({ children, trigger, delay = 0, style }: { children: React.ReactNode; trigger?: unknown; delay?: number; style?: any }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trigger, delay, v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Three bouncing dots ("thinking"). */
export function Dots({ color }: { color: string }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = vals.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.delay((2 - i) * 160),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [vals]);
  return (
    <View style={styles.dots}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
      ))}
    </View>
  );
}

/** Cycles through example commands with a cross-fade. */
export function RotatingHint({ items, color }: { items: string[]; color: string }) {
  const [i, setI] = useState(0);
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(v, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setI((n) => (n + 1) % items.length);
        Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 3600);
    return () => clearInterval(id);
  }, [items.length, v]);
  return <Animated.Text style={[styles.hint, { color, opacity: v }]}>{items[i]}</Animated.Text>;
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, height: 16, alignItems: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hint: { textAlign: 'center', fontSize: 14, minHeight: 20 },
});
