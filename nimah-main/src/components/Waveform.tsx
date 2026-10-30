import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const SHAPE = [0.45, 0.75, 1, 0.75, 0.45, 0.6, 0.9, 0.6]; // relative bar heights

/** Bars that react to the microphone level (0..1). */
export default function Waveform({ level, active, color }: { level: Animated.Value; active: boolean; color: string }) {
  return (
    <View style={styles.row}>
      {SHAPE.map((k, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              opacity: active ? 1 : 0.25,
              transform: [{ scaleY: level.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.12 + 0.88 * k] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, gap: 6 },
  bar: { width: 6, height: 56, borderRadius: 3 },
});
