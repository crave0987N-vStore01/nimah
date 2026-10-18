import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { glow } from '../theme';

// To use an image logo instead: put it at src/assets/logo.png and render
// <Image source={require('../assets/logo.png')} style={{ width: size, height: size }} />
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Text style={[styles.n, { fontSize: size * 0.56 }]}>N</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: 'rgba(245,184,75,0.7)', backgroundColor: 'rgba(225,29,72,0.18)', alignItems: 'center', justifyContent: 'center' },
  n: { color: glow.gold, fontFamily: 'serif', fontWeight: '600', marginTop: -2 },
});
