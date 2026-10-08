import { addDays, courseRunsInTimetableWeek, isCourseTitleCandidate, timetableWeekInfo } from "./timetable.ts";

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

export const STUDY_AUTOMATION_RULE_VERSION = 3;

export function migratedStudyAutomationProcessedKeys(
  processedKeys: unknown,
  savedRuleVersion: unknown,
  invalidKeys: ReadonlySet<string> = new Set<string>(),
) {
  if (savedRuleVersion !== STUDY_AUTOMATION_RULE_VERSION) return [];
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

const studyMethods: Array<{ matches: string[]; method: StudyMethod }> = [
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

export function isUnneededPreparationTask(automationKey: string | undefined, courseTitle: string) {
  if (!automationKey?.startsWith("study:") || automationKey.split(":")[2] !== "before") return false;
  const classDate = automationKey.split(":").at(-1) ?? "";
  return !methodFor(courseTitle, classDate)?.before;
}

function methodFor(title: string, classDate = ""): StudyMethod | null {
  const normalized = normalizedTitle(title);
  if (normalized.includes("大数据分析")) {
    // Confirmed timetable: Wednesday Lecture, Thursday Seminar. Explicit class labels take precedence.
    if (/seminar|workshop|研讨|实践/.test(normalized)) return dataSeminarMethod;
    if (/lecture|讲授/.test(normalized)) return dataLectureMethod;
    if (/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
      if (weekdayOf(classDate) === 3) return dataLectureMethod;
      if (weekdayOf(classDate) === 4) return dataSeminarMethod;
    }
  }
  return studyMethods.find((entry) => entry.matches.some((match) => normalized.includes(normalizedTitle(match))))?.method ?? null;
}

export function courseUsesAutomatedStudyPlan(title: string) {
  const method = methodFor(title);
  return Boolean(method && !method.skip);
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

function minutesToTime(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function afterClassTime(end: string) {
  const [hours, minutes] = end.split(":").map(Number);
  const oneHourLater = (hours * 60) + minutes + 60;
  return minutesToTime(Math.max(20 * 60, oneHourLater));
}

function stageDraft(currentDate: string, classDate: string, session: ReturnType<typeof sessionsForDate>[number], stage: StudyStage): StudyTaskDraft | null {
  const method = methodFor(session.course.title, classDate);
  const instruction = method?.[stage];
  if (!method || method.skip || !instruction) return null;
  const first = session.slots[0];
  const last = session.slots[session.slots.length - 1];
  const locations = [...new Set(session.slots.map((slot) => slot.location || session.course.location).filter(Boolean))];
  const location = locations.join(" / ").slice(0, 500);
  const stageLabel = stage === "before" ? "课前准备" : stage === "during" ? "课上重点" : "课后闭环";
  const classLabel = `${classDate} ${first.start}-${last.end}${location ? ` · ${location}` : ""}`;
  return {
    automationKey: `study:${currentDate}:${stage}:${session.course.id}:${classDate}`,
    courseId: session.course.id,
    title: `${stageLabel} · ${session.course.title}`,
    date: currentDate,
    time: stage === "before" ? "20:00" : stage === "during" ? first.start : afterClassTime(last.end),
    location: stage === "during" ? location : "",
    requirements: `对应课程：${classLabel}\n学习方法：${instruction}\n${automaticStudySource}`,
  };
}

const automaticStudySource = "由“课表学习计划”依据 Obsidian《学习首页》自动创建。";
// Recognize old generated instructions only; custom requirements must never be overwritten.
const generatedMethodLines = new Set([
  ...studyMethods.flatMap(({ method }) => Object.values(method).filter((value): value is string => typeof value === "string")),
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

export function refreshDailyStudyTaskMethods<T extends { automationKey?: string; requirements?: string; done: boolean }>(
  nodes: T[], planned: StudyTaskDraft[],
): T[] {
  const draftsByKey = new Map(planned.map((draft) => [draft.automationKey, draft]));
  let changed = false;
  const refreshed = nodes.map((node) => {
    const draft = node.automationKey ? draftsByKey.get(node.automationKey) : undefined;
    if (!draft || node.done || !node.requirements) return node;
    const lines = node.requirements.split("\n");
    if (!lines.includes(automaticStudySource)) return node;
    const methodIndex = lines.findIndex((line) => line.startsWith("学习方法："));
    if (methodIndex < 0 || !generatedMethodLines.has(lines[methodIndex])) return node;
    const currentMethod = draft.requirements.split("\n").find((line) => line.startsWith("学习方法："));
    if (!currentMethod || lines[methodIndex] === currentMethod) return node;
    lines[methodIndex] = currentMethod;
    changed = true;
    return { ...node, requirements: lines.join("\n") };
  });
  return changed ? refreshed : nodes;
}

export function createDailyStudyTaskPlan(courses: StudyCourse[], currentDate: string, termStartDate: string) {
  const todaySessions = sessionsForDate(courses, currentDate, termStartDate);
  const tomorrowDate = addDays(currentDate, 1);
  const tomorrowSessions = sessionsForDate(courses, tomorrowDate, termStartDate);
  return [
    ...todaySessions.flatMap((session) => [stageDraft(currentDate, currentDate, session, "during"), stageDraft(currentDate, currentDate, session, "after")]),
    ...tomorrowSessions.map((session) => stageDraft(currentDate, tomorrowDate, session, "before")),
  ].filter((task): task is StudyTaskDraft => Boolean(task));
}
