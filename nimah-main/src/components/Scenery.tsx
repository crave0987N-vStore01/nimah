import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, ImageBackground, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const COLORS = ['#FF2A2A', '#D1121B', '#9E0F16', '#FF5A1F', '#C4141C'];

// small deterministic pseudo-random so petals look natural but do not jump on re-render
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

function Petal({ i }: { i: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => ({
    x: rnd(i, 1) * W, size: 8 + rnd(i, 2) * 12, dur: 9000 + rnd(i, 3) * 8000, delay: rnd(i, 4) * 9000,
    sway: 30 + rnd(i, 5) * 60, spin: 1 + rnd(i, 6) * 2, color: COLORS[i % COLORS.length], op: 0.45 + rnd(i, 7) * 0.45,
  }), [i]);
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.delay(cfg.delay),
      Animated.timing(t, { toValue: 1, duration: cfg.dur, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [cfg, t]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: cfg.x, top: -30,
      width: cfg.size, height: cfg.size * 0.7, backgroundColor: cfg.color,
      borderTopLeftRadius: cfg.size, borderBottomRightRadius: cfg.size, borderTopRightRadius: 2, borderBottomLeftRadius: 2,
      opacity: t.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, cfg.op, cfg.op, 0] }),
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, H + 60] }) },
        { translateX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, cfg.sway, 0, -cfg.sway, 0] }) },
        { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * cfg.spin}deg`] }) },
      ],
    }} />
  );
}

/** Soft red glow that breathes (used for the moon and the lantern). */
function Glow({ left, top, size, color, period, min, max }: { left: string; top: string; size: number; color: string; period: number; min: number; max: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v, period]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: left as any, top: top as any, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
      borderRadius: size / 2, backgroundColor: color,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [min, max] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
    }} />
  );
}

/** Living wallpaper: slow camera drift, breathing moon + lantern glow, falling sakura petals. */
export default function Scenery() {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [drift]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, {
        transform: [
          { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.12] }) },
          { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) },
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [6, -6] }) },
        ],
      }]}>
        <ImageBackground source={require('../assets/background.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {/* moon (right, upper) and lantern (left) breathe with light */}
        <Glow left="72%" top="25%" size={W * 0.75} color="#FF1F3D" period={3800} min={0.10} max={0.30} />
        <Glow left="19%" top="28%" size={W * 0.45} color="#FF5A36" period={1400} min={0.08} max={0.26} />
        <Glow left="18%" top="82%" size={W * 0.3} color="#FF5A36" period={1900} min={0.06} max={0.2} />
      </Animated.View>
      {Array.from({ length: 16 }, (_, i) => <Petal key={i} i={i} />)}
    </View>
  );
}
