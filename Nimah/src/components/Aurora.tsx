import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { accent } from '../theme';

/** Slow drifting colour blobs behind the whole screen. */
export default function Aurora({ dark }: { dark: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = (v: Animated.Value, d: number) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const x = loop(a, 9000), y = loop(b, 12000);
    x.start(); y.start();
    return () => { x.stop(); y.stop(); };
  }, [a, b]);
  const o = dark ? 0.16 : 0.12;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.blob, { top: -120, left: -100, backgroundColor: accent.violet, opacity: o,
        transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, 90] }) }, { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }) }] }]} />
      <Animated.View style={[styles.blob, { bottom: -140, right: -120, backgroundColor: accent.cyan, opacity: o,
        transform: [{ translateX: b.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }) }, { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [0, -70] }) }] }]} />
      <Animated.View style={[styles.blob, styles.small, { top: '40%', right: -90, backgroundColor: accent.pink, opacity: o * 0.8,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', width: 340, height: 340, borderRadius: 170 },
  small: { width: 220, height: 220, borderRadius: 110 },
});
