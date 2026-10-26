import test from "node:test";
import assert from "node:assert/strict";
import { createDailyStudyTaskPlan, DAILY_STUDY_DURATION, dailyStudyPlanChanges, isPriorityStudyCourse, migrateDailyStudyTasks, migratedStudyAutomationProcessedKeys, STUDY_AUTOMATION_RULE_VERSION, studyTaskVisibleOnDate } from "../lib/study-task-automation.ts";
import { createEmptyWorkspaceState, workspaceStateSchema } from "../lib/workspace-state-schema.ts";

const today = "2026-10-14";
const termStartDate = "2026-08-31";
const slot = (id, weekday = 3, weeks = "1-16周") => ({ id, weekday, start: "08:00", end: "09:35", location: "教学楼", weeks });
const course = (id = "linear", title = "线性代数B", schedule = [slot("s")]) => ({ id, title, term: "秋季", teacher: "", location: "", progress: 0, requirements: "", blocks: [], schedule });
const sourceLine = "由“课表学习计划”依据 Obsidian《学习首页》自动创建。";
const node = (id, stage, generationDate = today, classDate = today) => ({
  id, courseId: "linear", title: `${stage === "before" ? "课前准备" : stage === "during" ? "课上重点" : "课后闭环"} · 线性代数B`,
  automationKey: `study:${generationDate}:${stage}:linear:${classDate}`, date: generationDate, time: "20:00", location: "",
  requirements: `对应课程：${classDate} 08:00-09:35 · 教学楼\n学习方法：用 GPT 总结课本和 PPT，形成笔记并完成预习。\n${sourceLine}`,
  mode: "single", area: "课内", done: false,
});
const stateFor = (milestones = []) => ({ ...createEmptyWorkspaceState(), courses: [course()], milestones, timetableSettings: { termStartDate, activeSchool: "bit" }, studyAutomation: { enabled: true, processedKeys: milestones.map((item) => item.automationKey).filter(Boolean), ruleVersion: 3 } });

test("each subject on today's timetable gets one short session even when it has multiple classes", () => {
  const courses = [course("linear", "线性代数B", [slot("l1"), slot("l2")]), course("intro", "会计学专业导论"), course("tomorrow", "概率论", [slot("t", 4)])];
  const plan = createDailyStudyTaskPlan(courses, today, termStartDate);
  assert.deepEqual(plan.map((item) => item.title), ["自学 · 线性代数B", "自学 · 会计学专业导论"]);
  assert.ok(plan.every((item) => item.date === today && item.requirements === DAILY_STUDY_DURATION && item.automationKey.includes(":review:")));
  assert.equal(new Set(plan.map((item) => item.courseId)).size, plan.length);
});

test("accounting gets review while all other subjects get self-study without stage names or instructions", () => {
  const titles = ["会计学基础（全英文）", "大数据分析 Lecture", "大数据分析 Seminar", "经济学基础", "气候与社会", "文献检索"];
  const plan = createDailyStudyTaskPlan(titles.map((title, index) => course(`c${index}`, title)), today, termStartDate);
  assert.equal(plan[0].title, "复习 · 会计学基础（全英文）");
  assert.ok(plan.slice(1).every((item) => item.title.startsWith("自学 · ")));
  assert.ok(plan.every((item) => item.requirements === "10–20 分钟" && item.location === ""));
  assert.doesNotMatch(JSON.stringify(plan), /课前|课上|课后|闭环|学习方法|GPT|Question Bank|Obsidian/);
});

test("timetable weekday, teaching weeks, term start and invalid row titles still constrain generation", () => {
  assert.deepEqual(createDailyStudyTaskPlan([course()], "2026-10-15", termStartDate), []);
  assert.deepEqual(createDailyStudyTaskPlan([course("off", "线性代数", [slot("s", 3, "1周")])], today, termStartDate), []);
  assert.deepEqual(createDailyStudyTaskPlan([course()], "2026-08-26", termStartDate), []);
  assert.deepEqual(createDailyStudyTaskPlan([course("bad", "第6节-第7节")], today, termStartDate), []);
  for (const title of ["线代", "税法", "概率论", "会计学基础"]) assert.equal(isPriorityStudyCourse(title), true);
  assert.equal(isPriorityStudyCourse("经济学基础"), false);
});

