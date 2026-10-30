import React from 'react';
import { StyleSheet, Text as RNText, TextProps } from 'react-native';
import { fontFor } from '../fonts';

// Bundled fonts (android/app/src/main/assets/fonts):
//  Cinzel         - display / titles       (style fontFamily: 'serif')
//  Rajdhani       - interface text
//  Noto Sans Sinhala - Sinhala script (picked automatically)
const SINHALA = /[\u0D80-\u0DFF]/;

function plain(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(plain).join('');
  return '';
}

/** Drop-in replacement for react-native's Text that always uses Nimah's fonts. */
export function Text({ style, children, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) || {};
  const family = fontFor(flat.fontFamily, flat.fontWeight, SINHALA.test(plain(children)));
  return (
    <RNText {...rest} style={[style, { fontFamily: family, fontWeight: 'normal' }]}>
      {children}
    </RNText>
  );
}
