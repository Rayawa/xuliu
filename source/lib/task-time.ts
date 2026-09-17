export type WorkTarget = { kind: "task" | "milestone"; id: string };
export type TimeEntry = { id: string; taskId: string; targetKind?: WorkTarget["kind"]; minutes: number; date: string; mode: string; note?: string };
export type FocusSettings = { minutes: number; sound: boolean; volume: number };
export const defaultFocusSettings: FocusSettings = { minutes: 25, sound: true, volume: 40 };
export type FocusSession = { id: string; target: WorkTarget; mode: "pomodoro" | "stopwatch"; duration: number; elapsed: number; startedAt: number | null };

export function elapsedSeconds(session: FocusSession, now: number) {
  const total = session.elapsed + (session.startedAt === null ? 0 : Math.max(0, now - session.startedAt) / 1000);
  return Math.min(session.mode === "pomodoro" ? session.duration : 86400, total);
}
export function restoreFocusSession(raw: unknown): FocusSession | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as FocusSession;
  if (typeof s.id !== "string" || !s.id || s.id.length > 120 || !s.target || !["task", "milestone"].includes(s.target.kind)
    || typeof s.target.id !== "string" || !s.target.id || !["pomodoro", "stopwatch"].includes(s.mode)
    || !Number.isFinite(s.duration) || s.duration < 60 || s.duration > 10800
    || !Number.isFinite(s.elapsed) || s.elapsed < 0 || s.elapsed > 86400
    || (s.startedAt !== null && (!Number.isFinite(s.startedAt) || s.startedAt < 0 || s.startedAt > Date.now()))) return null;
  return s;
}
export function entryMatches(entry: TimeEntry, target: WorkTarget) {
  return entry.taskId === target.id && (entry.targetKind ?? "task") === target.kind;
}
export function appendTimeEntry<T extends { id: string; elapsed?: number }, M extends { id: string; elapsed?: number }, S extends { tasks: T[]; milestones: M[]; timeEntries: TimeEntry[] }>(state: S, entry: TimeEntry): S {
  if (state.timeEntries.some(item => item.id === entry.id)) return state;
  if (!Number.isInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > 1440) throw new Error("请填写 1—1440 之间的整数分钟数");
  if (state.timeEntries.length >= 20000) throw new Error("时间记录已达到上限，请先导出备份并整理记录");
  const collection = entry.targetKind === "milestone" ? "milestones" : "tasks";
  const items = state[collection];
  const target = items.find(item => item.id === entry.taskId);
  if (!target) throw new Error("任务已不存在，未写入时间");
  if ((target.elapsed ?? 0) + entry.minutes > 10000000) throw new Error("累计时间已达到上限");
  return { ...state, [collection]: items.map(item => item.id === entry.taskId ? { ...item, elapsed: (item.elapsed ?? 0) + entry.minutes } : item), timeEntries: [...state.timeEntries, entry] };
}
export type NestedTask = { id: string; parentId?: string; parentMilestoneId?: string; elapsed: number; done: boolean };
export function detachRemovedParents<T extends { id: string; parentId?: string; parentMilestoneId?: string }>(previous: { tasks: T[]; milestones: { id: string }[] }, next: { tasks: T[]; milestones: { id: string }[] }): T[] {
  const remainingTasks = new Set(next.tasks.map(task => task.id));
  const remainingNodes = new Set(next.milestones.map(node => node.id));
  const removedTasks = new Set(previous.tasks.filter(task => !remainingTasks.has(task.id)).map(task => task.id));
  const removedNodes = new Set(previous.milestones.filter(node => !remainingNodes.has(node.id)).map(node => node.id));
  if (!removedTasks.size && !removedNodes.size) return next.tasks;
  return next.tasks.map(task => {
    if (task.parentId && removedTasks.has(task.parentId)) { const { parentId: _parent, ...rest } = task; return rest as T; }
    if (task.parentMilestoneId && removedNodes.has(task.parentMilestoneId)) { const { parentMilestoneId: _parent, ...rest } = task; return rest as T; }
    return task;
  });
}
export function descendantTasks<T extends NestedTask>(tasks: T[], target: WorkTarget): T[] {
  const result: T[] = [];
  const ids = new Set(target.kind === "task" ? [target.id] : []);
  const seen = new Set<string>(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (!seen.has(task.id) && ((task.parentId && ids.has(task.parentId)) || (target.kind === "milestone" && task.parentMilestoneId === target.id))) {
        seen.add(task.id); ids.add(task.id); result.push(task); changed = true;
      }
    }
  }
  return result;
}
export function parentError(tasks: { id: string; parentId?: string; parentMilestoneId?: string }[], milestones: { id: string }[]) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const nodes = new Set(milestones.map(m => m.id));
  const complete = new Set<string>();
  for (const task of tasks) {
    if (task.parentId && task.parentMilestoneId) return "一个小任务只能属于一个大任务";
    if (task.parentId && !byId.has(task.parentId)) return "关联的大任务不存在";
    if (task.parentMilestoneId && !nodes.has(task.parentMilestoneId)) return "关联的课程或日历事项不存在";
    const chain = new Set<string>();
    let current: typeof task | undefined = task;
    while (current && !complete.has(current.id)) {
      if (chain.has(current.id)) return "大任务和小任务不能循环关联";
      chain.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    for (const id of chain) complete.add(id);
  }
  return "";
}
