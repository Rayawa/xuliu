export type PomodoroSession = { id: string; duration: number; elapsed: number; startedAt: number | null };

export const pomodoroStorageKey = (scope: string) => `xuliu:pomodoro-session:v1:${scope}`;

export function pomodoroElapsed(session: PomodoroSession, now: number) {
  return Math.min(session.duration, session.elapsed + (session.startedAt === null ? 0 : Math.max(0, now - session.startedAt) / 1000));
}

export function restorePomodoroSession(raw: unknown): PomodoroSession | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["id", "duration", "elapsed", "startedAt"].includes(key))
    || typeof value.id !== "string" || !value.id || value.id.length > 120
    || typeof value.duration !== "number" || !Number.isInteger(value.duration) || value.duration < 60 || value.duration > 10800
    || typeof value.elapsed !== "number" || !Number.isFinite(value.elapsed) || value.elapsed < 0 || value.elapsed > value.duration
    || value.startedAt !== null && (typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt) || value.startedAt <= 0)) return null;
  return { id: value.id, duration: value.duration, elapsed: value.elapsed, startedAt: value.startedAt as number | null };
}
