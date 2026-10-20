export type TaskMode = "single" | "multi";
export type TaskProgressStatus = "未开始" | "进行中" | "已暂停" | "已完成";

export type TaskScheduleLike = {
  due?: string;
  dueTime?: string;
  plannedDate?: string;
  today?: boolean;
  done?: boolean;
  completedDate?: string;
  mode?: TaskMode;
  startDate?: string;
  status?: TaskProgressStatus;
  progress?: number;
  progressLogs?: { date: string; progress: number }[];
};

export const taskStatusOptions: TaskProgressStatus[] = ["未开始", "进行中", "已暂停", "已完成"];

export function planTaskForDate<T extends TaskScheduleLike>(task: T, targetDate: string): T {
  if (task.done || task.status === "已完成") return task;
  return { ...task, plannedDate: targetDate };
}

export function courseNodeVisibleToday(node: { date: string; courseId?: string; mode?: TaskMode; done: boolean; plannedDate?: string; completedDate?: string }, targetDate: string) {
  if (node.courseId && node.done) return node.completedDate === targetDate;
  return node.date === targetDate || Boolean(node.courseId && (node.plannedDate === targetDate || node.mode === "multi" && !node.done));
}

export function taskCompletionDate(task: TaskScheduleLike) {
  if (task.completedDate) return task.completedDate;
  return task.progressLogs?.findLast((entry) => entry.progress === 100)?.date;
}

export function withWorkCompletionDates<T extends TaskScheduleLike & { id: string }, M extends TaskScheduleLike & { id: string }, S extends { tasks: T[]; milestones: M[] }>(previous: S, next: S, date: string): S {
  const update = <I extends TaskScheduleLike & { id: string }>(before: I[], after: I[]) => {
    const originals = new Map(before.map((item) => [item.id, item]));
    return after.map((item) => {
      if (taskStatusOf(item) !== "已完成") {
        if (!item.completedDate) return item;
        const { completedDate: _completedDate, ...rest } = item;
        return rest as I;
      }
      const original = originals.get(item.id);
      if (!original || taskStatusOf(original) === "已完成") return item;
      return { ...item, completedDate: date };
    });
  };
  return { ...next, tasks: update(previous.tasks, next.tasks), milestones: update(previous.milestones, next.milestones) };
}

export function taskModeOf(task: TaskScheduleLike): TaskMode {
  return task.mode === "multi" ? "multi" : "single";
}

export function taskProgressOf(task: TaskScheduleLike) {
  if (task.done || task.status === "已完成") return 100;
  return Math.min(99, Math.max(0, Math.round(Number(task.progress) || 0)));
}

export function taskStatusOf(task: TaskScheduleLike): TaskProgressStatus {
  if (task.done || task.status === "已完成") return "已完成";
  if (task.status === "已暂停") return "已暂停";
  if (task.status === "进行中" || taskProgressOf(task) > 0) return "进行中";
  return "未开始";
}

export function taskScheduledForDate(task: TaskScheduleLike, targetDate: string) {
  if (task.plannedDate === targetDate) return true;
  if (taskModeOf(task) === "single") return task.due === targetDate
    || Boolean(task.progressLogs?.some((entry) => entry.date === targetDate));
  const start = task.startDate || task.due || targetDate;
  const due = task.due || "9999-12-31";
  return start <= targetDate && targetDate <= due
    || Boolean(task.progressLogs?.some((entry) => entry.date === targetDate));
}

export function taskVisibleToday(task: TaskScheduleLike, targetDate: string) {
  if (taskStatusOf(task) === "已完成") return taskCompletionDate(task) === targetDate;
  if (task.plannedDate === targetDate) return true;
  if (taskModeOf(task) === "single") return taskScheduledForDate(task, targetDate) || (!task.due && !task.plannedDate && task.today === true);
  return (task.startDate || task.due || targetDate) <= targetDate;
}

export function taskOverlapsRange(task: TaskScheduleLike, rangeStart: string, rangeEnd: string) {
  if (task.plannedDate && task.plannedDate >= rangeStart && task.plannedDate <= rangeEnd) return true;
  if (taskModeOf(task) === "single") return [task.due, task.plannedDate].some((date) => Boolean(date && date >= rangeStart && date <= rangeEnd));
  const start = task.startDate || task.due || rangeStart;
  const due = task.due || "9999-12-31";
  return start <= rangeEnd && due >= rangeStart;
}

function utcDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayDifference(from: string, to: string) {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

export function taskScheduleSummary(task: TaskScheduleLike, targetDate: string) {
  if (taskModeOf(task) === "single") return `${task.plannedDate ? `${task.plannedDate} 计划推进 · ` : ""}${task.due ? `截止 ${taskDeadlineLabel(task)}` : "未设截止"}`;
  const start = task.startDate || task.due || targetDate;
  const due = task.due || "";
  if (start > targetDate) return `${dayDifference(targetDate, start)} 天后开始`;
  if (!due) return `第 ${dayDifference(start, targetDate) + 1} 天 · 未设截止`;
  if (due < targetDate) return `已逾期 ${dayDifference(due, targetDate)} 天`;
  return `第 ${dayDifference(start, targetDate) + 1} 天 · 剩 ${dayDifference(targetDate, due)} 天`;
}

export function taskDeadlineLabel(task: TaskScheduleLike) {
  return task.due ? `${task.due}${task.dueTime ? ` ${task.dueTime}` : ""}` : "未设截止";
}
