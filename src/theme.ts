import { useColorScheme } from 'react-native';
import { Settings, Status } from './types';

export const accent = {
  violet: '#8B5CF6', indigo: '#6366F1', cyan: '#22D3EE', pink: '#F472B6', green: '#34D399', amber: '#FBBF24', rose: '#FB7185',
};

export const glow = { red: '#E11D48', rose: '#FF4D6D', gold: '#F5B84B', ember: '#FF7A45', line: 'rgba(255,92,124,0.30)' };

export const palettes = {
  dark: { bg: '#0A0508', card: 'rgba(24,7,12,0.92)', text: '#FFF1F3', sub: '#E3A6B2', border: 'rgba(255,92,124,0.32)', ok: '#F5B84B', err: '#FCA5A5', glass: 'rgba(255,255,255,0.09)' },
  light: { bg: '#F4F6FF', card: '#FFFFFF', text: '#0F172A', sub: '#5B6B8C', border: '#E1E7F5', ok: '#15803D', err: '#B91C1C', glass: 'rgba(15,23,42,0.04)' },
};
export type Palette = typeof palettes.dark;

export const statusColor: Record<Status, string> = {
  idle: '#FF4D6D', listening: '#F5B84B', processing: '#FF7A45', speaking: '#FF2E63',
};
export const STATUS_ORDER: Status[] = ['idle', 'listening', 'processing', 'speaking'];

export function useTheme(pref: Settings['theme']): { palette: Palette; isDark: boolean } {
  const system = useColorScheme();
  const mode = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return { palette: palettes[mode], isDark: mode === 'dark' };
}
