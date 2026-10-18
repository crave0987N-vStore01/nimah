import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { accent } from '../theme';

// When you have a logo image: put it at src/assets/logo.png and swap the body of this
// component for  <Image source={require('../assets/logo.png')} style={{ width: size, height: size }} />
export default function Logo({ size = 38 }: { size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <View style={[styles.half, { backgroundColor: accent.pink, borderRadius: size * 0.3 }]} />
      <Text style={[styles.n, { fontSize: size * 0.58 }]}>N</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: '#E11D48', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', elevation: 6 },
  half: { position: 'absolute', right: -14, bottom: -14, width: '70%', height: '70%', opacity: 0.55 },
  n: { color: '#fff', fontWeight: '800' },
});
