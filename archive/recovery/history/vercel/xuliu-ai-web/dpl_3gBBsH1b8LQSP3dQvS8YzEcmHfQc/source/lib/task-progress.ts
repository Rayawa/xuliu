export type TaskMode = "single" | "multi";
export type TaskProgressStatus = "未开始" | "进行中" | "已暂停" | "已完成";

export type TaskScheduleLike = {
  due?: string;
  today?: boolean;
  done?: boolean;
  mode?: TaskMode;
  startDate?: string;
  status?: TaskProgressStatus;
  progress?: number;
  progressLogs?: { date: string; progress: number }[];
};

export const taskStatusOptions: TaskProgressStatus[] = ["未开始", "进行中", "已暂停", "已完成"];

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
  if (taskModeOf(task) === "single") return task.due === targetDate;
  const start = task.startDate || task.due || targetDate;
  const due = task.due || "9999-12-31";
  return start <= targetDate && targetDate <= due
    || Boolean(task.progressLogs?.some((entry) => entry.date === targetDate));
}

export function taskVisibleToday(task: TaskScheduleLike, targetDate: string) {
  if (taskModeOf(task) === "single") return taskScheduledForDate(task, targetDate) || (!task.due && task.today === true);
  if (task.done || task.status === "已完成") {
    return task.due === targetDate || Boolean(task.progressLogs?.some((entry) => entry.date === targetDate));
  }
  return (task.startDate || task.due || targetDate) <= targetDate;
}

export function taskOverlapsRange(task: TaskScheduleLike, rangeStart: string, rangeEnd: string) {
  if (taskModeOf(task) === "single") return Boolean(task.due && task.due >= rangeStart && task.due <= rangeEnd);
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
  if (taskModeOf(task) === "single") return task.due || "未设日期";
  const start = task.startDate || task.due || targetDate;
  const due = task.due || "";
  if (start > targetDate) return `${dayDifference(targetDate, start)} 天后开始`;
  if (!due) return `第 ${dayDifference(start, targetDate) + 1} 天 · 未设截止`;
  if (due < targetDate) return `已逾期 ${dayDifference(due, targetDate)} 天`;
  return `第 ${dayDifference(start, targetDate) + 1} 天 · 剩 ${dayDifference(targetDate, due)} 天`;
}
