export const EYE_FOCUS_MS = 30 * 60_000;
export const EYE_REST_MS = 5 * 60_000;

export type EyeRestPhase = "focus" | "rest";
export type EyeRestCycleState = {
  status: "idle" | "running" | "paused";
  phase: EyeRestPhase;
  deadline: number | null;
  pausedRemainingMs: number;
  completedFocusRounds: number;
  lastTransition: { phase: EyeRestPhase; at: number } | null;
};

export function createEyeRestCycle(): EyeRestCycleState {
  return { status: "idle", phase: "focus", deadline: null, pausedRemainingMs: EYE_FOCUS_MS, completedFocusRounds: 0, lastTransition: null };
}

export function startEyeRestCycle(now: number): EyeRestCycleState {
  return { status: "running", phase: "focus", deadline: now + EYE_FOCUS_MS, pausedRemainingMs: EYE_FOCUS_MS, completedFocusRounds: 0, lastTransition: null };
}

export function pauseEyeRestCycle(state: EyeRestCycleState, now: number): EyeRestCycleState {
  if (state.status !== "running" || state.deadline === null) return state;
  return { ...state, status: "paused", deadline: null, pausedRemainingMs: Math.max(0, state.deadline - now) };
}

export function resumeEyeRestCycle(state: EyeRestCycleState, now: number): EyeRestCycleState {
  if (state.status !== "paused") return state;
  return { ...state, status: "running", deadline: now + Math.max(0, state.pausedRemainingMs) };
}

export function advanceEyeRestCycle(state: EyeRestCycleState, now: number): EyeRestCycleState {
  if (state.status !== "running" || state.deadline === null || now < state.deadline) return state;
  let phase = state.phase;
  let deadline = state.deadline;
  let completedFocusRounds = state.completedFocusRounds;
  let lastTransition = state.lastTransition;
  let transitions = 0;
  // Catch up after browser throttling or sleep, but never allow a stale page to spin forever.
  while (now >= deadline && transitions < 1000) {
    const at = deadline;
    if (phase === "focus") {
      phase = "rest";
      completedFocusRounds += 1;
      deadline += EYE_REST_MS;
    } else {
      phase = "focus";
      deadline += EYE_FOCUS_MS;
    }
    lastTransition = { phase, at };
    transitions += 1;
  }
  if (transitions === 1000 && now >= deadline) deadline = now + (phase === "focus" ? EYE_FOCUS_MS : EYE_REST_MS);
  return { ...state, phase, deadline, pausedRemainingMs: phase === "focus" ? EYE_FOCUS_MS : EYE_REST_MS, completedFocusRounds, lastTransition };
}

export function eyeRestRemainingMs(state: EyeRestCycleState, now: number) {
  if (state.status === "idle") return EYE_FOCUS_MS;
  if (state.status === "paused") return state.pausedRemainingMs;
  return Math.max(0, (state.deadline ?? now) - now);
}

export function eyeRestPhaseDuration(phase: EyeRestPhase) {
  return phase === "focus" ? EYE_FOCUS_MS : EYE_REST_MS;
}
