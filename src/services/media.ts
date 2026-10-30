// Media / volume keys by voice (pure parsing; native = NimahModule.mediaKey).
export type MediaCmd = 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'volume_up' | 'volume_down' | 'mute' | 'unmute';

export function parseMedia(input: string): MediaCmd | null {
  const t = input.trim().toLowerCase().replace(/^(?:hey |ok |okay |please |nimah[, ]+)+/, '').replace(/[.!?]+$/, '').trim();
  if (/^(?:pause|pause (?:the )?(?:music|song|video|playback|it)|(?:music|song) pause|සින්දුව නවත්වන්න|music නවත්වන්න|pause කරන්න)$/.test(t)) return 'pause';
  if (/^(?:play|resume|continue|play music|resume (?:the )?(?:music|song|video|playback)|play (?:the )?(?:music|song)|සින්දුව දාන්න|play කරන්න)$/.test(t)) return 'play';
  if (/^(?:next|next (?:song|track|one|video)|skip|skip (?:this )?(?:song|track)|ඊළඟ සින්දුව|ඊළඟ එක|next කරන්න)$/.test(t)) return 'next';
  if (/^(?:previous|previous (?:song|track|one)|go back a song|last song|කලින් සින්දුව|කලින් එක)$/.test(t)) return 'previous';
  if (/^(?:stop (?:the )?(?:music|song|playback))$/.test(t)) return 'stop';
  if (/^(?:volume up|turn (?:it )?up|louder|increase (?:the )?volume|volume වැඩි කරන්න|හඬ වැඩි කරන්න|ශබ්දය වැඩි කරන්න)$/.test(t)) return 'volume_up';
  if (/^(?:volume down|turn (?:it )?down|quieter|lower (?:the )?volume|decrease (?:the )?volume|volume අඩු කරන්න|හඬ අඩු කරන්න|ශබ්දය අඩු කරන්න)$/.test(t)) return 'volume_down';
  if (/^(?:mute|mute (?:the )?(?:phone|sound|volume)|silent|මියුට් කරන්න)$/.test(t)) return 'mute';
  if (/^(?:unmute|unmute (?:the )?(?:phone|sound|volume))$/.test(t)) return 'unmute';
  return null;
}
