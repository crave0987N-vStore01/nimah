import AsyncStorage from '@react-native-async-storage/async-storage';
import { Data, EMPTY, pruneReminders } from './notes';

const KEY = 'nimah.data.v1';
let cache: Data | null = null;

export async function loadData(): Promise<Data> {
  if (cache) return cache;
  try {
    const v = await AsyncStorage.getItem(KEY);
    cache = v ? pruneReminders({ ...EMPTY, ...JSON.parse(v) }) : EMPTY;
  } catch { cache = EMPTY; }
  return cache;
}

export async function saveData(d: Data): Promise<void> {
  cache = d;
  await AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {});
}

export async function clearData(): Promise<void> { cache = EMPTY; await AsyncStorage.removeItem(KEY).catch(() => {}); }