test("legacy stages consolidate while preserving notes, attachments, outcomes, elapsed time and references", () => {
  const attachment = { id: "f", url: "https://example.blob.vercel-storage.com/attachments/owner/note.pdf", fileName: "笔记.pdf", fileSize: 12, mimeType: "application/pdf", uploadedAt: today };
  const before = { ...node("before", "before", "2026-10-13"), requirements: node("before", "before").requirements + "\n我的补充：先看第二章。", attachments: [attachment], elapsed: 4 };
  const during = { ...node("during", "during"), blocks: [{ id: "b", type: "text", text: "保留笔记" }], outcomeText: "个人记录", outcomeAttachments: [{ ...attachment, id: "outcome" }], elapsed: 6 };
  const original = stateFor([before, during, node("after", "after")]);
  original.tasks = [{ id: "child", parentMilestoneId: during.id, title: "手动分支", area: "课内", source: "课程", done: false, today: false, elapsed: 0 }];
  original.timeEntries = [{ id: "time", taskId: during.id, targetKind: "milestone", minutes: 6, date: today, mode: "manual" }];
  const result = migrateDailyStudyTasks(original, today);
  assert.equal(result.milestones.length, 1);
  const merged = result.milestones[0];
  assert.equal(merged.id, before.id);
  assert.equal(merged.title, "自学 · 线性代数B");
  assert.equal(merged.date, today);
  assert.equal(merged.elapsed, 10);
  assert.equal(merged.requirements, "10–20 分钟\n我的补充：先看第二章。");
  assert.deepEqual(merged.attachments, before.attachments);
  assert.deepEqual(merged.blocks, during.blocks);
  assert.equal(merged.outcomeText, during.outcomeText);
  assert.deepEqual(merged.outcomeAttachments, during.outcomeAttachments);
  assert.equal(result.tasks[0].parentMilestoneId, before.id);
  assert.deepEqual(result.timeEntries[0], { ...original.timeEntries[0], taskId: before.id });
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result))), result);
  assert.equal(migrateDailyStudyTasks(result, today), result);
  assert.equal(original.milestones.length, 3);
});

test("untouched past and future automatic stages are removed while manual tasks and completed history survive", () => {
  const manual = { ...node("manual", "before"), automationKey: undefined, requirements: "自己的预习任务" };
  const completed = { ...node("done", "after", "2026-10-13", "2026-10-13"), done: true, elapsed: 30 };
  const orphan = { ...node("orphan", "during"), courseId: "missing" };
  const original = stateFor([node("past", "after", "2026-10-13", "2026-10-13"), node("future", "before", today, "2026-10-15"), manual, completed, orphan]);
  const result = migrateDailyStudyTasks(original, today);
  assert.deepEqual(result.milestones, [manual, completed, orphan]);
});

test("postponement survives migration and suppresses a replacement on the original course day", () => {
  const postponed = { ...node("postponed", "after"), date: "2026-10-16", time: "15:30", requirements: "学习方法：只做我标记的第三题。", elapsed: 3 };
  const result = migrateDailyStudyTasks(stateFor([postponed]), today);
  assert.equal(result.milestones[0].date, postponed.date);
  assert.equal(result.milestones[0].time, postponed.time);
  assert.match(result.milestones[0].requirements, /只做我标记的第三题/);
  assert.ok(result.studyAutomation.processedKeys.includes(`study:${today}:review:linear:${today}`));
  assert.ok(result.studyAutomation.processedKeys.includes("study:2026-10-16:review:linear:2026-10-16"));
});

test("future preparation with personal work becomes that day's self-study instead of losing its content", () => {
  const future = { ...node("future", "before", today, "2026-10-15"), outcomeText: "已经写下的解题思路" };
  const result = migrateDailyStudyTasks(stateFor([future]), today);
  assert.equal(result.milestones[0].date, "2026-10-15");
  assert.equal(result.milestones[0].outcomeText, future.outcomeText);
  assert.equal(result.milestones[0].title, "自学 · 线性代数B");
});

