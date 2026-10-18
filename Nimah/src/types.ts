export type ActionName =
  | 'send_whatsapp' | 'send_sms' | 'call_contact' | 'set_alarm' | 'set_timer'
  | 'open_app' | 'navigate' | 'play_music' | 'flashlight'
  | 'phone_task' | 'answer' | 'unknown';

export const KNOWN_ACTIONS: ActionName[] = [
  'send_whatsapp', 'send_sms', 'call_contact', 'set_alarm', 'set_timer',
  'open_app', 'navigate', 'play_music', 'flashlight', 'phone_task', 'answer', 'unknown',
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
  autoSend: boolean;
  /** Let the AI operate any app (tap/type/scroll) to finish a spoken task. */
  fullControl: boolean;
  /** Ask "are you sure?" before sending money, deleting, buying, etc. */
  confirmRisky: boolean;
  maxSteps: number;
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
  | 'wait' | 'ask_user' | 'confirm' | 'say' | 'done' | 'fail';

export const AGENT_ACTIONS: AgentActionName[] = [
  'tap', 'long_press', 'type', 'scroll', 'swipe_to',
  'back', 'home', 'recents', 'notifications', 'quick_settings',
  'lock_screen', 'screenshot', 'power_menu',
  'open_app', 'open_url', 'open_settings', 'set_volume',
  'read_notifications', 'dismiss_notification',
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
