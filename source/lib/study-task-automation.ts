import { addDays, courseRunsInTimetableWeek, timetableWeekInfo } from "./timetable.ts";

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

type StudyStage = "before" | "during" | "after";
type StudyMethod = Partial<Record<StudyStage, string>> & { skip?: boolean };

const genericMethod: Required<Omit<StudyMethod, "skip">> = {
  before: "查看本节资料，明确学习目标、主线和需要带到课堂的问题。",
  during: "记录老师强调的概念、例题、方法选择和仍未解决的问题。",
  after: "整理课堂补充，独立完成练习，并记录错因与下一步复习重点。",
};

const studyMethods: Array<{ matches: string[]; method: StudyMethod }> = [
  {
    matches: ["线性代数"],
    method: {
      before: "用 GPT 根据教材或 PPT 整理本节主线、概念、公式和关键例题，快速预习，不追求一次学透。",
      during: "重点观察老师怎样做例题、怎样选择方法，并把课堂补充直接记回已有笔记。",
      after: "先独立完成作业，再分析题型、错因和通法，最后回到笔记完成自测。",
    },
  },
  {
    matches: ["概率论"],
    method: {
      before: "根据教材或 PPT 快速预习，先搞清这节课要解决什么随机问题。",
      during: "例题优先关注为什么选择这个模型、为什么这样计数，不只抄答案。",
      after: "按时完成作业和慕课测试；独立做题后总结题型、错因和常见变式。",
    },
  },
  {
    matches: ["税收理论", "税法"],
    method: {
      before: "整理本节税种框架，先明确谁交、什么行为交、怎样计算。",
      during: "补充老师强调的计算口径、特殊规定、例外和考试提示。",
      after: "完成作业和对应计算题，并记录判断错在哪里、遗漏了什么条件。",
    },
  },
  {
    matches: ["会计学基础"],
    method: {
      before: "把本节 Course Notes 整理成可上课使用的 Full Course Notes，快速看一遍主线和术语。",
      during: "直接在 Full Course Notes 上补充老师解释、例题和考试提示，不另建重复笔记。",
      after: "整理课堂补充，独立完成本节 Question Bank，并分析错题原因。",
    },
  },
  {
    matches: ["大数据分析"],
    method: {
      before: "Lecture 根据 PPT 做简明笔记；如为 Seminar 或 Workshop，先独立完成实践任务。",
      during: "Lecture 补方法解释；Seminar 或 Workshop 重点订正，并记录任务、数据、方法、操作、输出和解释。",
      after: "如为 Seminar 或 Workshop，不依赖 AI 独立重做一次，并补全本周实践记录。",
    },
  },
  {
    matches: ["经济学基础"],
    method: {
      before: "Lecture 根据 PPT 和教材简明预习；Tutorial 先读指定教材并独立完成问题。",
      during: "记录图形、因果关系和易混概念；Tutorial 重点订正并记录老师的判断逻辑。",
      after: "Lecture 整理一次课堂补充；Tutorial 只整理错题和概念混淆点。",
    },
  },
  {
    matches: ["马克思主义", "马原"],
    method: {
      during: "保证出勤和课堂纪律，重点记录老师反复强调的概念、表述和材料分析思路。",
      after: "结合教材和课堂内容整理成“概念 → 原理 → 为什么 → 可分析什么现实问题”。",
    },
  },
  {
    matches: ["文献检索"],
    method: {
      before: "明确本节要练习的检索或数据工具，并准备把课堂作业积累为报告素材。",
      during: "掌握实际工具操作；调整检索式、筛选文献和获取数据时及时保留截图。",
      after: "整理课堂作业、检索记录和证据截图，纳入文献调研报告素材。",
    },
  },
  {
    matches: ["会计学专业导论"],
    method: { skip: true },
  },
];

function normalizedTitle(title: string) {
  return title.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function methodFor(title: string): StudyMethod {
  const normalized = normalizedTitle(title);
  return studyMethods.find((entry) => entry.matches.some((match) => normalized.includes(normalizedTitle(match))))?.method ?? genericMethod;
}

function weekdayOf(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function sessionsForDate(courses: StudyCourse[], date: string, termStartDate: string) {
  const week = timetableWeekInfo(date, termStartDate);
  if (!week) return [];
  const weekday = weekdayOf(date);
  return courses.flatMap((course) => {
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
  const method = methodFor(session.course.title);
  const instruction = method[stage];
  if (method.skip || !instruction) return null;
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
    requirements: `对应课程：${classLabel}\n学习方法：${instruction}\n由“课表学习计划”依据 Obsidian《学习首页》自动创建。`,
  };
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
