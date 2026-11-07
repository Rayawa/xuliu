import { WorkspaceEntry } from '../../models/Workspace';
import { addDays, validDate, defaultPlannedDate, planWorkForDate, workCompleted } from './WorkspaceDomain';

export function advanceWork(item: WorkspaceEntry, day: string, nextDate: string): void {
  if (workCompleted(item)) throw new Error('任务已完成，请先重新打开');
  if (!validDate(day) || !validDate(nextDate) || nextDate <= day) throw new Error('请选择明天或之后的继续日期');
  const dates = item.progressedDates ?? [];
  if (!dates.includes(day)) {
    if (dates.length >= 36600) throw new Error('推进记录已达到上限，原记录保留');
    item.progressedDates = dates.concat([day]);
  }
  planWorkForDate(item, nextDate);
}
export function postponeWork(item: WorkspaceEntry, collection: string, day: string): void {
  if (workCompleted(item)) return;
  if (collection === 'tasks') {
    if (item.plannedDate === day && item.due !== day) { item.plannedDate = addDays(day, 1); item.today = false; return; }
    const fallback = item.mode === 'multi' && item.startDate && item.startDate > day ? item.startDate : day;
    const due = addDays(item.due && validDate(item.due) ? item.due : fallback, 1);
    item.due = due; if (item.plannedDate === day) item.plannedDate = due;
    item.today = item.mode !== 'multi' && (due === day || item.plannedDate === day);
  } else if (item.alsoTask) {
    const planned = defaultPlannedDate(item); planWorkForDate(item, addDays(planned && planned > day ? planned : day, 1));
  } else if (item.courseId && item.plannedDate === day && item.date !== day) item.plannedDate = addDays(day, 1);
  else { const date = addDays(item.date || day, 1); item.date = date; if (item.plannedDate === day) item.plannedDate = date; }
}
