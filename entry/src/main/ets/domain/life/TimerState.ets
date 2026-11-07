import { EyeCycle, PomodoroSession, AlertSettings } from '../../models/LifeModels';
import { FocusSettings } from '../../models/Workspace';
import { DEFAULT_FOCUS_MINUTES, DEFAULT_FOCUS_VOLUME, MAX_FOCUS_MINUTES, EYE_FOCUS_MS, EYE_REST_MS, ALERT_TONE_IDS } from '../../config/constants';

export function focusSettings(value?: FocusSettings): FocusSettings {
  return { minutes: value && Number.isInteger(value.minutes) && value.minutes >= 1 && value.minutes <= MAX_FOCUS_MINUTES ? value.minutes : DEFAULT_FOCUS_MINUTES,
    sound: value ? value.sound === true : true, volume: value && Number.isFinite(value.volume) ? Math.max(0, Math.min(100, Math.round(value.volume))) : DEFAULT_FOCUS_VOLUME };
}
export function alertSettings(value?: AlertSettings): AlertSettings {
  return { notifications: value?.notifications === true, sound: value?.sound === true,
    tone: value && ALERT_TONE_IDS.includes(value.tone) ? value.tone : 'soft', volume: value && Number.isFinite(value.volume) ? Math.max(0, Math.min(100, Math.round(value.volume))) : 30 };
}
export function pomodoroElapsed(session: PomodoroSession, now: number): number {
  return Math.min(session.durationMs, session.elapsedMs + (session.startedAt === undefined ? 0 : Math.max(0, now - session.startedAt)));
}
export function idleEyeCycle(): EyeCycle { return { status: 'idle', phase: 'focus', remainingMs: EYE_FOCUS_MS, completedRounds: 0 }; }
export function startEyeCycle(now: number): EyeCycle { return { status: 'running', phase: 'focus', deadline: now + EYE_FOCUS_MS, remainingMs: EYE_FOCUS_MS, completedRounds: 0 }; }
export function advanceEyeCycle(cycle: EyeCycle, now: number): void {
  if (cycle.status !== 'running' || cycle.deadline === undefined || now < cycle.deadline) return;
  let transitions = 0;
  while (cycle.deadline !== undefined && now >= cycle.deadline && transitions < 1000) {
    const at = cycle.deadline;
    if (cycle.phase === 'focus') { cycle.phase = 'rest'; cycle.completedRounds++; cycle.deadline += EYE_REST_MS; }
    else { cycle.phase = 'focus'; cycle.deadline += EYE_FOCUS_MS; }
    cycle.transition = { phase: cycle.phase, at }; transitions++;
  }
  if (transitions === 1000 && cycle.deadline !== undefined && now >= cycle.deadline) cycle.deadline = now + (cycle.phase === 'focus' ? EYE_FOCUS_MS : EYE_REST_MS);
  cycle.remainingMs = cycle.phase === 'focus' ? EYE_FOCUS_MS : EYE_REST_MS;
}
export function eyeRemaining(cycle: EyeCycle, now: number): number {
  if (cycle.status === 'idle') return EYE_FOCUS_MS;
  return cycle.status === 'paused' ? cycle.remainingMs : Math.max(0, (cycle.deadline ?? now) - now);
}
export function clockText(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
