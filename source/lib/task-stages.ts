import type { z } from "zod";
import type { workspaceStateSchema } from "./workspace-state-schema.ts";
import { cancelWorkForDate, defaultTaskPlannedDate, planTaskForDate, taskModeOf, taskScheduledForDate, taskStatusOf, taskVisibleToday } from "./task-progress.ts";
import { reviewPoolSourceKeys } from "./course-review-pool.ts";

type StageState = Pick<z.infer<typeof workspaceStateSchema>, "tasks" | "milestones" | "reviewPool">;
const stagePrefix = "stage:";

export function withPlannedTaskStages<T extends StageState>(next: T, date: string, createId: () => string, previous?: StageState): T {
  let tasks = next.tasks;
  let milestones = next.milestones;
  const poolSources = reviewPoolSourceKeys(next);
  const linkedTo = (task: StageState["tasks"][number], kind: "task" | "milestone", id: string) => kind === "task" ? task.parentId === id : task.parentMilestoneId === id;

  for (const oldStage of previous?.tasks ?? []) {
    if (taskModeOf(oldStage) !== "single" || taskStatusOf(oldStage) === "已完成") continue;
    const kind = oldStage.parentId ? "task" : "milestone";
    const parentId = oldStage.parentId ?? oldStage.parentMilestoneId;
    if (!parentId || poolSources.has(`task:${oldStage.id}`) || poolSources.has(`${kind}:${parentId}`)) continue;
    const oldParent = (kind === "task" ? previous!.tasks : previous!.milestones).find((item) => item.id === parentId);
    const parent = (kind === "task" ? tasks : milestones).find((item) => item.id === parentId);
    const requestedParent = (kind === "task" ? next.tasks : next.milestones).find((item) => item.id === parentId);
    const stage = tasks.find((item) => item.id === oldStage.id);
    if (!oldParent || !parent || !stage || parent.progressedDates?.length || taskModeOf(parent) !== "multi" || taskStatusOf(parent) === "已完成") continue;
    const matchesParentPlan = Boolean(oldParent.plannedDate && defaultTaskPlannedDate(oldStage) === oldParent.plannedDate);
    if (!matchesParentPlan && !taskScheduledForDate(oldStage, date) && !taskVisibleToday(oldStage, date)) continue;
    if (stage.dismissedTodayDate !== oldStage.dismissedTodayDate && stage.dismissedTodayDate === date) {
      if (kind === "task") tasks = tasks.map((item) => item.id === parentId ? cancelWorkForDate(item, date) : item);
      else milestones = milestones.map((item) => item.id === parentId ? cancelWorkForDate(item, date) : item);
    } else if (oldStage.dismissedTodayDate && !stage.dismissedTodayDate && stage.plannedDate) {
      if (kind === "task") tasks = tasks.map((item) => item.id === parentId ? planTaskForDate(item, stage.plannedDate!) : item);
      else milestones = milestones.map((item) => item.id === parentId ? planTaskForDate(item, stage.plannedDate!) : item);
    } else if (oldStage.id.startsWith(stagePrefix) && requestedParent && requestedParent.dismissedTodayDate !== oldParent.dismissedTodayDate) {
      tasks = tasks.map((item) => item.id !== stage.id ? item : requestedParent.dismissedTodayDate === date
        ? cancelWorkForDate(item, date)
        : requestedParent.plannedDate ? planTaskForDate(item, requestedParent.plannedDate) : item);
    }
  }

  for (const oldStage of previous?.tasks ?? []) {
    if (!oldStage.id.startsWith(stagePrefix)) continue;
    const kind = oldStage.parentId ? "task" : "milestone";
    const parentId = oldStage.parentId ?? oldStage.parentMilestoneId;
    if (!parentId) continue;
    if (poolSources.has(`task:${oldStage.id}`) || poolSources.has(`${kind}:${parentId}`)) continue;
    const oldParent = (kind === "task" ? previous!.tasks : previous!.milestones).find((item) => item.id === parentId);
    const parent = (kind === "task" ? tasks : milestones).find((item) => item.id === parentId);
    if (!oldParent || !parent || parent.progressedDates?.length || taskModeOf(parent) !== "multi" || !oldStage.plannedDate || oldParent.plannedDate !== oldStage.plannedDate) continue;
    const stage = tasks.find((item) => item.id === oldStage.id);
    if (oldStage.done && stage) continue;
    if (parent.plannedDate !== oldParent.plannedDate) {
      if (stage && !stage.done && stage.plannedDate === oldStage.plannedDate) {
        tasks = tasks.map((item) => item.id === stage.id ? { ...item, plannedDate: parent.plannedDate, today: parent.plannedDate === date } : item);
      }
    } else if (!stage || stage.plannedDate !== oldStage.plannedDate) {
      const plannedDate = stage?.plannedDate;
      if (kind === "task") tasks = tasks.map((item) => item.id === parentId ? { ...item, plannedDate } : item);
      else milestones = milestones.map((item) => item.id === parentId ? { ...item, plannedDate } : item);
    }
  }

  const parents = [
    ...tasks.filter((task) => taskModeOf(task) === "multi").map((item) => ({ kind: "task" as const, item })),
    ...milestones.filter((node) => node.courseId && node.mode === "multi").map((item) => ({ kind: "milestone" as const, item })),
  ];
  for (const { kind, item } of parents) {
    if (item.progressedDates?.length) continue;
    if (poolSources.has(`${kind}:${item.id}`)) continue;
    if (item.plannedDate !== date || item.dismissedTodayDate === date || taskStatusOf(item) === "已完成") continue;
    if (tasks.some((task) => linkedTo(task, kind, item.id) && taskModeOf(task) === "single" && (taskScheduledForDate(task, date) || taskVisibleToday(task, date)))) continue;
    const unscheduledStage = tasks.find((task) => task.id.startsWith(stagePrefix) && linkedTo(task, kind, item.id) && taskModeOf(task) === "single" && !task.done && !task.plannedDate && !task.due);
    if (unscheduledStage) {
      tasks = tasks.map((task) => task.id === unscheduledStage.id ? { ...planTaskForDate(task, date), today: true } : task);
      continue;
    }
    tasks = [...tasks, {
      id: stagePrefix + createId(),
      title: (item.title + " · 阶段推进").slice(0, 500),
      area: item.area,
      source: item.title,
      ...(item.courseId ? { courseId: item.courseId } : {}),
      ...(kind === "task" ? { parentId: item.id } : { parentMilestoneId: item.id }),
      plannedDate: date,
      mode: "single",
      done: false,
      today: true,
      elapsed: 0,
      status: "未开始",
      progress: 0,
      progressLogs: [],
    }];
  }
  return tasks === next.tasks && milestones === next.milestones ? next : { ...next, tasks, milestones };
}