test("existing daily self-study is reused with its custom title and postponed date", () => {
  const [draft] = createDailyStudyTaskPlan([course()], today, termStartDate);
  const existing = { ...draft, id: "review", date: "2026-10-16", title: "复习第二章", mode: "single", area: "课内", done: false, requirements: "自己的复习内容" };
  const result = migrateDailyStudyTasks(stateFor([node("old", "after"), existing]), today);
  assert.equal(result.milestones.length, 1);
  assert.equal(result.milestones[0].id, existing.id);
  assert.equal(result.milestones[0].date, existing.date);
  assert.equal(result.milestones[0].title, existing.title);
  assert.match(result.milestones[0].requirements, /自己的复习内容/);
});

test("completed daily self-study prevents a second unfinished daily item during migration", () => {
  const [draft] = createDailyStudyTaskPlan([course()], today, termStartDate);
  const existing = { ...draft, id: "review", mode: "single", area: "课内", done: true };
  const result = migrateDailyStudyTasks(stateFor([node("old", "during"), existing]), today);
  assert.equal(result.milestones.length, 1);
  assert.equal(result.milestones[0].done, true);
});

test("migration keeps personal records separate if consolidation would exceed storage limits", () => {
  const nodes = ["before", "after"].map((stage) => ({ ...node(stage, stage), requirements: "记".repeat(4000) }));
  const result = migrateDailyStudyTasks(stateFor(nodes), today);
  assert.equal(result.milestones.length, 2);
  assert.ok(result.milestones.every((item) => !item.automationKey && item.requirements.length === 4000));
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result))), JSON.parse(JSON.stringify(result)));
});

test("rule changes keep processed deletion and postponement markers instead of resetting them", () => {
  const reviewKey = `study:${today}:review:linear:${today}`;
  const legacyKey = `study:${today}:during:linear:${today}`;
  assert.deepEqual(migratedStudyAutomationProcessedKeys([reviewKey, legacyKey, 7], 3), [reviewKey, legacyKey]);
  assert.deepEqual(migratedStudyAutomationProcessedKeys([reviewKey, legacyKey], STUDY_AUTOMATION_RULE_VERSION, new Set([legacyKey])), [reviewKey]);
});

test("new daily keys and duration survive cloud validation and export", () => {
  const [draft] = createDailyStudyTaskPlan([course()], today, termStartDate);
  const state = stateFor([{ ...draft, id: "review", mode: "single", area: "课内", done: false }]);
  state.studyAutomation.ruleVersion = STUDY_AUTOMATION_RULE_VERSION;
  const restored = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.milestones[0].requirements, DAILY_STUDY_DURATION);
  assert.equal(restored.studyAutomation.ruleVersion, 4);
  assert.deepEqual(restored.studyAutomation.processedKeys, [draft.automationKey]);
});

test("a daily item postponed into today covers that subject without another twenty-minute session", () => {
  const planned = createDailyStudyTaskPlan([course()], today, termStartDate);
  for (const schedule of [{ date: today }, { date: "2026-10-13", plannedDate: today }]) {
    const postponed = { ...planned[0], ...schedule, automationKey: "study:2026-10-13:review:linear:2026-10-13" };
    const changes = dailyStudyPlanChanges([postponed], planned, [postponed.automationKey]);
    assert.deepEqual(changes.additions, []);
    assert.ok(changes.processedKeys.includes(planned[0].automationKey));
    assert.equal(dailyStudyPlanChanges([], planned, changes.processedKeys), null);
  }
});

test("completion, postponement and deletion do not regenerate a daily item unless explicitly reset", () => {
  const planned = createDailyStudyTaskPlan([course()], today, termStartDate);
  const added = dailyStudyPlanChanges([], planned, []);
  assert.deepEqual(added.additions, planned);
  assert.equal(dailyStudyPlanChanges([], planned, added.processedKeys), null);
  assert.equal(dailyStudyPlanChanges([{ ...planned[0], done: true }], planned, [] ).additions.length, 0);
  assert.equal(dailyStudyPlanChanges([{ ...planned[0], date: "2026-10-15" }], planned, [] ).additions.length, 0);
  assert.equal(dailyStudyPlanChanges([], planned, []).additions.length, 1);
});

