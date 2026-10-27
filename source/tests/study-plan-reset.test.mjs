import test from "node:test";
import assert from "node:assert/strict";
import { rescheduleDailyStudy } from "../lib/study-plan-reset.ts";
import { createDailyStudyTaskPlan, migrateDailyStudyTasks, STUDY_AUTOMATION_RULE_VERSION, studyTaskVisibleOnDate } from "../lib/study-task-automation.ts";
import { chooseReviewPoolItem, deferStudyToReviewPool, deleteReviewPoolItem, initializeCourseReviewPool, withoutReviewPoolSources } from "../lib/course-review-pool.ts";
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

test("a task already completed today remains completed and does not produce another item", () => {
  const state = stateFor([{ ...automatic, done: true, completedDate: today }]);
  const result = rescheduleDailyStudy(state, today, doNotCreate);
  assert.equal(result.state, state);
  assert.equal(result.restored, 0);
  assert.equal(result.added, 0);
});

test("old postponed or completed records do not block today's plan and keep their content", () => {
  for (const patch of [
    { plannedDate: "2026-10-15", dismissedTodayDate: today },
    { date: "2026-10-16" },
    { done: true, completedDate: "2026-10-13" },
    { done: true, completedDate: undefined },
  ]) {
    const previous = { ...automatic, title: "保留原有记录", requirements: "自己的笔记", ...patch };
    const state = stateFor([previous]);
    assert.equal(studyTaskVisibleOnDate(previous, today), false);
    const result = rescheduleDailyStudy(state, today, () => "new-auto");
    assert.equal(result.added, 1);
    assert.equal(result.state.milestones[0], previous);
    assert.deepEqual(result.state.milestones[1], { ...automatic, id: "new-auto", automationKey: `${draft.automationKey}:reset:new-auto` });
    const saved = workspaceStateSchema.parse(JSON.parse(JSON.stringify(result.state)));
    const loaded = migrateDailyStudyTasks(saved, today);
    assert.equal(loaded.milestones.length, 2);
    assert.equal(loaded.milestones.filter((node) => studyTaskVisibleOnDate(node, today)).length, 1);
    assert.equal(rescheduleDailyStudy(loaded, today, doNotCreate).added, 0);
  }
});

test("rearranging after all today's automatic tasks were postponed works without a review pool", () => {
  const courses = [course, { ...course, id: "tax", title: "税收理论与实务" }, { ...course, id: "economics", title: "经济学基础" }];
  const drafts = createDailyStudyTaskPlan(courses, today, "2026-08-31");
  const previous = drafts.map((item, index) => ({ ...item, id: `old-${index}`, date: "2026-10-15", requirements: `保留要求${index}`, area: "课内", mode: "single", done: false }));
  const state = { ...stateFor(previous), courses };
  assert.equal(state.reviewPool, undefined);
  assert.equal(state.milestones.filter((node) => studyTaskVisibleOnDate(node, today)).length, 0);
  const result = rescheduleDailyStudy(state, today, (key) => `new-${drafts.findIndex((item) => item.automationKey === key)}`);
  assert.equal(result.added, 3);
  assert.deepEqual(result.state.milestones.slice(0, 3), previous);
  assert.equal(result.state.milestones.filter((node) => studyTaskVisibleOnDate(node, today)).length, 3);
  assert.equal(new Set(result.state.milestones.map((node) => node.automationKey)).size, 6);
  const saved = workspaceStateSchema.parse(JSON.parse(JSON.stringify(result.state)));
  const loaded = migrateDailyStudyTasks(saved, today);
  assert.equal(loaded.milestones.filter((node) => studyTaskVisibleOnDate(node, today)).length, 3);
  assert.equal(rescheduleDailyStudy(loaded, today, doNotCreate).added, 0);
});

test("review pool source records stay protected when today's plan is regenerated", () => {
  const initial = initializeCourseReviewPool(stateFor([automatic]), today);
  const pooled = deferStudyToReviewPool(initial, automatic.id, { chapter: "第2章", note: "以后复习" }, "unused");
  const removed = deleteReviewPoolItem(pooled, "review:linear-algebra:2");
  for (const state of [pooled, removed]) {
    const before = structuredClone(state);
    const result = rescheduleDailyStudy(state, today, () => "new-auto");
    assert.deepEqual(state, before);
    assert.equal(result.added, 1);
    assert.equal(result.state.milestones[0], automatic);
    assert.deepEqual(result.state.reviewPool, state.reviewPool);
    assert.deepEqual(withoutReviewPoolSources(result.state).milestones.map((item) => item.id), ["new-auto"]);
    assert.equal(rescheduleDailyStudy(result.state, today, doNotCreate).added, 0);
  }
});

