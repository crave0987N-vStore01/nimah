import AsyncStorage from '@react-native-async-storage/async-storage';
import { Routine } from './routines';

const KEY = 'nimah.routines.v1';
let cache: Routine[] | null = null;

export async function loadRoutines(): Promise<Routine[]> {
  if (cache) return cache;
  try { const v = await AsyncStorage.getItem(KEY); cache = v ? (JSON.parse(v) as Routine[]) : []; } catch { cache = []; }
  return cache;
}
export async function saveRoutines(r: Routine[]): Promise<void> {
  cache = r;
  await AsyncStorage.setItem(KEY, JSON.stringify(r)).catch(() => {});
}
