import type { z } from "zod";
import type { workspaceStateSchema } from "./workspace-state-schema.ts";
import { taskModeOf, taskStatusOf, taskVisibleToday } from "./task-progress.ts";

type StageState = Pick<z.infer<typeof workspaceStateSchema>, "tasks" | "milestones">;
const stagePrefix = "stage:";

export function withPlannedTaskStages<T extends StageState>(next: T, date: string, createId: () => string, previous?: StageState): T {
  let tasks = next.tasks;
  let milestones = next.milestones;
  const linkedTo = (task: StageState["tasks"][number], kind: "task" | "milestone", id: string) => kind === "task" ? task.parentId === id : task.parentMilestoneId === id;

  for (const oldStage of previous?.tasks ?? []) {
    if (!oldStage.id.startsWith(stagePrefix)) continue;
    const kind = oldStage.parentId ? "task" : "milestone";
    const parentId = oldStage.parentId ?? oldStage.parentMilestoneId;
    if (!parentId) continue;
    const oldParent = (kind === "task" ? previous!.tasks : previous!.milestones).find((item) => item.id === parentId);
    const parent = (kind === "task" ? tasks : milestones).find((item) => item.id === parentId);
    if (!oldParent || !parent || taskModeOf(parent) !== "multi" || !oldStage.plannedDate || oldParent.plannedDate !== oldStage.plannedDate) continue;
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
    if (item.plannedDate !== date || taskStatusOf(item) === "已完成") continue;
    if (tasks.some((task) => linkedTo(task, kind, item.id) && taskModeOf(task) === "single" && taskVisibleToday(task, date))) continue;
    const unscheduledStage = tasks.find((task) => task.id.startsWith(stagePrefix) && linkedTo(task, kind, item.id) && taskModeOf(task) === "single" && !task.done && !task.plannedDate && !task.due);
    if (unscheduledStage) {
      tasks = tasks.map((task) => task.id === unscheduledStage.id ? { ...task, plannedDate: date, today: true } : task);
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
