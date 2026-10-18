import { useColorScheme } from 'react-native';
import { Settings, Status } from './types';

export const accent = { red: '#FF2A2A', crimson: '#C4141C', ember: '#FF5A1F', bone: '#E9DDD7', ash: '#8A7F7C' };

export const glow = { red: '#C4141C', rose: '#FF2A2A', gold: '#E9DDD7', ember: '#FF5A1F', line: 'rgba(255,42,42,0.30)' };

export const palettes = {
  dark: { bg: '#0A0508', card: 'rgba(12,5,6,0.94)', text: '#F3EAE6', sub: '#B9A9A5', border: 'rgba(255,42,42,0.30)', ok: '#E9DDD7', err: '#FF8A80', glass: 'rgba(255,255,255,0.09)' },
  light: { bg: '#F4F6FF', card: '#FFFFFF', text: '#0F172A', sub: '#5B6B8C', border: '#E1E7F5', ok: '#15803D', err: '#B91C1C', glass: 'rgba(15,23,42,0.04)' },
};
export type Palette = typeof palettes.dark;

export const statusColor: Record<Status, string> = {
  idle: '#C4141C', listening: '#FF2A2A', processing: '#FF5A1F', speaking: '#E9DDD7',
};
export const STATUS_ORDER: Status[] = ['idle', 'listening', 'processing', 'speaking'];

export function useTheme(pref: Settings['theme']): { palette: Palette; isDark: boolean } {
  const system = useColorScheme();
  const mode = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return { palette: palettes[mode], isDark: mode === 'dark' };
}
