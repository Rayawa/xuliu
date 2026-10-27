import test from "node:test";
import assert from "node:assert/strict";
import { rescheduleDailyStudy, studyPlanResetMessage } from "../lib/study-plan-reset.ts";
import { createDailyStudyTaskPlan, STUDY_AUTOMATION_RULE_VERSION, studyTaskVisibleOnDate } from "../lib/study-task-automation.ts";
import { chooseReviewPoolItem, deferStudyToReviewPool, deleteReviewPoolItem, initializeCourseReviewPool } from "../lib/course-review-pool.ts";
import { createEmptyWorkspaceState, workspaceStateSchema } from "../lib/workspace-state-schema.ts";

const today = "2026-10-14";
const course = { id: "linear", title: "线性代数B", term: "秋季", teacher: "", location: "", progress: 0, requirements: "", blocks: [], schedule: [{ id: "s", weekday: 3, start: "08:00", end: "09:35", location: "教学楼", weeks: "1-16周" }] };
const stateFor = (milestones = []) => ({ ...createEmptyWorkspaceState(), courses: [course], milestones, timetableSettings: { termStartDate: "2026-08-31", activeSchool: "bit" }, studyAutomation: { enabled: true, processedKeys: milestones.map((node) => node.automationKey).filter(Boolean), ruleVersion: STUDY_AUTOMATION_RULE_VERSION } });
const draft = createDailyStudyTaskPlan([course], today, "2026-08-31")[0];
const automatic = { ...draft, id: "auto-linear", area: "课内", mode: "single", parentCandidate: false, done: false };
const doNotCreate = () => assert.fail("An existing or pool-linked task must not be recreated");

test("rescheduling recreates a deleted current-day task once despite its processed marker", () => {
  const state = stateFor();
  state.studyAutomation.processedKeys = ["study:old", draft.automationKey];
  const before = structuredClone(state);
  const result = rescheduleDailyStudy(state, today, () => "restored-linear");
  assert.equal(result.added, 1);
  assert.equal(result.restored, 0);
  assert.deepEqual(result.state.milestones, [{ ...automatic, id: "restored-linear" }]);
  assert.deepEqual(result.state.studyAutomation.processedKeys, state.studyAutomation.processedKeys);
  assert.deepEqual(state, before);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result.state))), result.state);
  const again = rescheduleDailyStudy(result.state, today, doNotCreate);
  assert.equal(again.state, result.state);
  assert.equal(again.added, 0);
  assert.equal(studyPlanResetMessage(result), "已补回 1 项。");
  assert.match(studyPlanResetMessage(again), /已保留现有安排/);
});

test("rescheduling resumes cancellation without replacing personal edits, files or records", () => {
  const edited = { ...automatic, title: "线代第2章错题", requirements: "整理两个错题", plannedDate: today, dismissedTodayDate: today, blocks: [{ id: "note", type: "text", text: "个人笔记" }], outcomeText: "已做一半", attachments: [{ id: "file", url: "https://example.blob.vercel-storage.com/attachments/owner/auto-linear/a.html", fileName: "复习.html", fileSize: 100, mimeType: "text/html", uploadedAt: "2026-10-14T01:00:00.000Z" }] };
  const state = stateFor([edited]);
  const result = rescheduleDailyStudy(state, today, doNotCreate);
  const { dismissedTodayDate, ...expected } = edited;
  assert.equal(result.restored, 1);
  assert.equal(result.added, 0);
  assert.deepEqual(result.state.milestones, [expected]);
  assert.equal(state.milestones[0].dismissedTodayDate, today);
  assert.equal(studyTaskVisibleOnDate(result.state.milestones[0], today), true);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result.state))), result.state);
});

test("completed tasks and manual date changes remain intact during a reset", () => {
  for (const patch of [{ done: true, completedDate: today }, { plannedDate: "2026-10-15", dismissedTodayDate: today }, { date: "2026-10-16" }]) {
    const state = stateFor([{ ...automatic, ...patch }]);
    const result = rescheduleDailyStudy(state, today, doNotCreate);
    assert.equal(result.state, state);
    assert.equal(result.restored, 0);
    assert.equal(result.added, 0);
  }
});

test("review pool source records stay protected even after their pool item was deleted", () => {
  const initial = initializeCourseReviewPool(stateFor([automatic]), today);
  const pooled = deferStudyToReviewPool(initial, automatic.id, { chapter: "第2章", note: "以后复习" }, "unused");
  const removed = deleteReviewPoolItem(pooled, "review:linear-algebra:2");
  for (const state of [pooled, removed]) {
    const before = structuredClone(state);
    const result = rescheduleDailyStudy(state, today, doNotCreate);
    assert.equal(result.state, state);
    assert.deepEqual(result.state, before);
    assert.equal(result.added, 0);
    assert.equal(result.state.milestones[0], automatic);
  }
});

test("a selected pool chapter and an earlier-day task moved into today each prevent duplicates", () => {
  const selected = chooseReviewPoolItem(initializeCourseReviewPool(stateFor(), today), "review:linear-algebra:2", today);
  const result = rescheduleDailyStudy(selected, today, doNotCreate);
  assert.equal(result.added, 0);
  assert.equal(result.state.milestones.length, 0);
  assert.deepEqual(result.state.reviewPool, selected.reviewPool);
  const moved = { ...automatic, automationKey: "study:2026-10-13:review:linear:2026-10-13", date: "2026-10-13", plannedDate: today };
  const state = stateFor([moved]);
  const again = rescheduleDailyStudy(state, today, doNotCreate);
  assert.equal(again.added, 0);
  assert.equal(again.state.milestones[0], moved);
});

test("a day without classes gives feedback and does not touch independent work or old markers", () => {
  const state = stateFor([{ ...automatic, automationKey: undefined, id: "homework", title: "正式作业" }]);
  const result = rescheduleDailyStudy(state, "2026-10-15", doNotCreate);
  assert.equal(result.state, state);
  assert.equal(result.planned, 0);
  assert.equal(studyPlanResetMessage(result), "今天没有需要自动安排的课程。");
  const added = rescheduleDailyStudy(state, today, () => "study-new");
  assert.equal(added.added, 1);
  assert.equal(added.state.milestones[0], state.milestones[0]);
  assert.equal(added.state.tasks, state.tasks);
});
