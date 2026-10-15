import { isValidLocalDate, isValidLocalTime } from "./finance.ts";
import { taskStatusOf, type TaskScheduleLike } from "./task-progress.ts";
import { addDays } from "./timetable.ts";

type DeadlineTask = TaskScheduleLike & { id: string; title: string };
type DeadlineNode = { id: string; title: string; date: string; time?: string; done: boolean; courseId?: string; automationKey?: string };
export type UpcomingDeadline = { id: string; kind: "task" | "milestone"; entity: "task" | "event"; title: string; date: string; time?: string };

export function upcomingDeadlines(tasks: DeadlineTask[], nodes: DeadlineNode[], today: string, days = 7): UpcomingDeadline[] {
  if (!isValidLocalDate(today)) return [];
  const end = addDays(today, days);
  const inRange = (date: string | undefined): date is string => Boolean(date && isValidLocalDate(date) && date >= today && date <= end);
  const timeOf = (time: string | undefined) => time && isValidLocalTime(time) ? time : undefined;
  return [
    ...tasks.flatMap((task): UpcomingDeadline[] => taskStatusOf(task) !== "已完成" && inRange(task.due)
      ? [{ id: task.id, kind: "task", entity: "task", title: task.title, date: task.due, time: timeOf(task.dueTime) }] : []),
    ...nodes.flatMap((node): UpcomingDeadline[] => !node.done && !node.automationKey && inRange(node.date)
      ? [{ id: node.id, kind: "milestone", entity: node.courseId ? "task" : "event", title: node.title, date: node.date, time: timeOf(node.time) }] : []),
  ].sort((left, right) => left.date.localeCompare(right.date) || (left.time || "23:59").localeCompare(right.time || "23:59"));
}
