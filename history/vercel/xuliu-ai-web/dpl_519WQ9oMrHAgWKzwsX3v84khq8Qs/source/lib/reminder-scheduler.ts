/** Page-session reminders. Runtime clocks never replace the user's saved settings. */
export type ScheduledReminder = {
  id: string;
  title: string;
  type: "exercise" | "break" | "sleep" | "custom";
  times: string[];
  intervalMinutes?: number;
  enabled: boolean;
  lastFired?: string;
  snoozedUntil?: number;
};

type Clock = { signature: string; nextAt: number; lastFixed?: string; lastSnooze?: number };
export type DueReminder = { id: string; reason: "interval" | "time" | "snooze"; firedKey?: string };

function intervalMs(reminder: ScheduledReminder) {
  const minutes = Number(reminder.intervalMinutes);
  return (Number.isFinite(minutes) && minutes >= 5 ? Math.min(1440, Math.round(minutes)) : 20) * 60_000;
}

function localClock(now: number) {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { time, key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${time}` };
}

export class ReminderScheduler {
  private clocks = new Map<string, Clock>();
  private pending = new Map<string, DueReminder>();

  reset() {
    this.clocks.clear();
    this.pending.clear();
  }

  dismiss(id: string, reminders: ScheduledReminder[], now: number) {
    this.pending.delete(id);
    const reminder = reminders.find((item) => item.id === id);
    const clock = this.clocks.get(id);
    if (reminder && clock) clock.nextAt = now + intervalMs(reminder);
  }

  /** Poll using wall-clock deadlines, so a delayed browser tick does not lose elapsed time. */
  check(reminders: ScheduledReminder[], now: number) {
    const enabled = new Set(reminders.filter((item) => item.enabled).map((item) => item.id));
    for (const id of this.clocks.keys()) {
      if (!enabled.has(id)) { this.clocks.delete(id); this.pending.delete(id); }
    }
    const current = localClock(now);
    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      const interval = intervalMs(reminder);
      const signature = JSON.stringify([reminder.type, reminder.times, interval]);
      let clock = this.clocks.get(reminder.id);
      if (!clock || clock.signature !== signature) {
        clock = { signature, nextAt: now + interval };
        this.clocks.set(reminder.id, clock);
        this.pending.delete(reminder.id);
      }

      if (reminder.snoozedUntil) {
        if (reminder.snoozedUntil > now) {
          this.pending.delete(reminder.id);
          clock.nextAt = reminder.snoozedUntil + interval;
          continue;
        }
        if (clock.lastSnooze !== reminder.snoozedUntil) {
          clock.lastSnooze = reminder.snoozedUntil;
          clock.nextAt = now + interval;
          this.pending.set(reminder.id, { id: reminder.id, reason: "snooze", firedKey: current.key });
          continue;
        }
      }

      const atFixedTime = reminder.times.includes(current.time)
        && reminder.lastFired !== current.key && clock.lastFixed !== current.key;
      const atInterval = reminder.type === "break" && now >= clock.nextAt;
      if (atFixedTime || atInterval) {
        if (atFixedTime) clock.lastFixed = current.key;
        // One queued popup per project, including after a long sleep or a busy dialog.
        if (!this.pending.has(reminder.id)) {
          this.pending.set(reminder.id, {
            id: reminder.id,
            reason: atFixedTime ? "time" : "interval",
            firedKey: atFixedTime ? current.key : undefined,
          });
        }
        if (atInterval) clock.nextAt = now + interval;
      }
    }
  }

  /** Only called when the page is visible and no other popup/dialog is being shown. */
  takeNext(reminders: ScheduledReminder[], now: number): DueReminder | undefined {
    for (const [id, due] of this.pending) {
      this.pending.delete(id);
      const reminder = reminders.find((item) => item.id === id && item.enabled);
      if (!reminder || (reminder.snoozedUntil && reminder.snoozedUntil > now)) continue;
      const clock = this.clocks.get(id);
      if (clock) clock.nextAt = now + intervalMs(reminder);
      return due;
    }
    return undefined;
  }
}
