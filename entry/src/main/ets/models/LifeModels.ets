import { FocusSettings } from './Workspace';

export interface PomodoroSession { id: string; durationMs: number; elapsedMs: number; startedAt?: number; }
export interface EyeTransition { phase: string; at: number; }
export interface EyeCycle { status: string; phase: string; deadline?: number; remainingMs: number; completedRounds: number; transition?: EyeTransition; }
export interface AlertSettings { sound: boolean; tone: string; volume: number; notifications: boolean; }
export interface LifePopup { id: string; kind: string; title: string; body: string; reminderId?: string; firedKey?: string; }
export interface LifeView {
  notificationPermission: string; scope: string; focusVisible: boolean; alertsLoading: boolean; enabled: boolean; settings: FocusSettings; pomodoro?: PomodoroSession; remainingSeconds: number; finished: boolean; focusMessage: string;
  eye: EyeCycle; eyeRemainingSeconds: number; alerts: AlertSettings; message: string; popup?: LifePopup;
}
export interface ReminderClock { signature: string; nextAt: number; lastFixed?: string; lastSnooze?: number; }
export interface DueReminder { id: string; reason: string; firedKey?: string; }
export interface LegacyFocusSession { id: string; elapsedMs: number; startedAt: number; running: boolean; durationMinutes: number; }
