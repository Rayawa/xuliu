import { courseRunsInTimetableWeek, isCourseTitleCandidate, timetableWeekInfo } from "./timetable.ts";
import { courseNodeVisibleToday } from "./task-progress.ts";
import type { z } from "zod";
import type { workspaceStateSchema } from "./workspace-state-schema.ts";

export type StudyCourseSlot = {
  id: string;
  weekday: number;
  start: string;
  end: string;
  location: string;
  weeks?: string;
};

export type StudyCourse = {
  id: string;
  title: string;
  location: string;
  schedule: StudyCourseSlot[];
};

export type StudyTaskDraft = {
  automationKey: string;
  courseId: string;
  title: string;
  date: string;
  time: string;
  location: string;
  requirements: string;
};

export const STUDY_AUTOMATION_RULE_VERSION = 4;
export const DAILY_STUDY_DURATION = "10–20 分钟";

export function migratedStudyAutomationProcessedKeys(
  processedKeys: unknown,
  _savedRuleVersion: unknown,
  invalidKeys: ReadonlySet<string> = new Set<string>(),
) {
  return Array.isArray(processedKeys)
    ? processedKeys.filter((key): key is string => typeof key === "string" && !invalidKeys.has(key)).slice(-20_000)
    : [];
}

type StudyStage = "before" | "during" | "after";
type StudyMethod = Partial<Record<StudyStage, string>> & { skip?: boolean };

const dataLectureMethod: StudyMethod = {
  during: "看笔记并补充课堂笔记。",
  after: "用 GPT 二次整理本节学习笔记。仅用于学习整理，正式考核不使用 GenAI。",
};
const dataSeminarMethod: StudyMethod = {
  before: "先独立完成本次 Seminar 的题目。",
  during: "订正课前独立完成的题目。",
  after: "只补充本次 Seminar 中做错或不会的部分。",
};

const legacyStudyMethods: Array<{ matches: string[]; method: StudyMethod }> = [
  {
    matches: ["线性代数", "线代"],
    method: {
      before: "用 GPT 总结课本和 PPT，形成笔记并完成预习。",
      during: "看笔记、跟例题，并在原笔记上补充课堂内容。",
      after: "复习本节笔记；本单元结束时，用 GPT 总结知识框架和题型，进行一次单元总复习。",
    },
  },
  {
    matches: ["概率论"],
    method: {
      before: "用 GPT 总结课本和 PPT，形成笔记并完成预习。",
      during: "看笔记和例题，重点理解题目为什么使用当前方法。",
      after: "复习本节笔记；本单元结束时，用 GPT 总结知识框架和题型，进行一次单元总复习。",
    },
  },
  {
    matches: ["税收理论", "税法", "税务"],
    method: {
      before: "用 GPT 总结课本，形成笔记并完成预习。",
      during: "在已有笔记上补充老师强调的规则、例外和计算方法。",
      after: "练习本节税收题目，并复习笔记。",
    },
  },
  {
    matches: ["会计学基础"],
    method: {
      before: "整理或转录本节 Course Notes，形成可上课使用的 Full Course Notes，并快速预习。",
      during: "直接在转录版 Course Notes 上补充课堂笔记。",
      after: "用 GPT 整理本节笔记，再独立完成本节 Question Bank。",
    },
  },
  {
    matches: ["大数据分析"],
    method: {
      during: "Lecture 看笔记并补笔记；Seminar 订正课前独立完成的题目。",
      after: "Lecture 用 GPT 二次整理学习笔记；Seminar 只补充错题或不会的部分。正式考核不使用 GenAI。",
    },
  },
  {
    matches: ["经济学基础"],
    method: {
      before: "阅读课本，独立尝试本次 Tutorial questions；Lecture 不另外安排预习。",
      during: "看总结笔记并补充课堂内容；订正 Tutorial questions，记录不会或做错的点。",
      after: "用 GPT 最后整理一次 Lecture 笔记；Tutorial 只复习错题和相关知识点。",
    },
  },
  {
    matches: ["马克思主义", "马原"],
    method: {
      during: "结合课堂内容，在已有笔记上补充老师强调的重点。",
      after: "需要时再用 GPT 整理课本和课堂内容；本专题结束时，整理老师强调的原理、关键词和可分析的现实问题。",
    },
  },
  {
    matches: ["气候与社会", "文献检索", "会计学专业导论"],
    method: { skip: true },
  },
];

