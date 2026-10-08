import test from "node:test";
import assert from "node:assert/strict";
import { createDailyStudyTaskPlan, isPriorityStudyCourse, isUnneededPreparationTask, migratedStudyAutomationProcessedKeys, refreshDailyStudyTaskMethods, STUDY_AUTOMATION_RULE_VERSION } from "../lib/study-task-automation.ts";
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

test("keeps the four priority courses and allows merged economics Tutorial practice without Lecture preparation", () => {
  const titles = ["概率论与数理统计", "线性代数B", "税收理论与实务", "会计学基础（全英文）", "大数据分析（全英文）", "经济学基础（全英文）", "气候与社会", "体育"];
  const courses = titles.map((title, index) => ({ id: `course-${index}`, title, location: "", schedule: [slot(`slot-${index}`, 5, "08:00", "09:35")] }));
  const preparation = createDailyStudyTaskPlan(courses, "2026-09-24", "2026-08-31");

  assert.deepEqual(preparation.map((task) => task.courseId), ["course-0", "course-1", "course-2", "course-3", "course-5"]);
  assert.ok(preparation.every((task) => task.automationKey.includes(":before:")));
  assert.match(preparation.find((task) => task.courseId === "course-5").requirements, /Tutorial questions；Lecture 不另外安排预习/);
  assert.equal(isPriorityStudyCourse(titles[5]), false);
  const classDay = createDailyStudyTaskPlan(courses, "2026-09-25", "2026-08-31");
  for (const id of ["course-4", "course-5"]) {
    assert.deepEqual(classDay.filter((task) => task.courseId === id).map((task) => task.automationKey.split(":")[2]), ["during", "after"]);
  }
  assert.ok(classDay.every((task) => !["course-6", "course-7"].includes(task.courseId)));
});

test("recognizes important course aliases and filters only outdated automatic preparation", () => {
  for (const title of ["线代", "税务", "税法", "会计学基础", "概 率 论与数理统计"]) assert.equal(isPriorityStudyCourse(title), true);
  const beforeKey = "study:2026-09-24:before:economics:2026-09-25";
  assert.equal(isUnneededPreparationTask(beforeKey, "经济学基础"), false);
  assert.equal(isUnneededPreparationTask(beforeKey, "概率论与数理统计"), false);
  assert.equal(isUnneededPreparationTask("study:2026-09-22:before:data:2026-09-23", "大数据分析"), true);
  assert.equal(isUnneededPreparationTask("study:2026-09-23:before:data:2026-09-24", "大数据分析"), false);
  assert.equal(isUnneededPreparationTask(beforeKey.replace(":before:", ":after:"), "经济学基础"), false);
  assert.equal(isUnneededPreparationTask(undefined, "经济学基础"), false);
  assert.equal(isUnneededPreparationTask("manual:before:economics", "经济学基础"), false);
  assert.equal(migratedStudyAutomationProcessedKeys([beforeKey], STUDY_AUTOMATION_RULE_VERSION)[0], beforeKey);
});

test("uses the latest core-subject methods without adding homework or daily unit reviews", () => {
  const courses = ["线性代数B", "概率论与数理统计", "税收理论与实务", "会计学基础（全英文）", "马原"].map((title, index) => ({
    id: `core-${index}`, title, location: "", schedule: [slot(`core-slot-${index}`, 4, "08:00", "09:35")],
  }));
  const plan = createDailyStudyTaskPlan(courses, "2026-09-24", "2026-08-31");
  const after = (id) => plan.find((task) => task.courseId === id && task.automationKey.includes(":after:")).requirements;

  assert.equal(plan.length, 10);
  for (const id of ["core-0", "core-1"]) {
    assert.match(after(id), /复习本节笔记；本单元结束时，用 GPT 总结知识框架和题型/);
    assert.doesNotMatch(after(id), /分析已有错题|完成自测/);
  }
  assert.match(after("core-2"), /练习本节税收题目，并复习笔记/);
  assert.match(after("core-3"), /独立完成本节 Question Bank/);
  assert.match(after("core-4"), /需要时再用 GPT.*本专题结束时/);
  assert.ok(plan.every((task) => !/作业|Quiz|Final|单元总复习|专题总复习/.test(task.title)));
});

