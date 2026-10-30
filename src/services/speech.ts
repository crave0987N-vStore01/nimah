import { Nimah } from '../native/Nimah';
import { Settings } from '../types';
import { chooseVoice, effectivePitch, VoiceInfo } from './voice';

let cache: VoiceInfo[] | null = null;

export async function loadVoices(force = false): Promise<VoiceInfo[]> {
  if (cache && !force) return cache;
  try { cache = await Nimah.getVoices(); } catch { cache = []; }
  return cache;
}

/** Speaks with the user's voice settings (male-preferring selection, pitch, rate). */
export async function speakWith(text: string, s: Pick<Settings, 'locale' | 'speechRate' | 'pitch' | 'voiceName'>): Promise<void> {
  const voices = await loadVoices();
  const choice = chooseVoice(voices, s.locale, s.voiceName);
  await Nimah.speak(text, s.locale, s.speechRate, effectivePitch(s.pitch, choice.maleVoiceFound), choice.voiceName);
}
