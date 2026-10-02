export const reminderTones = { soft: "柔和铃声", clear: "清脆提示", double: "双音提示" } as const;
export type ReminderTone = keyof typeof reminderTones;
export type AlertSettings = { notifications: boolean; sound: boolean; tone: ReminderTone; volume: number };
export const defaultAlertSettings: AlertSettings = { notifications: false, sound: false, tone: "soft", volume: 30 };

export function normalizeAlertSettings(value: unknown): AlertSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    notifications: raw.notifications === true,
    sound: raw.sound === true,
    tone: typeof raw.tone === "string" && Object.hasOwn(reminderTones, raw.tone) ? raw.tone as ReminderTone : "soft",
    volume: typeof raw.volume === "number" && Number.isFinite(raw.volume) ? Math.min(100, Math.max(0, Math.round(raw.volume))) : 30,
  };
}

export function alertSettingsKey(owner: string) { return `xuliu:reminder-alerts:v1:${owner}`; }
export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && window.isSecureContext && "Notification" in window
    && "serviceWorker" in navigator ? Notification.permission : "unsupported";
}

async function bounded<T>(promise: Promise<T>, milliseconds = 8000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("浏览器响应超时，请稍后重试")), milliseconds);
    })]);
  } finally { clearTimeout(timeout); }
}

let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
async function notificationRegistration() {
  if (!registrationPromise) {
    registrationPromise = bounded(navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => registration.active ? registration : await navigator.serviceWorker.ready))
      .catch((error: unknown) => { registrationPromise = undefined; throw error; });
  }
  return registrationPromise;
}

export async function showSystemReminder(owner: string, id: string, title: string, body: string, stillAllowed = () => true) {
  if (notificationPermission() !== "granted" || !stillAllowed()) return false;
  const registration = await notificationRegistration();
  if (!stillAllowed() || notificationPermission() !== "granted") return false;
  const options: NotificationOptions & { renotify: boolean } = {
    body, tag: `xuliu:${owner}:${id}`, renotify: true, silent: true,
    data: { source: "xuliu-reminder" },
  };
  await bounded(registration.showNotification(title, options));
  return true;
}

type ToneNote = { frequency: number; start: number; duration: number; waveform: OscillatorType };
export function toneNotes(tone: ReminderTone): ToneNote[] {
  if (tone === "clear") return [{ frequency: 880, start: 0, duration: 0.28, waveform: "sine" }];
  if (tone === "double") return [
    { frequency: 659.25, start: 0, duration: 0.3, waveform: "sine" },
    { frequency: 783.99, start: 0.32, duration: 0.4, waveform: "sine" },
  ];
  return [{ frequency: 523.25, start: 0, duration: 0.8, waveform: "sine" }];
}

/** Local synthesized tones: no downloads, microphone permission or system-volume changes. */
export class ReminderSoundPlayer {
  private context: AudioContext | undefined;
  private activeNodes = new Set<OscillatorNode>();

  async unlock() {
    if (typeof window === "undefined" || !("AudioContext" in window)) return false;
    if (!this.context || this.context.state === "closed") this.context = new AudioContext();
    if (this.context.state !== "running") await bounded(this.context.resume(), 2500);
    return this.context.state === "running";
  }

  play(tone: ReminderTone, volume: number) {
    const context = this.context;
    const level = normalizeAlertSettings({ volume }).volume / 100;
    if (!context || context.state !== "running" || level === 0) return false;
    this.stop();
    for (const note of toneNotes(tone)) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime + note.start;
      oscillator.type = note.waveform;
      oscillator.frequency.setValueAtTime(note.frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.16 * level, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      this.activeNodes.add(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.activeNodes.delete(oscillator); };
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.02);
    }
    return true;
  }

  stop() {
    for (const oscillator of this.activeNodes) { try { oscillator.stop(); } catch { /* Already ended. */ } }
    this.activeNodes.clear();
  }

  dispose() {
    this.stop();
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }
}