test("separates Wednesday data Lecture from Thursday Seminar using the actual timetable times", () => {
  const courses = [{ id: "data", title: "大数据分析（全英文）", location: "", schedule: [
    slot("lecture", 3, "15:15", "16:50"), slot("seminar", 4, "15:15", "16:50"),
  ] }];
  assert.deepEqual(createDailyStudyTaskPlan(courses, "2026-09-22", "2026-08-31"), []);
  const wednesday = createDailyStudyTaskPlan(courses, "2026-09-23", "2026-08-31");
  assert.equal(wednesday.length, 3);
  assert.equal(wednesday[0].time, "15:15");
  assert.match(wednesday[0].requirements, /看笔记并补充课堂笔记/);
  assert.doesNotMatch(wednesday[0].requirements, /订正/);
  assert.match(wednesday[1].requirements, /GPT 二次整理.*正式考核不使用 GenAI/);
  assert.match(wednesday[2].requirements, /先独立完成本次 Seminar/);
  assert.ok(wednesday[2].automationKey.endsWith(":2026-09-24"));
  const thursday = createDailyStudyTaskPlan(courses, "2026-09-24", "2026-08-31");
  assert.equal(thursday.length, 2);
  assert.match(thursday[0].requirements, /订正课前独立完成/);
  assert.match(thursday[1].requirements, /只补充本次 Seminar 中做错或不会/);
  assert.ok(thursday.every((task) => !task.requirements.includes("GPT")));
});

test("uses explicit data class labels and merges economics without inventing a class-type schedule", () => {
  const explicitLecture = [{ id: "data", title: "大数据分析 Lecture", location: "", schedule: [slot("dl", 4, "14:10", "15:55")] }];
  assert.deepEqual(createDailyStudyTaskPlan(explicitLecture, "2026-09-23", "2026-08-31"), []);
  const explicitSeminar = [{ ...explicitLecture[0], title: "大数据分析 Seminar", schedule: [slot("ds", 3, "14:10", "15:55")] }];
  assert.match(createDailyStudyTaskPlan(explicitSeminar, "2026-09-22", "2026-08-31")[0].requirements, /独立完成本次 Seminar/);
  const economics = [{ id: "economics", title: "经济学基础（全英文）", location: "", schedule: [slot("ec", 5, "15:15", "16:50")] }];
  const plan = createDailyStudyTaskPlan(economics, "2026-09-25", "2026-08-31");
  assert.equal(plan.length, 2);
  assert.match(plan[0].requirements, /看总结笔记.*订正 Tutorial questions/);
  assert.match(plan[1].requirements, /Lecture 笔记；Tutorial 只复习错题和相关知识点/);
});

test("refreshes today's generated method in place while preserving personal notes, postponement and attachments", () => {
  const [draft] = createDailyStudyTaskPlan([{ id: "linear", title: "线性代数B", location: "", schedule: [slot("l", 4, "08:00", "09:35")] }], "2026-09-24", "2026-08-31").filter((task) => task.automationKey.includes(":after:"));
  const oldRequirements = draft.requirements.replace(/学习方法：[^\n]+/, "学习方法：用 GPT 分析已有错题、总结本节题型，再复习笔记并完成自测。");
  const node = { ...draft, id: "existing", done: false, date: "2026-09-26", elapsed: 25, progress: 30,
    requirements: `${oldRequirements}\n我的补充：先看第二章例题。`, attachments: [{ id: "file", url: "https://example.com/note.pdf" }],
    blocks: [{ id: "note", type: "text", text: "保留课堂笔记" }],
  };
  const refreshed = refreshDailyStudyTaskMethods([node], [draft]);
  assert.equal(refreshed.length, 1);
  assert.match(refreshed[0].requirements, /本单元结束时/);
  assert.match(refreshed[0].requirements, /我的补充：先看第二章例题。/);
  assert.deepEqual({ ...refreshed[0], requirements: undefined }, { ...node, requirements: undefined });
  assert.equal(refreshDailyStudyTaskMethods(refreshed, [draft]), refreshed);
});

test("does not refresh manual tasks, completed history, old days or user-rewritten methods", () => {
  const [draft] = createDailyStudyTaskPlan([{ id: "linear", title: "线性代数B", location: "", schedule: [slot("l", 4, "08:00", "09:35")] }], "2026-09-24", "2026-08-31").filter((task) => task.automationKey.includes(":after:"));
  const old = { ...draft, done: false, requirements: draft.requirements.replace(/学习方法：[^\n]+/, "学习方法：用 GPT 分析已有错题、总结本节题型，再复习笔记并完成自测。") };
  const preserved = [
    { ...old, automationKey: undefined }, { ...old, done: true },
    { ...old, automationKey: old.automationKey.replace("study:2026-09-24:", "study:2026-09-23:") },
    { ...old, requirements: old.requirements.replace(/学习方法：[^\n]+/, "学习方法：只复习我标记的第三题。") },
  ];
  assert.equal(refreshDailyStudyTaskMethods(preserved, [draft]), preserved);
  assert.deepEqual(refreshDailyStudyTaskMethods([], [draft]), []);
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
