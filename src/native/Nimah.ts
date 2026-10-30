// src/native/Nimah.ts — typed wrapper around the Kotlin NimahModule.
import {
  EmitterSubscription, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform, Permission,
} from 'react-native';
import { RawContact } from '../services/contacts';
import { ScreenState } from '../types';
import type { VoiceInfo } from '../services/voice';
import type { OcrLine } from '../services/screenmatch';

interface NativeAPI {
  startListening(locale: string): Promise<boolean>;
  /** extraLocale: second language the recogniser may also hear ('' = none). voiceCheck: score the owner's voice in parallel. */
  startListeningEx(locale: string, preferOffline: boolean, voiceCheck: boolean, extraLocale: string): Promise<boolean>;
  stopListening(): Promise<boolean>;
  cancelListening(): Promise<boolean>;
  speak(text: string, locale: string, rate: number, pitch: number, voiceName: string): Promise<boolean>;
  getVoices(): Promise<VoiceInfo[]>;
  scheduleReminder(id: string, atMillis: number, text: string): Promise<boolean>;
  cancelReminder(id: string): Promise<boolean>;
  scheduleDailyBriefing(hour: number, minute: number): Promise<boolean>;
  cancelDailyBriefing(): Promise<boolean>;
  secureSet(name: string, value: string): Promise<boolean>;
  secureGet(name: string): Promise<string | null>;
  secureRemove(name: string): Promise<boolean>;
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

  ocrScreen(): Promise<OcrLine[]>;

  // ---- calls, media, camera, alarm, overlay, location, screen ----
  answerCall(): Promise<boolean>;
  endCall(): Promise<boolean>;
  setSpeaker(on: boolean): Promise<boolean>;
  setMute(on: boolean): Promise<boolean>;
  mediaKey(name: string): Promise<boolean>;
  showNumbers(): Promise<number>;
  hideNumbers(): Promise<boolean>;
  tapNumber(n: number, long: boolean): Promise<boolean>;
  alarmControl(action: string, minutes: number): Promise<boolean>;
  openCamera(mode: string): Promise<boolean>;
  getLocation(): Promise<{ lat: number; lng: number } | null>;
  wakeScreen(): Promise<boolean>;
  setToggle(kind: string, on: boolean): Promise<string>;
  replyNotification(key: string, text: string): Promise<boolean>;

  // ---- hardware (Wi-Fi / Bluetooth / brightness) ----
  setWifi(on: boolean): Promise<string>;
  setBluetooth(on: boolean): Promise<string>;
  getBrightness(): Promise<number>;
  setBrightness(percent: number): Promise<string>;
  openWriteSettings(): Promise<boolean>;

  // ---- voice lock (on-device voiceprint) + device unlock ----
  voiceIsEnrolled(): Promise<boolean>;
  voiceEnrollSample(seconds: number): Promise<{ voicedFrames: number; totalVoiced: number }>;
  voiceEnrollFinish(): Promise<boolean>;
  voiceEnrollReset(): Promise<boolean>;
  voiceDelete(): Promise<boolean>;
  voiceTest(seconds: number): Promise<{ score: number }>;
  /** 'ok' | 'failed' | 'cancelled' | 'unavailable' */
  authenticate(reason: string): Promise<string>;

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
  NimahSpeechResult: { text: string; alternatives?: string[]; confidences?: number[]; voiceScore?: number };
  NimahSpeechError: { code: number; message: string };
  NimahSpeechRms: { level: number };
  NimahServiceStopped: undefined;
  NimahCall: { state: string; number: string; name: string };
  NimahMessage: { key: string; app: string; pkg: string; sender: string; text: string; locked: boolean; canReply: boolean };
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
  if (Platform.OS === 'android' && Platform.Version >= 31) list.push(P.BLUETOOTH_CONNECT);
  list.push(P.ANSWER_PHONE_CALLS, P.READ_PHONE_STATE, P.READ_CALL_LOG, P.ACCESS_FINE_LOCATION);
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

/** Fingerprint / face / PIN. Resolves true only on success. Never throws. */
export async function requestDeviceAuth(reason: string): Promise<boolean> {
  try { return (await Nimah.authenticate(reason)) === 'ok'; } catch { return false; }
}
