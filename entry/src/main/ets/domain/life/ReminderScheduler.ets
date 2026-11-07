import { WorkspaceEntry } from '../../models/Workspace';
import { ReminderClock, DueReminder } from '../../models/LifeModels';
import { localDate, localTime } from '../workspace/WorkspaceDomain';

function intervalMs(reminder: WorkspaceEntry): number {
  const minutes = Number(reminder.intervalMinutes); return (Number.isFinite(minutes) && minutes >= 5 ? Math.min(1440, Math.round(minutes)) : 20) * 60000;
}
export class ReminderScheduler {
  private clocks: Map<string, ReminderClock> = new Map();
  private pending: Map<string, DueReminder> = new Map();
  reset(): void { this.clocks.clear(); this.pending.clear(); }
  dismiss(id: string, reminders: WorkspaceEntry[], now: number): void {
    this.pending.delete(id); const reminder = reminders.find((item) => item.id === id); const clock = this.clocks.get(id);
    if (reminder && clock) clock.nextAt = now + intervalMs(reminder);
  }
  check(reminders: WorkspaceEntry[], now: number): void {
    const enabled = new Set(reminders.filter((item) => item.enabled).map((item) => item.id));
    for (const id of this.clocks.keys()) if (!enabled.has(id)) { this.clocks.delete(id); this.pending.delete(id); }
    const date = new Date(now); const time = localTime(date); const key = `${localDate(date)}-${time}`;
    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      const interval = intervalMs(reminder); const signature = JSON.stringify([reminder.type, reminder.times ?? [], interval]);
      let clock = this.clocks.get(reminder.id);
      if (!clock || clock.signature !== signature) { clock = { signature, nextAt: now + interval }; this.clocks.set(reminder.id, clock); this.pending.delete(reminder.id); }
      if (reminder.snoozedUntil) {
        if (reminder.snoozedUntil > now) { this.pending.delete(reminder.id); clock.nextAt = reminder.snoozedUntil + interval; continue; }
        if (clock.lastSnooze !== reminder.snoozedUntil) {
          clock.lastSnooze = reminder.snoozedUntil; clock.nextAt = now + interval;
          this.pending.set(reminder.id, { id: reminder.id, reason: 'snooze', firedKey: key }); continue;
        }
      }
      const fixed = (reminder.times ?? []).includes(time) && reminder.lastFired !== key && reminder.lastFired !== `${localDate(date)}T${time}` && clock.lastFixed !== key;
      const intervalDue = reminder.type === 'break' && now >= clock.nextAt;
      if (fixed || intervalDue) {
        if (fixed) clock.lastFixed = key;
        if (!this.pending.has(reminder.id)) this.pending.set(reminder.id, { id: reminder.id, reason: fixed ? 'time' : 'interval', firedKey: fixed ? key : undefined });
        if (intervalDue) clock.nextAt = now + interval;
      }
    }
  }
  take(reminders: WorkspaceEntry[], now: number): DueReminder | undefined {
    for (const entry of this.pending.entries()) {
      const id = entry[0]; const due = entry[1];
      this.pending.delete(id); const reminder = reminders.find((item) => item.id === id && item.enabled);
      if (!reminder || (reminder.snoozedUntil ?? 0) > now) continue;
      const clock = this.clocks.get(id); if (clock) clock.nextAt = now + intervalMs(reminder);
      return due;
    }
    return undefined;
  }
}
