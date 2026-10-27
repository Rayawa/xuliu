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
    if (studyCoveredByReviewPool(state, { ...draft, id: "" }, date)) {
      preserved++;
      continue;
    }
    const candidates = milestones.filter((node) => node.courseId === draft.courseId
      && node.automationKey?.startsWith("study:") && node.automationKey.split(":")[2] === "review"
      && !poolSources.has(`milestone:${node.id}`));
    if (candidates.some((node) => studyTaskVisibleOnDate(node, date))) {
      preserved++;
      continue;
    }
    const cancelled = candidates.find((node) => !node.done && node.dismissedTodayDate === date
      && studyTaskVisibleOnDate({ ...node, dismissedTodayDate: undefined }, date));
    if (cancelled) {
      const { dismissedTodayDate: _dismissed, ...resumed } = cancelled;
      milestones = milestones.map((node) => node.id === cancelled.id ? resumed : node);
      restored++;
      continue;
    }
    const id = createId(draft.automationKey);
    const automationKey = milestones.some((node) => node.automationKey === draft.automationKey)
      ? `${draft.automationKey}:reset:${id}` : draft.automationKey;
    milestones = [...milestones, { ...draft, automationKey, id, mode: "single", parentCandidate: false, area: "课内", done: false }];
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