test("an explicit study plan date survives migration without overwriting its original deadline", () => {
  const plannedDate = "2026-10-16";
  const original = { ...node("planned", "after"), plannedDate, time: "15:30" };
  const other = node("during", "during");
  const result = migrateDailyStudyTasks(stateFor([original, other]), today);
  const moved = result.milestones.find((item) => item.id === original.id);
  assert.equal(moved.date, original.date);
  assert.equal(moved.plannedDate, plannedDate);
  assert.equal(moved.time, original.time);
  assert.equal(studyTaskVisibleOnDate(moved, today), false);
  assert.equal(studyTaskVisibleOnDate(moved, plannedDate), true);
  assert.equal(studyTaskVisibleOnDate({ ...moved, automationKey: undefined }, today), true);
});

test("excluded courses do not generate daily self-study, including policy course names and aliases", () => {
  const courses = [course(), course("accounting", "会计学基础"), course("sport", "体育/跆拳道"), course("sport-alias", "跆 拳 道"), course("climate", "气候与社会"), course("climate-alias", "气候 与 社会"), course("policy", "形势与政策"), course("policy-alias", "形 策"), course("policy-term", "形势与政策（七）")];
  assert.deepEqual(createDailyStudyTaskPlan(courses, today, termStartDate).map((draft) => draft.courseId), ["linear", "accounting"]);
});

test("policy self-study is removed without changing the timetable, formal homework, notes or completed history", () => {
  const policy = course("policy", "形势与政策（七）");
  const automatic = { ...node("policy-study", "review"), courseId: policy.id, automationKey: `study:${today}:review:${policy.id}:${today}`, requirements: DAILY_STUDY_DURATION };
  const completed = { ...automatic, id: "policy-done", done: true };
  const homework = { ...automatic, id: "policy-homework", automationKey: undefined, title: "形策论文", requirements: "提交论文", date: "2026-11-01" };
  const notes = { ...automatic, id: "policy-notes", blocks: [{ id: "my-note", type: "text", text: "已有笔记" }], elapsed: 5 };
  const original = { ...stateFor(), courses: [policy], milestones: [automatic, homework, completed, notes] };
  const result = migrateDailyStudyTasks(original, today);
  assert.deepEqual(result.courses, original.courses);
  assert.deepEqual(result.milestones.slice(0, 2), [homework, completed]);
  assert.equal(result.milestones[2].id, notes.id);
  assert.equal(result.milestones[2].automationKey, undefined);
  assert.deepEqual(result.milestones[2].blocks, notes.blocks);
  assert.equal(migrateDailyStudyTasks(result, today), result);
});

test("excluded subjects lose pending automatic stages and daily items while manual tasks and history remain", () => {
  const courses = [course("sport", "体育/跆拳道"), course("climate", "气候与社会")];
  const automatic = (id, courseId, stage = "review") => ({ ...node(id, stage), courseId, automationKey: `study:${today}:${stage}:${courseId}:${today}`, requirements: DAILY_STUDY_DURATION });
  const manual = { ...automatic("manual", "sport"), automationKey: undefined, title: "手动作业", requirements: "自己的要求" };
  const completed = { ...automatic("done", "climate"), done: true };
  const original = { ...stateFor(), courses, milestones: [automatic("sport", "sport"), { ...automatic("later", "climate"), date: "2026-10-16" }, automatic("old", "climate", "during"), manual, completed] };
  const result = migrateDailyStudyTasks(original, today);
  assert.deepEqual(result.milestones, [manual, completed]);
  assert.equal(migrateDailyStudyTasks(result, today), result);
});

test("personal records on excluded automatic items remain as materials with their IDs and references", () => {
  const original = stateFor([{ ...node("record", "after"), courseId: "climate", requirements: DAILY_STUDY_DURATION + "\n个人笔记", blocks: [{ id: "note", type: "text", text: "已有资料" }], elapsed: 5 }]);
  original.courses = [course("climate", "气候与社会")];
  original.timeEntries = [{ id: "time", taskId: "record", targetKind: "milestone", minutes: 5, date: today, mode: "manual" }];
  const result = migrateDailyStudyTasks(original, today);
  assert.equal(result.milestones[0].id, "record");
  assert.equal(result.milestones[0].automationKey, undefined);
  assert.equal(result.milestones[0].title, "学习资料 · 气候与社会");
  assert.equal(result.milestones[0].requirements, "个人笔记");
  assert.deepEqual(result.milestones[0].blocks, original.milestones[0].blocks);
  assert.deepEqual(result.timeEntries, original.timeEntries);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result))), JSON.parse(JSON.stringify(result)));
});
