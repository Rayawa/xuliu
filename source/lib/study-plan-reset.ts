import type { z } from "zod";
import type { workspaceStateSchema } from "./workspace-state-schema.ts";
import { reviewPoolSourceKeys, studyCoveredByReviewPool } from "./course-review-pool.ts";
import { createDailyStudyTaskPlan, studyTaskVisibleOnDate } from "./study-task-automation.ts";

type Workspace = z.infer<typeof workspaceStateSchema>;
type StudyResetState = Pick<Workspace, "courses" | "tasks" | "milestones" | "reviewPool"> & {
  studyAutomation: NonNullable<Workspace["studyAutomation"]>;
  timetableSettings: NonNullable<Workspace["timetableSettings"]>;
};

export function rescheduleDailyStudy<T extends StudyResetState>(state: T, date: string, createId: (key: string) => string) {
  const planned = createDailyStudyTaskPlan(state.courses, date, state.timetableSettings.termStartDate);
  const poolSources = reviewPoolSourceKeys(state);
  let milestones = state.milestones;
  let added = 0;
  let restored = 0;
  let preserved = 0;
  for (const draft of planned) {
    const existing = milestones.find((node) => node.automationKey === draft.automationKey)
      ?? milestones.find((node) => node.courseId === draft.courseId && node.automationKey?.startsWith("study:")
        && node.automationKey.split(":")[2] === "review" && (node.plannedDate || node.date) === date);
    if (studyCoveredByReviewPool(state, { ...draft, id: "" }, date) || existing && poolSources.has(`milestone:${existing.id}`)) {
      preserved++;
      continue;
    }
    if (existing) {
      if (!existing.done && existing.dismissedTodayDate === date && studyTaskVisibleOnDate({ ...existing, dismissedTodayDate: undefined }, date)) {
        const { dismissedTodayDate: _dismissed, ...resumed } = existing;
        milestones = milestones.map((node) => node.id === existing.id ? resumed : node);
        restored++;
      } else preserved++;
      continue;
    }
    milestones = [...milestones, { ...draft, id: createId(draft.automationKey), mode: "single", parentCandidate: false, area: "课内", done: false }];
    added++;
  }
  const processedKeys = [...new Set([...state.studyAutomation.processedKeys, ...planned.map((draft) => draft.automationKey)])].slice(-20_000);
  const markersChanged = processedKeys.length !== state.studyAutomation.processedKeys.length || processedKeys.some((key, index) => key !== state.studyAutomation.processedKeys[index]);
  const changed = milestones !== state.milestones || markersChanged || !state.studyAutomation.enabled;
  return {
    state: changed ? { ...state, milestones, studyAutomation: { ...state.studyAutomation, enabled: true, processedKeys } } : state,
    added, restored, preserved, planned: planned.length,
  };
}

export function studyPlanResetMessage(result: { added: number; restored: number; planned: number }) {
  if (!result.planned) return "今天没有需要自动安排的课程。";
  const changes = [result.added ? `已补回 ${result.added} 项` : "", result.restored ? `恢复 ${result.restored} 项` : ""].filter(Boolean);
  return changes.length ? `${changes.join("，")}。` : "已保留现有安排；已完成、改期或放入复习池的内容不重建。";
}
