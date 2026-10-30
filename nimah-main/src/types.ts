export type ActionName =
  | 'send_whatsapp' | 'send_sms' | 'call_contact' | 'set_alarm' | 'set_timer'
  | 'open_app' | 'navigate' | 'play_music' | 'flashlight'
  | 'enable_accessibility' | 'phone_task' | 'answer' | 'unknown';

export const KNOWN_ACTIONS: ActionName[] = [
  'send_whatsapp', 'send_sms', 'call_contact', 'set_alarm', 'set_timer',
  'open_app', 'navigate', 'play_music', 'flashlight', 'enable_accessibility', 'phone_task', 'answer', 'unknown',
];

/** Structured result Gemini returns for every voice command. */
export interface Intent {
  action: ActionName;
  app: string;
  recipient: string | null;
  message: string | null;
  target: string | null;          // app name / destination / song
  hour: number | null;
  minute: number | null;
  duration_seconds: number | null;
  state: 'on' | 'off' | null;
  spoken_reply: string;
}

export type Status = 'idle' | 'listening' | 'processing' | 'speaking';
export type Locale = 'en-US' | 'si-LK';

export interface Settings {
  locale: Locale;
  countryCode: string;
  backgroundService: boolean;
  theme: 'system' | 'dark' | 'light';
  speakReplies: boolean;
  speechRate: number;
  /** 0.5–1.5. Lower = deeper voice. */
  pitch: number;
  /** Exact TTS voice name chosen by the user; '' = automatic (prefers a male-sounding voice). */
  voiceName: string;
  autoSend: boolean;
  /** Let the AI operate any app (tap/type/scroll) to finish a spoken task. */
  fullControl: boolean;
  /** Ask "are you sure?" before sending money, deleting, buying, etc. */
  confirmRisky: boolean;
  /** Mic opens by itself when the app opens and keeps listening (no button). */
  autoListen: boolean;
  /** After each job, Nimah asks what to do next (and greets you when the app opens). */
  askBack: boolean;
  maxSteps: number;
  /** Optional 8:00 notification that invites you to hear your briefing. */
  dailyBriefing: boolean;
  /** Only react to sentences that start with "Nimah" (follow-ups within a short window need no wake word). */
  wakeWord: boolean;
  /** Retry recognition in the other language (Sinhala/English) when nothing was understood. */
  autoLanguage: boolean;
  /** Prefer Android's on-device speech pack (offline) when it is installed. */
  preferOffline: boolean;
  /** Split "do A and then B" into ordered steps. */
  multiStep: boolean;
  /** Owner-voice filter (soft factor). Sensitive actions additionally need the phone's own unlock. */
  voiceLock: boolean;
  /** 1 (lenient) .. 5 (strict). */
  voiceSensitivity: number;
  /** Say who is calling and offer to answer / reject by voice. */
  announceCalls: boolean;
  /** Read new messages aloud and reply by voice (never reads the text on a locked phone). */
  readMessages: boolean;
  /** Numbers for the "help" flow, comma separated. The first one is also called. */
  emergencyContacts: string;
}

export interface Choice<T = any> { label: string; value: T }
export interface ChoiceRequest { prompt: string; options: Choice[] }

export interface HistoryItem {
  id: string;
  ts: number;
  transcript: string;
  action: ActionName;
  summary: string;
  ok: boolean;
}

// ---- Agent (full phone control) -------------------------------------------------
export type AgentActionName =
  | 'tap' | 'long_press' | 'type' | 'scroll' | 'swipe_to'
  | 'back' | 'home' | 'recents' | 'notifications' | 'quick_settings'
  | 'lock_screen' | 'screenshot' | 'power_menu'
  | 'open_app' | 'open_url' | 'open_settings' | 'set_volume'
  | 'read_notifications' | 'dismiss_notification'
  | 'tap_text' | 'tap_xy' | 'swipe_xy' | 'read_ocr' | 'set_hardware'
  | 'wait' | 'ask_user' | 'confirm' | 'say' | 'done' | 'fail';

export const AGENT_ACTIONS: AgentActionName[] = [
  'tap', 'long_press', 'type', 'scroll', 'swipe_to',
  'back', 'home', 'recents', 'notifications', 'quick_settings',
  'lock_screen', 'screenshot', 'power_menu',
  'open_app', 'open_url', 'open_settings', 'set_volume',
  'read_notifications', 'dismiss_notification',
  'tap_text', 'tap_xy', 'swipe_xy', 'read_ocr', 'set_hardware',
  'wait', 'ask_user', 'confirm', 'say', 'done', 'fail',
];

/** One decision from Gemini while it is driving the phone. */
export interface AgentStep {
  thought: string;
  action: AgentActionName;
  id: number | null;            // screen element number
  text: string | null;          // text to type / app name / url / settings page / question
  direction: 'up' | 'down' | 'left' | 'right' | null;
  level: number | null;         // volume 0-100, or wait seconds
  submit: boolean | null;       // press Enter after typing
  spoken_reply: string;         // short sentence spoken to the user
}

export interface ScreenState {
  package: string;
  text: string;
  count: number;
  width: number;
  height: number;
}