function normalizedTitle(title: string) {
  return title.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function isPriorityStudyCourse(title: string) {
  const normalized = normalizedTitle(title);
  return ["概率论", "线性代数", "线代", "税收理论", "税法", "税务", "会计学基础"].some((course) => normalized.includes(course));
}

export function dailyStudyTitle(courseTitle: string) {
  return `${normalizedTitle(courseTitle).includes("会计学基础") ? "复习" : "自学"} · ${courseTitle}`.slice(0, 500);
}

function dailyStudyKey(date: string, courseId: string) {
  return `study:${date}:review:${courseId}:${date}`;
}

function isExcludedStudyCourse(title: string) {
  const normalized = normalizedTitle(title);
  return ["跆拳道", "气候与社会"].some((course) => normalized.includes(course));
}

export function courseUsesAutomatedStudyPlan(title: string) {
  return isCourseTitleCandidate(title) && !isExcludedStudyCourse(title);
}

function weekdayOf(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function sessionsForDate(courses: StudyCourse[], date: string, termStartDate: string) {
  const week = timetableWeekInfo(date, termStartDate);
  if (!week) return [];
  const weekday = weekdayOf(date);
  return courses.filter((course) => isCourseTitleCandidate(course.title) && courseUsesAutomatedStudyPlan(course.title)).flatMap((course) => {
    const slots = course.schedule
      .filter((slot) => slot.weekday === weekday && courseRunsInTimetableWeek(slot.weeks, week.timetableWeek))
      .sort((left, right) => left.start.localeCompare(right.start));
    return slots.length ? [{ course, slots }] : [];
  });
}

const automaticStudySource = "由“课表学习计划”依据 Obsidian《学习首页》自动创建。";
// Recognize old generated instructions only; custom requirements must never be overwritten.
const generatedMethodLines = new Set([
  ...legacyStudyMethods.flatMap(({ method }) => Object.values(method).filter((value): value is string => typeof value === "string")),
  ...Object.values(dataLectureMethod),
  ...Object.values(dataSeminarMethod),
  "用 GPT 分析已有错题、总结本节题型，再复习笔记并完成自测。",
  "结合本节规则完成自主练习，再复习笔记。",
  "用 GPT 整理本节笔记，再独立练习本节 Question Bank。",
  "Lecture 用 GPT 总结 PPT 并预习；Seminar 先独立完成练习题。",
  "Lecture 看笔记并补笔记；Seminar 订正答案；Workshop 实际完成操作。",
  "Lecture 用 GPT 二次整理笔记；Seminar 只补充错题或不会的部分；Workshop 独立重做关键操作。",
  "Lecture 用 GPT 总结 PPT 和课本并预习；Tutorial 阅读课本并完成练习题。",
  "Lecture 根据总结笔记补充课堂内容；Tutorial 订正练习题并记录不会或做错的点。",
  "Lecture 用 GPT 最后整理一次笔记；Tutorial 只复习错题和相关知识点。",
  "需要时用 GPT 整理课本和课堂内容；专题结束时整理老师强调的原理、关键词和可分析的现实问题。",
].filter((value): value is string => typeof value === "string").map((instruction) => `学习方法：${instruction}`));

export function createDailyStudyTaskPlan(courses: StudyCourse[], currentDate: string, termStartDate: string) {
  return sessionsForDate(courses, currentDate, termStartDate).map(({ course }): StudyTaskDraft => ({
    automationKey: dailyStudyKey(currentDate, course.id), courseId: course.id,
    title: dailyStudyTitle(course.title), date: currentDate, time: "20:00", location: "",
    requirements: DAILY_STUDY_DURATION,
  }));
}

export function dailyStudyPlanChanges(
  nodes: { automationKey?: string; courseId?: string; date: string; plannedDate?: string }[],
  planned: StudyTaskDraft[], processedKeys: string[],
) {
  const processed = new Set(processedKeys);
  const existing = new Set(nodes.map((node) => node.automationKey));
  const covered = new Set(nodes.filter((node) => node.courseId && node.automationKey?.startsWith("study:") && node.automationKey.split(":")[2] === "review")
    .map((node) => dailyStudyKey(node.plannedDate || node.date, node.courseId!)));
  const additions: StudyTaskDraft[] = [];
  for (const draft of planned) {
    if (processed.has(draft.automationKey)) continue;
    if (!existing.has(draft.automationKey) && !covered.has(draft.automationKey)) additions.push(draft);
    processed.add(draft.automationKey);
  }
  return additions.length || processed.size !== new Set(processedKeys).size ? { additions, processedKeys: [...processed].slice(-20_000) } : null;
}

type StudyState = Pick<z.infer<typeof workspaceStateSchema>, "courses" | "milestones" | "tasks" | "timeEntries" | "studyAutomation" | "timetableSettings">;
type StudyNode = StudyState["milestones"][number];
const legacyStudyKey = /^study:(\d{4}-\d{2}-\d{2}):(before|during|after):(.+):(\d{4}-\d{2}-\d{2})$/;

export function studyTaskVisibleOnDate(node: Pick<StudyNode, "automationKey" | "date" | "plannedDate" | "courseId" | "mode" | "done" | "completedDate" | "dismissedTodayDate">, date: string) {
  if (node.dismissedTodayDate === date) return false;
  if (node.done) return courseNodeVisibleToday(node, date);
  return node.automationKey?.split(":")[2] === "review" && node.plannedDate ? node.plannedDate === date : courseNodeVisibleToday(node, date);
}

function personalRequirements(requirements: string) {
  return requirements.split("\n").filter((line) => line !== automaticStudySource && line !== DAILY_STUDY_DURATION
    && !generatedMethodLines.has(line) && !/^对应课程：\d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}/.test(line)).join("\n").trim();
}

export function migrateDailyStudyTasks<T extends StudyState>(state: T, currentDate: string): T {
  const todayCourseIds = new Set(createDailyStudyTaskPlan(state.courses, currentDate, state.timetableSettings?.termStartDate ?? "").map((draft) => draft.courseId));
  const courses = new Map(state.courses.map((course) => [course.id, course]));
  const referencedIds = new Set([
    ...state.tasks.map((task) => task.parentMilestoneId).filter(Boolean),
    ...state.timeEntries.filter((entry) => entry.targetKind === "milestone").map((entry) => entry.taskId),
  ]);
  const hasRecords = (node: StudyNode) => Boolean(personalRequirements(node.requirements) || node.attachments?.length || node.outcomeText || node.outcomeAttachments?.length || node.blocks?.length || node.elapsed || referencedIds.has(node.id) || node.mode === "multi");
  const groups = new Map<string, { date: string; courseId: string; nodes: StudyNode[]; postponed: boolean }>();
  const removals = new Set<string>();
  const replacements = new Map<string, StudyNode>();
  const processed = new Set(state.studyAutomation?.processedKeys ?? []);
  for (const node of state.milestones) {
    const course = node.courseId ? courses.get(node.courseId) : undefined;
    if (!node.done && course && node.automationKey?.startsWith("study:") && isExcludedStudyCourse(course.title)) {
      if (hasRecords(node)) replacements.set(node.id, { ...node, automationKey: undefined, title: `学习资料 · ${course.title}`.slice(0, 500), requirements: personalRequirements(node.requirements) });
      else removals.add(node.id);
      continue;
    }
    const match = legacyStudyKey.exec(node.automationKey ?? "");
    if (!match || node.done || !node.courseId || !courses.has(node.courseId)) continue;
    const postponed = Boolean(node.plannedDate || node.date !== match[1]);
    const date = node.plannedDate || (postponed ? node.date : match[4]);
    const key = dailyStudyKey(date, node.courseId);
    const group = groups.get(key) ?? { date, courseId: node.courseId, nodes: [], postponed: false };
    group.nodes.push(node); group.postponed ||= postponed; groups.set(key, group);
    removals.add(node.id);
    if (postponed) processed.add(dailyStudyKey(match[4], node.courseId));
  }
  if (!groups.size && !removals.size && !replacements.size) return state;
  const idMap = new Map<string, string>();
  for (const [key, group] of groups) {
    const existing = state.milestones.find((node) => node.automationKey === key && !removals.has(node.id));
    const nodes = existing ? [existing, ...group.nodes] : group.nodes;
    const records = nodes.filter(hasRecords);
    if (!existing && !records.length && !group.postponed && (group.date !== currentDate || !todayCourseIds.has(group.courseId))) continue;
    const keeper = existing ?? nodes.find((node) => node.plannedDate) ?? records[0] ?? nodes.find((node) => node.automationKey?.includes(":after:")) ?? nodes[0];
    const requirements = [DAILY_STUDY_DURATION, ...nodes.map((node) => personalRequirements(node.requirements)).filter(Boolean)].join("\n");
    const attachments = nodes.flatMap((node) => node.attachments ?? []);
    const outcomeAttachments = nodes.flatMap((node) => node.outcomeAttachments ?? []);
    const blocks = nodes.flatMap((node) => node.blocks ?? []);
    const outcomeText = nodes.map((node) => node.outcomeText).filter(Boolean).join("\n");
    const elapsed = nodes.reduce((sum, node) => sum + (node.elapsed ?? 0), 0);
    // Keep separate records if merging would exceed the existing storage limits.
    if (requirements.length > 4000 || outcomeText.length > 4000 || attachments.length > 50 || outcomeAttachments.length > 50 || blocks.length > 2000 || elapsed > 10_000_000) {
      for (const node of group.nodes.filter(hasRecords)) replacements.set(node.id, { ...node, automationKey: undefined, title: `学习资料 · ${courses.get(group.courseId)!.title}`.slice(0, 500), requirements: personalRequirements(node.requirements) });
      continue;
    }
    const merged: StudyNode = {
      ...keeper, automationKey: key, title: existing?.title ?? dailyStudyTitle(courses.get(group.courseId)!.title),
      date: existing?.date ?? (keeper.plannedDate ? keeper.date : group.date), time: existing?.time ?? (group.postponed ? keeper.time : "20:00"), requirements,
      ...(attachments.length ? { attachments } : {}), ...(outcomeAttachments.length ? { outcomeAttachments } : {}),
      ...(blocks.length ? { blocks } : {}), ...(outcomeText ? { outcomeText } : {}), ...(elapsed ? { elapsed } : {}),
    };
    replacements.set(keeper.id, merged); processed.add(key);
    for (const node of nodes) idMap.set(node.id, keeper.id);
  }
  const milestones = state.milestones.flatMap((node) => replacements.has(node.id) ? [replacements.get(node.id)!] : removals.has(node.id) ? [] : [node]);
  return {
    ...state, milestones,
    tasks: state.tasks.map((task) => task.parentMilestoneId && idMap.has(task.parentMilestoneId) ? { ...task, parentMilestoneId: idMap.get(task.parentMilestoneId) } : task),
    timeEntries: state.timeEntries.map((entry) => entry.targetKind === "milestone" && idMap.has(entry.taskId) ? { ...entry, taskId: idMap.get(entry.taskId)! } : entry),
    studyAutomation: { enabled: state.studyAutomation?.enabled !== false, processedKeys: [...processed].slice(-20_000), ruleVersion: STUDY_AUTOMATION_RULE_VERSION },
  };
}
