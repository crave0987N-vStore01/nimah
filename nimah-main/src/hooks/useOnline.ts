import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Cheap connectivity probe (no extra dependency): a tiny request every 30 s while the app is open. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let alive = true;
    const probe = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const r = await fetch('https://www.gstatic.com/generate_204', { method: 'GET', signal: ctrl.signal });
        if (alive) setOnline(r.status === 204 || r.ok);
      } catch { if (alive) setOnline(false); }
      finally { clearTimeout(timer); }
    };
    void probe();
    const id = setInterval(probe, 30000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void probe(); });
    return () => { alive = false; clearInterval(id); sub.remove(); };
  }, []);
  return online;
}
