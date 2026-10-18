// src/native/Nimah.ts — typed wrapper around the Kotlin NimahModule.
import {
  EmitterSubscription, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform, Permission,
} from 'react-native';
import { RawContact } from '../services/contacts';
import { ScreenState } from '../types';

interface NativeAPI {
  startListening(locale: string): Promise<boolean>;
  stopListening(): Promise<boolean>;
  cancelListening(): Promise<boolean>;
  speak(text: string, locale: string, rate: number): Promise<boolean>;
  stopSpeaking(): Promise<boolean>;
  findContacts(name: string): Promise<RawContact[]>;
  openWhatsApp(phone: string, message: string, countryCode: string, autoSend: boolean): Promise<boolean>;
  isAutoSendEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<boolean>;
  enableAccessibilityService(): Promise<boolean>;
  canWriteSecureSettings(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  sendSms(phone: string, message: string, countryCode: string, autoSend: boolean): Promise<boolean>;
  callNumber(phone: string, countryCode: string): Promise<boolean>;
  setAlarm(hour: number, minute: number, label: string): Promise<boolean>;
  setTimer(seconds: number, label: string): Promise<boolean>;
  openApp(name: string): Promise<boolean>;
  navigate(destination: string): Promise<boolean>;
  playMusic(query: string): Promise<boolean>;
  setFlashlight(on: boolean): Promise<boolean>;
  startBackgroundService(): Promise<boolean>;
  stopBackgroundService(): Promise<boolean>;

  // ---- full phone control (needs the Nimah accessibility service) ----
  screenRead(): Promise<ScreenState>;
  screenshot(): Promise<string | null>;
  uiClick(id: number, long: boolean): Promise<boolean>;
  uiType(id: number, text: string, submit: boolean): Promise<boolean>;
  uiScroll(direction: string, id: number): Promise<boolean>;
  uiGesture(x1: number, y1: number, x2: number, y2: number, durationMs: number): Promise<boolean>;
  uiGlobal(name: string): Promise<boolean>;
  waitForIdle(quietMs: number, timeoutMs: number): Promise<boolean>;
  consumeStopRequest(): Promise<boolean>;

  // ---- system helpers ----
  setVolume(percent: number, stream: string): Promise<boolean>;
  deviceInfo(): Promise<DeviceInfo>;
  openUrl(url: string): Promise<boolean>;
  openSettings(page: string): Promise<boolean>;

  // ---- notifications ----
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
  getNotifications(): Promise<NotificationItem[]>;
  dismissNotification(key: string): Promise<boolean>;
}

export interface DeviceInfo { time: string; date: string; battery: number; charging: boolean; musicVolume: number }
export interface NotificationItem { key: string; app: string; title: string; text: string }

const native = NativeModules.NimahModule as NativeAPI | undefined;
if (!native) {
  throw new Error('NimahModule not found. Register NimahPackage in MainApplication and rebuild.');
}
const emitter = new NativeEventEmitter(NativeModules.NimahModule);

export interface NimahEvents {
  NimahSpeechPartial: { text: string };
  NimahSpeechResult: { text: string };
  NimahSpeechError: { code: number; message: string };
  NimahSpeechRms: { level: number };
}

type NimahApi = NativeAPI & {
  on<K extends keyof NimahEvents>(event: K, cb: (payload: NimahEvents[K]) => void): EmitterSubscription;
};

function on<K extends keyof NimahEvents>(event: K, cb: (payload: NimahEvents[K]) => void): EmitterSubscription {
  return emitter.addListener(event, cb as (p: unknown) => void);
}

// NOTE: do NOT spread the native module ({ ...native }). On the new architecture its methods are not
// enumerable, so a spread copy would be empty and every call would be "undefined is not a function".
// A Proxy forwards each call to the real module instead.
export const Nimah = new Proxy({} as NimahApi, {
  get(_t, prop: string) {
    if (prop === 'on') return on;
    const v = (native as any)[prop];
    return typeof v === 'function' ? v.bind(native) : v;
  },
});

/** Asks for everything Nimah can use. Only the microphone is mandatory. */
export async function requestPermissions(): Promise<{ mic: boolean; contacts: boolean }> {
  const P = PermissionsAndroid.PERMISSIONS;
  const list: Permission[] = [P.RECORD_AUDIO, P.READ_CONTACTS, P.CALL_PHONE, P.SEND_SMS];
  if (Platform.OS === 'android' && Platform.Version >= 33) list.push(P.POST_NOTIFICATIONS);
  const res = await PermissionsAndroid.requestMultiple(list);
  return {
    mic: res[P.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED,
    contacts: res[P.READ_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED,
  };
}

/**
 * Makes sure Nimah's accessibility service is ON.
 *  'on'     already enabled
 *  'auto'   switched on by itself (WRITE_SECURE_SETTINGS was granted)
 *  'manual' could not — Android's Accessibility screen was opened for one tap
 */
export async function ensureAccessibility(openSettings = true): Promise<'on' | 'auto' | 'manual'> {
  if (await Nimah.isAutoSendEnabled().catch(() => false)) return 'on';
  if (await Nimah.enableAccessibilityService().catch(() => false)) return 'auto';
  if (openSettings) await Nimah.openAccessibilitySettings().catch(() => {});
  return 'manual';
}
