import { EntryTarget, Workspace, WorkspaceEntry } from '../../models/Workspace';
import { CALENDAR_FIRST_MONTH, CALENDAR_LAST_MONTH } from '../../config/constants';
import { reviewSourceKeys } from './ReviewDomain';
import { localDate } from './WorkspaceDomain';

export interface CalendarRecord {
  target: EntryTarget;
  item: WorkspaceEntry;
  time: string;
  label: string;
}

export interface CalendarCell {
  key: number;
  date: string;
}

export function validCalendarMonth(value: string): boolean {
  return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftCalendarMonth(value: string, offset: number): string {
  const index = Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1 + offset;
  if (index < 12) return CALENDAR_FIRST_MONTH;
  if (index > 9999 * 12 + 11) return CALENDAR_LAST_MONTH;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export function monthCells(month: string, mondayFirst: boolean): CalendarCell[] {
  const first = new Date(`${month}-01T12:00:00`);
  const leading = (first.getDay() + (mondayFirst ? 6 : 0)) % 7;
  const end = new Date(first.getTime());
  end.setMonth(end.getMonth() + 1, 0);
  const count = Math.ceil((leading + end.getDate()) / 7) * 7;
  first.setDate(1 - leading);
  const result: CalendarCell[] = [];
  for (let index = 0; index < count; index++) {
    const year = first.getFullYear();
    result.push({ key: index, date: year >= 1 && year <= 9999 ? localDate(first) : '' });
    first.setDate(first.getDate() + 1);
  }
  return result;
}

export function calendarIndex(data: Workspace): Record<string, CalendarRecord[]> {
  const result: Record<string, CalendarRecord[]> = {};
  const excluded = reviewSourceKeys(data);
  const append = (date: string, item: WorkspaceEntry, collection: string, time: string, label: string): void => {
    if (!result[date]) result[date] = [];
    result[date].push({ target: { collection, id: item.id }, item, time, label });
  };
  for (const item of data.milestones) {
    if (item.date && !item.automationKey && !item.id.startsWith('stage:') &&
      item.showOnCalendar !== false && !excluded.has(`milestone:${item.id}`)) {
      append(item.date, item, 'milestones', item.time ?? '',
        item.courseId || item.assessmentType || item.eventDateKind === 'deadline' ? '截止' : '事项');
    }
  }
  for (const item of data.tasks) {
    const date = item.due || item.plannedDate;
    if (date && !item.automationKey && !item.id.startsWith('stage:') &&
      item.showOnCalendar !== false && !excluded.has(`task:${item.id}`)) {
      append(date, item, 'tasks', item.due ? item.dueTime ?? '' : '', item.due ? '截止' : '推进');
    }
  }
  return result;
}
