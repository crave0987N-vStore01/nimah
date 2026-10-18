import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

/** The Nimah emblem (src/assets/logo.png) in a softly glowing red ring. */
export default function Logo({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={require('../assets/logo.png')} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { backgroundColor: '#000', shadowColor: '#FF2A2A', elevation: 10, overflow: 'hidden' },
});
