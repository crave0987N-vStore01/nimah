import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HistoryItem } from '../types';

const KEY = 'nimah.history.v1';
const MAX_ITEMS = 50;

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setItems(JSON.parse(v)); }).catch(() => {});
  }, []);

  const persist = (next: HistoryItem[]) => AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});

  const add = useCallback((entry: Omit<HistoryItem, 'id' | 'ts'>) => {
    setItems((prev) => {
      const now = Date.now();
      const next = [{ ...entry, id: String(now), ts: now }, ...prev].slice(0, MAX_ITEMS);
      persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => { setItems([]); persist([]); }, []);
  return { items, add, clear };
}