test("a selected pool chapter does not prevent a same-course daily task; existing daily tasks are not duplicated", () => {
  const selected = chooseReviewPoolItem(initializeCourseReviewPool(stateFor(), today), "review:linear-algebra:2", today);
  const result = rescheduleDailyStudy(selected, today, () => "new-auto");
  assert.equal(result.added, 1);
  assert.equal(result.state.milestones.length, 1);
  assert.equal(studyTaskVisibleOnDate(result.state.milestones[0], today), true);
  assert.deepEqual(result.state.reviewPool, selected.reviewPool);
  assert.equal(rescheduleDailyStudy(result.state, today, doNotCreate).added, 0);
  const moved = { ...automatic, automationKey: "study:2026-10-13:review:linear:2026-10-13", date: "2026-10-13", plannedDate: today };
  const state = stateFor([moved]);
  const again = rescheduleDailyStudy(state, today, doNotCreate);
  assert.equal(again.added, 0);
  assert.equal(again.state.milestones[0], moved);
});

test("selected chapters in three courses coexist with their daily tasks without restoring a pooled source", () => {
  const courses = [course, { ...course, id: "tax", title: "税收理论与实务" }, { ...course, id: "economics", title: "经济学基础（全英文）" }];
  const drafts = createDailyStudyTaskPlan(courses, today, "2026-08-31");
  const nodes = drafts.map((item, index) => ({ ...item, id: `auto-${index}`, area: "课内", mode: "single", parentCandidate: false, done: false }));
  const original = { ...stateFor(nodes), courses };
  let selected = initializeCourseReviewPool(original, today);
  selected = deferStudyToReviewPool(selected, "auto-1", { chapter: "第1章", note: "保留笔记" }, "unused");
  selected = chooseReviewPoolItem(selected, "review:tax:1", today);
  selected = chooseReviewPoolItem(selected, "review:linear-algebra:2", today);
  selected = chooseReviewPoolItem(selected, "review:economics:L1", today);
  const before = structuredClone(selected);
  assert.equal(withoutReviewPoolSources(selected).milestones.filter((node) => studyTaskVisibleOnDate(node, today)).length, 2);
  const result = rescheduleDailyStudy(selected, today, () => "new-tax");
  assert.equal(result.added, 1);
  assert.deepEqual(selected, before);
  assert.deepEqual(result.state.reviewPool, selected.reviewPool);
  assert.equal(result.state.milestones.find((node) => node.id === "auto-1"), nodes[1]);
  const visible = withoutReviewPoolSources(result.state).milestones.filter((node) => studyTaskVisibleOnDate(node, today));
  assert.deepEqual(visible.map((node) => node.courseId).sort(), ["economics", "linear", "tax"]);
  assert.equal(result.state.reviewPool.items.filter((item) => item.selectedDate === today).length, 3);
  const saved = workspaceStateSchema.parse(JSON.parse(JSON.stringify(result.state)));
  const loaded = migrateDailyStudyTasks(saved, today);
  assert.equal(withoutReviewPoolSources(loaded).milestones.filter((node) => studyTaskVisibleOnDate(node, today)).length, 3);
  assert.equal(rescheduleDailyStudy(loaded, today, doNotCreate).added, 0);
});

test("a day without classes does not touch independent work or old markers", () => {
  const state = stateFor([{ ...automatic, automationKey: undefined, id: "homework", title: "正式作业" }]);
  const result = rescheduleDailyStudy(state, "2026-10-15", doNotCreate);
  assert.equal(result.state, state);
  assert.equal(result.planned, 0);
  const added = rescheduleDailyStudy(state, today, () => "study-new");
  assert.equal(added.added, 1);
  assert.equal(added.state.milestones[0], state.milestones[0]);
  assert.equal(added.state.tasks, state.tasks);
});
