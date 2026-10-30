import AsyncStorage from '@react-native-async-storage/async-storage';
import { Nimah } from '../native/Nimah';

const NAME = 'apikeys';
export const LEGACY_KEYS_STORAGE = 'nimah.apikeys.v1';

/** Reads API keys from encrypted storage; migrates (and deletes) the old plain-text copy once. */
export async function loadApiKeys(): Promise<string[]> {
  try {
    const enc = await Nimah.secureGet(NAME);
    if (enc) return JSON.parse(enc);
    const legacy = await AsyncStorage.getItem(LEGACY_KEYS_STORAGE);
    if (legacy) {
      const keys = JSON.parse(legacy) as string[];
      await Nimah.secureSet(NAME, JSON.stringify(keys));
      await AsyncStorage.removeItem(LEGACY_KEYS_STORAGE);
      return keys;
    }
  } catch { /* fall through */ }
  return [];
}

export async function saveApiKeys(keys: string[]): Promise<void> {
  await Nimah.secureSet(NAME, JSON.stringify(keys));
  await AsyncStorage.removeItem(LEGACY_KEYS_STORAGE).catch(() => {});
}
