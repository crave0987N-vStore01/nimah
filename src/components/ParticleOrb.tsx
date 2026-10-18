import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Status } from '../types';
import { glow } from '../theme';

const SIZE = 260;
const R = 104;
// Each ring = a circle of gold dots, squashed + tilted into an ellipse, slowly spinning -> a glowing "globe" of particles.
const RINGS = [
  { tilt: 0, k: 1, n: 40, ms: 26000, dir: 1, dot: 3, c: 0 },
  { tilt: 30, k: 0.42, n: 34, ms: 19000, dir: -1, dot: 3, c: 1 },
  { tilt: 60, k: 0.42, n: 34, ms: 22000, dir: 1, dot: 3, c: 2 },
  { tilt: 90, k: 0.42, n: 34, ms: 17000, dir: -1, dot: 3, c: 0 },
  { tilt: 120, k: 0.42, n: 34, ms: 24000, dir: 1, dot: 3, c: 1 },
  { tilt: 150, k: 0.42, n: 34, ms: 20000, dir: -1, dot: 3, c: 2 },
  { tilt: 0, k: 0.62, n: 26, ms: 15000, dir: 1, dot: 2.4, c: 1 },
  { tilt: 90, k: 0.62, n: 26, ms: 13000, dir: -1, dot: 2.4, c: 0 },
  { tilt: 0, k: 0.3, n: 18, ms: 11000, dir: 1, dot: 2, c: 2 },
];
const TONES = [glow.gold, glow.ember, glow.rose];      // gold · ember · rose-red
const SPEED: Record<Status, number> = { idle: 1, listening: 1.6, processing: 2.6, speaking: 1.9 };

interface Props { status: Status; level: Animated.Value }

/** Golden particle sphere. Breathes, spins faster while the AI listens / thinks / speaks, and swells with your voice. */
export default function ParticleOrb({ status, level }: Props) {
  const spins = useRef(RINGS.map(() => new Animated.Value(0))).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = spins.map((v, i) => Animated.loop(
      Animated.timing(v, { toValue: 1, duration: RINGS[i].ms / SPEED[status], easing: Easing.linear, useNativeDriver: true }),
    ));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [status, spins]);

  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [breathe]);

  // dot positions are fixed, so compute once
  const dots = useMemo(() => RINGS.map((r) => Array.from({ length: r.n }, (_, i) => {
    const a = (i / r.n) * Math.PI * 2;
    return { x: SIZE / 2 + R * Math.cos(a), y: SIZE / 2 + R * Math.sin(a), o: 0.35 + 0.65 * Math.abs(Math.sin(a * 1.5 + 0.7)) };
  })), []);

  const swell = Animated.multiply(
    level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }),
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }),
  );

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.glow, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] }) }]} />
      <Animated.View style={[styles.sphere, { transform: [{ scale: swell }] }]}>
        {RINGS.map((r, ri) => (
          <View key={ri} style={[styles.abs, { transform: [{ rotate: `${r.tilt}deg` }, { scaleY: r.k }] }]}>
            <Animated.View style={[styles.abs, {
              transform: [{ rotate: spins[ri].interpolate({ inputRange: [0, 1], outputRange: r.dir > 0 ? ['0deg', '360deg'] : ['360deg', '0deg'] }) }],
            }]}>
              {dots[ri].map((d, i) => (
                <View key={i} style={{
                  position: 'absolute', left: d.x - r.dot / 2, top: d.y - r.dot / 2,
                  width: r.dot, height: r.dot, borderRadius: r.dot, backgroundColor: TONES[r.c], opacity: d.o,
                }} />
              ))}
            </Animated.View>
          </View>
        ))}
        <View style={styles.coreHalo} />
        <View style={styles.core} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute', width: SIZE, height: SIZE },
  sphere: { width: SIZE, height: SIZE },
  glow: { position: 'absolute', width: SIZE * 0.8, height: SIZE * 0.8, borderRadius: SIZE, backgroundColor: 'rgba(225,29,72,0.07)' },
  coreHalo: { position: 'absolute', left: SIZE / 2 - 26, top: SIZE / 2 - 26, width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,122,69,0.22)' },
  core: { position: 'absolute', left: SIZE / 2 - 17, top: SIZE / 2 - 17, width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: glow.gold, backgroundColor: 'rgba(225,29,72,0.55)' },
});
