import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { Status } from '../types';
import { STATUS_ORDER, statusColor } from '../theme';

const SPEED: Record<Status, number> = { idle: 3200, listening: 1300, processing: 1800, speaking: 1100 };
const SIZE = 118;
const BOX = SIZE * 2.4;

interface Props { status: Status; level: Animated.Value; onPress: () => void; label: string }

/**
 * The big living orb: it breathes, glows with a soft red-moon aura, has a bright halo rim,
 * little sparks orbiting it, ripples when you speak and a spinner while the AI thinks.
 */
export default function Orb({ status, level, onPress, label }: Props) {
  const breathe = useRef(new Animated.Value(0)).current;
  const breatheB = useRef(new Animated.Value(0)).current;   // second, offset breath (organic feel)
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const orbitA = useRef(new Animated.Value(0)).current;
  const orbitB = useRef(new Animated.Value(0)).current;
  const spinOpacity = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const tone = useRef(new Animated.Value(0)).current;       // 0..3 -> colour (JS driven)

  useEffect(() => {
    Animated.timing(tone, { toValue: STATUS_ORDER.indexOf(status), duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    Animated.timing(spinOpacity, { toValue: status === 'processing' ? 1 : 0, duration: 350, useNativeDriver: true }).start();

    const d = SPEED[status];
    const breath = (v: Animated.Value, dur: number) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: dur * 1.15, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const ring = (v: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: d * 1.8, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const turn = (v: Animated.Value, dur: number) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));

    const anims = [
      breath(breathe, d), breath(breatheB, d * 1.35),
      ring(ripple1, 0), ring(ripple2, d * 0.9),
      turn(spin, 1400), turn(orbitA, d * 3.2), turn(orbitB, d * 5),
    ];
    anims.forEach((a) => a.start());
    return () => { anims.forEach((a) => a.stop()); spin.setValue(0); };
  }, [status, breathe, breatheB, ripple1, ripple2, spin, orbitA, orbitB, spinOpacity, tone]);

  const colors = STATUS_ORDER.map((s) => statusColor[s]);
  const bg = tone.interpolate({ inputRange: [0, 1, 2, 3], outputRange: colors });
  const rot = (v: Animated.Value, rev = false) =>
    v.interpolate({ inputRange: [0, 1], outputRange: rev ? ['360deg', '0deg'] : ['0deg', '360deg'] });
  const loud = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const amp = status === 'idle' ? 0.05 : 0.09;
  const core = Animated.multiply(press, Animated.multiply(loud,
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + amp] })));

  // Soft aura = several translucent discs of growing size, each breathing a little differently.
  const aura = [
    { s: 1.25, o: 0.30, v: breathe, k: 0.10 },
    { s: 1.55, o: 0.20, v: breatheB, k: 0.14 },
    { s: 1.90, o: 0.12, v: breathe, k: 0.18 },
    { s: 2.30, o: 0.07, v: breatheB, k: 0.22 },
  ];

  const rippleStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
  });

  return (
    <View style={styles.wrap}>
      {aura.map((l, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.abs, {
          opacity: l.v.interpolate({ inputRange: [0, 1], outputRange: [l.o * 0.7, l.o * 1.25] }),
          transform: [{ scale: l.v.interpolate({ inputRange: [0, 1], outputRange: [l.s, l.s + l.k * 2] }) }],
        }]}>
          <Animated.View style={[styles.fill, { backgroundColor: bg }]} />
        </Animated.View>
      ))}

      {[ripple1, ripple2].map((v, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.abs, rippleStyle(v)]}>
          <Animated.View style={[styles.fill, styles.ring, { borderColor: bg }]} />
        </Animated.View>
      ))}

      {/* bright halo rim that pulses with the breath */}
      <Animated.View pointerEvents="none" style={[styles.abs, styles.rimBox, {
        opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
        transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
      }]}>
        <Animated.View style={[styles.fill, styles.rim, { borderColor: bg }]} />
      </Animated.View>

      {/* orbiting sparks */}
      <Spark rot={rot(orbitA)} radius={SIZE * 0.78} size={9} bg={bg} />
      <Spark rot={rot(orbitB, true)} radius={SIZE * 1.0} size={6} bg={bg} />

      {/* thinking spinner */}
      <Animated.View pointerEvents="none" style={[styles.abs, styles.spinBox, { opacity: spinOpacity, transform: [{ rotate: rot(spin) }] }]}>
        <Animated.View style={[styles.fill, styles.spinRing, { borderTopColor: bg, borderRightColor: bg }]} />
      </Animated.View>

      <Pressable
        onPress={() => { Vibration.vibrate(18); onPress(); }}
        onPressIn={() => Animated.spring(press, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start()}
        accessibilityRole="button" accessibilityLabel={label}>
        <Animated.View style={{ transform: [{ scale: core }] }}>
          <Animated.View style={[styles.core, { backgroundColor: bg }]}>
            <View style={styles.shine} />
            <View style={styles.innerRing} />
            <MicGlyph />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** A small glowing dot that circles the orb. */
function Spark({ rot, radius, size, bg }: { rot: Animated.AnimatedInterpolation<string>; radius: number; size: number; bg: Animated.AnimatedInterpolation<string> }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.sparkBox, { width: radius * 2, height: radius * 2, transform: [{ rotate: rot }] }]}>
      <View style={[styles.sparkHalo, { width: size * 3, height: size * 3, borderRadius: size * 1.5, top: -size * 1.5 + 0 }]}>
        <Animated.View style={{ flex: 1, borderRadius: size * 1.5, backgroundColor: bg, opacity: 0.3 }} />
      </View>
      <View style={[styles.spark, { width: size, height: size, borderRadius: size / 2 }]} />
    </Animated.View>
  );
}

/** Drawn microphone (no emoji, so it looks the same on every phone). */
function MicGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.capsule} />
      <View style={styles.cradle} />
      <View style={styles.stem} />
      <View style={styles.base} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute', width: SIZE, height: SIZE },
  fill: { flex: 1, borderRadius: SIZE },
  ring: { borderWidth: 2, backgroundColor: 'transparent' },
  rimBox: { width: SIZE + 16, height: SIZE + 16 },
  rim: { borderWidth: 3, backgroundColor: 'transparent' },
  spinBox: { width: SIZE + 30, height: SIZE + 30 },
  spinRing: { borderWidth: 4, borderColor: 'transparent', backgroundColor: 'transparent' },
  sparkBox: { position: 'absolute', alignItems: 'center' },
  spark: { backgroundColor: '#FFF4F6' },
  sparkHalo: { position: 'absolute', overflow: 'hidden' },
  core: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', elevation: 14, overflow: 'hidden' },
  shine: { position: 'absolute', top: -SIZE * 0.35, left: -SIZE * 0.1, width: SIZE * 1.2, height: SIZE * 0.8, borderRadius: SIZE, backgroundColor: 'rgba(255,255,255,0.20)' },
  innerRing: { position: 'absolute', width: SIZE - 14, height: SIZE - 14, borderRadius: SIZE, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)' },
  glyph: { alignItems: 'center', height: 54 },
  capsule: { width: 20, height: 30, borderRadius: 10, backgroundColor: '#fff' },
  cradle: { position: 'absolute', top: 14, width: 32, height: 24, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: 3, borderTopWidth: 0, borderColor: '#fff' },
  stem: { position: 'absolute', top: 38, width: 3, height: 8, backgroundColor: '#fff' },
  base: { position: 'absolute', top: 46, width: 16, height: 3, borderRadius: 2, backgroundColor: '#fff' },
});
