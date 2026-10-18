import { useColorScheme } from 'react-native';
import { Settings, Status } from './types';

export const accent = {
  violet: '#8B5CF6', indigo: '#6366F1', cyan: '#22D3EE', pink: '#F472B6', green: '#34D399', amber: '#FBBF24', rose: '#FB7185',
};

export const palettes = {
  dark: { bg: '#0A0508', card: 'rgba(22,6,12,0.78)', text: '#FFF1F3', sub: '#E3A6B2', border: 'rgba(255,92,124,0.32)', ok: '#86EFAC', err: '#FCA5A5', glass: 'rgba(255,255,255,0.09)' },
  light: { bg: '#F4F6FF', card: '#FFFFFF', text: '#0F172A', sub: '#5B6B8C', border: '#E1E7F5', ok: '#15803D', err: '#B91C1C', glass: 'rgba(15,23,42,0.04)' },
};
export type Palette = typeof palettes.dark;

export const statusColor: Record<Status, string> = {
  idle: '#FF2E63', listening: '#22D3EE', processing: '#FFB020', speaking: '#18C99B',
};
export const STATUS_ORDER: Status[] = ['idle', 'listening', 'processing', 'speaking'];

export function useTheme(pref: Settings['theme']): { palette: Palette; isDark: boolean } {
  const system = useColorScheme();
  const mode = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return { palette: palettes[mode], isDark: mode === 'dark' };
}
