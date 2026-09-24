import test from "node:test";
import assert from "node:assert/strict";
import { createDailyStudyTaskPlan, migratedStudyAutomationProcessedKeys, STUDY_AUTOMATION_RULE_VERSION } from "../lib/study-task-automation.ts";
import { createEmptyWorkspaceState, workspaceStateSchema } from "../lib/workspace-state-schema.ts";

const slot = (id, weekday, start, end, weeks = "1-16周") => ({ id, weekday, start, end, location: "教学楼", weeks });

test("creates course-specific class and follow-up tasks plus tomorrow preparation", () => {
  const courses = [
    { id: "linear", title: "线性代数B", location: "", schedule: [slot("l1", 4, "08:00", "09:35"), slot("l2", 4, "10:00", "11:30")] },
    { id: "probability", title: "概率论与数理统计", location: "", schedule: [slot("p1", 5, "13:20", "14:55")] },
    { id: "intro", title: "会计学专业导论", location: "", schedule: [slot("i1", 4, "15:15", "16:50")] },
    { id: "period-row", title: "第6节-第7节", location: "", schedule: [slot("bad", 4, "13:20", "14:55")] },
  ];
  const plan = createDailyStudyTaskPlan(courses, "2026-09-24", "2026-08-31");

  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((task) => task.title), [
    "课上重点 · 线性代数B",
    "课后闭环 · 线性代数B",
    "课前准备 · 概率论与数理统计",
  ]);
  assert.equal(plan[0].time, "08:00");
  assert.equal(plan[1].time, "20:00");
  assert.match(plan[0].requirements, /跟例题/);
  assert.match(plan[2].requirements, /课本和 PPT/);
  assert.ok(plan.every((task) => task.date === "2026-09-24"));
});

test("respects teaching weeks and skips electives or courses without configured methods", () => {
  const courses = [
    { id: "inactive", title: "不在本周", location: "", schedule: [slot("x", 4, "08:00", "09:35", "2-16周")] },
    { id: "elective", title: "气候与社会", location: "教室A", schedule: [slot("e", 4, "18:30", "20:55")] },
    { id: "other", title: "未配置课程", location: "教室B", schedule: [slot("o", 4, "18:30", "20:55")] },
  ];
  const plan = createDailyStudyTaskPlan(courses, "2026-09-24", "2026-08-31");

  assert.deepEqual(plan, []);
});

test("automatic task keys survive cloud validation and export", () => {
  const [draft] = createDailyStudyTaskPlan([
    { id: "linear", title: "线性代数", location: "", schedule: [slot("l1", 4, "08:00", "09:35")] },
  ], "2026-09-24", "2026-08-31");
  const state = createEmptyWorkspaceState();
  state.milestones.push({ ...draft, id: "auto-1", mode: "single", parentCandidate: false, area: "课内", done: false });
  state.studyAutomation.processedKeys.push(draft.automationKey);

  const restored = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.milestones[0].automationKey, draft.automationKey);
  assert.deepEqual(restored.studyAutomation?.processedKeys, [draft.automationKey]);
  assert.equal(restored.studyAutomation?.ruleVersion, STUDY_AUTOMATION_RULE_VERSION);
});

test("rule upgrades clear orphaned processed keys so today's plan can be rebuilt", () => {
  const orphanedKey = "study:2026-09-24:during:linear:2026-09-24";
  assert.deepEqual(migratedStudyAutomationProcessedKeys([orphanedKey], 2), []);
  assert.deepEqual(migratedStudyAutomationProcessedKeys([orphanedKey], STUDY_AUTOMATION_RULE_VERSION), [orphanedKey]);
});
