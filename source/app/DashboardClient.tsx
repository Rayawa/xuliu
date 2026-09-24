"use client";

import Image from "next/image";
import FocusTimer, { useFocusTimer, type FocusController, type FocusChoice } from "./FocusTimer";
import { appendTimeEntry, defaultFocusSettings, descendantTasks, detachRemovedParents, entryMatches, parentError, type FocusSettings, type TimeEntry, type WorkTarget } from "@/lib/task-time";
import { upload as uploadBlob } from "@vercel/blob/client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import AiAssistant from "./AiAssistant";
import { aiDisabledReasonForSync, type WorkspaceSyncState } from "@/lib/ai-availability";
import FinanceView from "./FinanceView";
import { ReminderScheduler, type DueReminder } from "@/lib/reminder-scheduler";
import { useReminderAlerts } from "./useReminderAlerts";
import ReminderAlertsSettings from "./ReminderAlertsSettings";
import EyeRestCycle from "./EyeRestCycle";
import { CourseNodeForm, CourseNodeEditor, type CourseNode } from "./CourseNodes";
import WebsiteCollection, { CollectionForm } from "./ToolCollections";
import { toolCollectionFields, type ToolCollectionFields } from "@/lib/tool-collections";
import { createInitialFinanceState, createPreviewFinanceState, normalizeFinanceState, type FinanceState } from "@/lib/finance";
import { taskModeOf, taskOverlapsRange, taskProgressOf, taskScheduleSummary, taskScheduledForDate, taskStatusOf, taskStatusOptions, taskVisibleToday, type TaskMode, type TaskProgressStatus } from "@/lib/task-progress";
import { updateAcademicCourses, courseContentPreserved } from "@/lib/academic-course-update";
import { parseAcademicRows, parseAcademicIcs, groupImportedCourses, parseDelimitedRows, importWeekday } from "@/lib/academic-import";
import { addDays, courseRunsInTimetableWeek, extractScheduleLocation, extractScheduleWeekRule, extractScheduleWeekday, isCourseTitleCandidate, officialTimetableRows, periodTimeRange, repairImportedTimetableSlot, splitScheduleEntries, timetableRowIndex, timetableWeekInfo } from "@/lib/timetable";
import { courseUsesAutomatedStudyPlan, createDailyStudyTaskPlan } from "@/lib/study-task-automation";

type NavId = "today" | "timetable" | "tasks" | "calendar" | "review" | "finance" | "school" | "learning" | "thoughts" | "work" | "ideas" | "tools" | "life" | "free";
type Area = "课内" | "课外" | "工作" | "生活" | "思考";
type BlockType = "heading" | "text" | "checklist" | "image" | "table" | "link" | "file";
type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: "small" | "normal" | "large" | "xlarge";
  fontFamily?: "sans" | "serif" | "mono";
};
type StoredAttachment = {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
};
type EmbeddedImage = StoredAttachment & {
  caption?: string;
};
export type Block = {
  id: string; type: BlockType; text?: string; checked?: boolean; url?: string; rows?: string[][];
  inlineRuns?: InlineRun[];
  embeddedImages?: EmbeddedImage[];
  embeddedFiles?: StoredAttachment[];
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
  headingLevel?: 1 | 2 | 3;
  color?: string;
  backgroundColor?: string;
  fontSize?: "small" | "normal" | "large" | "xlarge";
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right";
  fontFamily?: "sans" | "serif" | "mono";
};
type Milestone = CourseNode;
type TaskProgressLog = { id: string; date: string; progress: number; status: TaskProgressStatus; note: string };
type TaskItem = { parentId?: string; parentMilestoneId?: string; courseId?: string; requirements?: string; parentCandidate?: boolean; blocks?: Block[]; id: string; title: string; area: Area; source: string; due?: string; done: boolean; today: boolean; elapsed: number; mode?: TaskMode; startDate?: string; status?: TaskProgressStatus; progress?: number; progressLogs?: TaskProgressLog[] };
type PageNode = { id: string; space: "thoughts" | "free"; parentId: string | null; title: string; kind: "folder" | "page"; blocks: Block[] };
type CourseSlot = { id: string; weekday: number; start: string; end: string; location: string; weeks?: string; source?: "manual" | "pku" | "bit" | "ics" };
type AcademicImportPreset = "pku" | "bit";
type Course = { id: string; title: string; term: string; teacher: string; location: string; school?: AcademicImportPreset; progress: number; requirements: string; schedule: CourseSlot[]; blocks: Block[] };
type ImportedCourse = {
  key: string;
  title: string;
  teacher: string;
  location: string;
  weeks: string;
  school: AcademicImportPreset;
  schedule: Omit<CourseSlot, "id">[];
};
type LearningArea = { id: string; title: string; category: string; progress: number; goal: string; resources: { id: string; title: string; type: string; url: string; progress: number }[]; blocks: Block[] };
type ResearchPage = { id: string; title: string; blocks: Block[] };
type ResearchProject = { id: string; title: string; status: string; summary: string; objective: string; next: string; progress: number; pages: ResearchPage[]; question?: string; assumption?: string; blocks?: Block[] };
type ToolVersion = { id: string; label: string; url: string; note: string; createdAt: string };
type ToolItem = ToolCollectionFields & { id: string; title: string; status: string; description: string; url: string; version: string; currentVersionId?: string; versions?: ToolVersion[]; blocks: Block[] };
type Reminder = { id: string; title: string; type: "exercise" | "break" | "sleep" | "custom"; times: string[]; time?: string; intervalMinutes?: number; enabled: boolean; lastFired?: string; snoozedUntil?: number };
type Habit = { id: string; title: string; streak: number; today: boolean; schedule: string; lastCompletedDate?: string };
type AppState = {
  version: 6;
  tasks: TaskItem[];
  milestones: Milestone[];
  courses: Course[];
  learning: LearningArea[];
  research: ResearchProject[];
  ideas: { id: string; title: string; note: string; createdAt: string }[];
  tools: ToolItem[];
  habits: Habit[];
  routines: { id: string; title: string; note: string }[];
  reminders: Reminder[];
  media: { id: string; title: string; kind: "书籍" | "动画" | "影视"; status: "正在看" | "想看" | "书单"; progress: string; blocks: Block[] }[];
  recipes: { id: string; title: string; ingredients: string; note: string; blocks: Block[] }[];
  pages: PageNode[];
  daily: Record<string, { note: string; gain: string; problem: string; feeling: string; tomorrow: string }>;
  timeEntries: TimeEntry[];
  focusSettings?: FocusSettings;
  finance: FinanceState;
  timetableSettings: { termStartDate: string; activeSchool: AcademicImportPreset };
  studyAutomation: { enabled: boolean; processedKeys: string[] };
  themes: Record<string, string>;
};

type DetailTarget = { type: "course" | "learning" | "research" | "tool" | "media" | "recipe"; id: string } | null;
type DialogField = { name: string; label: string; type?: "text" | "textarea" | "date" | "time" | "number" | "select"; value?: string; placeholder?: string; options?: string[] };
type DialogConfig = { title: string; description?: string; submitLabel?: string; fields: DialogField[]; danger?: boolean; onSubmit: (values: Record<string, string>) => void } | null;
type PopupState = { eyebrow: string; title: string; body: string; reminderId?: string } | null;
export type WorkspaceAccount = { id: "owner" | "partner" | "lxs" | "raychen"; username: string; displayName: string };
type EditorAccess = { ownerId: WorkspaceAccount["id"]; readOnly: boolean; preview: boolean };

const uid = () => Math.random().toString(36).slice(2, 10);
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = dateKey();
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const reminderTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const defaultReminderTimes: Record<Exclude<Reminder["type"], "break">, string> = { exercise: "18:00", sleep: "23:00", custom: "12:00" };

function previousDateKey(currentDate: string) {
  const [year, month, day] = currentDate.split("-").map(Number);
  const previous = new Date(year, month - 1, day);
  previous.setDate(previous.getDate() - 1);
  return dateKey(previous);
}

function normalizedHabit(habit: Habit, currentDate = dateKey()): Habit {
  let lastCompletedDate = typeof habit.lastCompletedDate === "string" && dateKeyPattern.test(habit.lastCompletedDate) ? habit.lastCompletedDate : undefined;
  if (!lastCompletedDate && habit.today) lastCompletedDate = currentDate;
  if (lastCompletedDate === currentDate && habit.today === false) lastCompletedDate = undefined;
  const streak = lastCompletedDate && lastCompletedDate < previousDateKey(currentDate) ? 0 : habit.streak;
  return { ...habit, streak, today: lastCompletedDate === currentDate, lastCompletedDate };
}

function toggledHabit(habit: Habit, currentDate = dateKey()): Habit {
  const current = normalizedHabit(habit, currentDate);
  if (current.today) {
    const streak = Math.max(0, current.streak - 1);
    return { ...current, today: false, streak, lastCompletedDate: streak > 0 ? previousDateKey(currentDate) : undefined };
  }
  const streak = current.lastCompletedDate === previousDateKey(currentDate) ? current.streak + 1 : 1;
  return { ...current, today: true, streak, lastCompletedDate: currentDate };
}

function normalizedReminder(reminder: Reminder): Reminder {
  const times = [...new Set((Array.isArray(reminder.times) ? reminder.times : []).filter((time) => reminderTimePattern.test(time)))];
  const enabled = reminder.enabled !== false;
  if (reminder.type === "break") {
    const interval = Number(reminder.intervalMinutes);
    return { ...reminder, enabled, times, intervalMinutes: Number.isFinite(interval) && interval >= 5 ? Math.min(1_440, Math.round(interval)) : 20 };
  }
  const legacyTime = typeof reminder.time === "string" && reminderTimePattern.test(reminder.time) ? reminder.time : undefined;
  const validTimes = times.length ? times : legacyTime ? [legacyTime] : enabled ? [defaultReminderTimes[reminder.type]] : [];
  return { ...reminder, enabled, times: validTimes, intervalMinutes: undefined };
}

function pageTreeIds(pages: PageNode[], rootId: string) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        changed = true;
      }
    }
  }
  return ids;
}
const starterPrompt = "从这里开始记录，也可以把图片或资料直接拖进下方笔记区。";
const starterHeadings = new Set(["课程资料与笔记", "学习路线与笔记", "产品说明与迭代记录", "记录", "步骤与调整", "开始记录", "研究总览", "资料与线索", "阶段结论", "研究记录"]);
const starterBlocks = (_title: string): Block[] => [];
function cleanStarterBlocks(blocks?: Block[], expectedTitle?: string): Block[] {
  if (!Array.isArray(blocks)) return [];
  const heading = blocks[0];
  const generatedHeading = heading?.type === "heading" && typeof heading.text === "string" && (starterHeadings.has(heading.text) || heading.text === expectedTitle);
  if (blocks.length === 2 && generatedHeading && blocks[1]?.type === "text" && blocks[1]?.text === starterPrompt) return [];
  return blocks;
}
function labeledAiNoteBlocks(label: string, value: string): Block[] {
  const text = `${label}\n${value.trim()}`;
  const blocks: Block[] = [];
  for (let offset = 0; offset < text.length; offset += 4_000) {
    blocks.push({ id: uid(), type: "text", text: text.slice(offset, offset + 4_000) });
  }
  return blocks;
}
function aiCourseAnswerBlocks(question: string, answer: string): Block[] {
  const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date());
  return [
    { id: uid(), type: "heading", text: `AI 课堂问答 · ${date}`, headingLevel: 2 },
    ...labeledAiNoteBlocks("问题：", question || "课堂问题"),
    ...labeledAiNoteBlocks("回答：", answer),
  ];
}
const starterResearchPages = (blocks?: Block[]): ResearchPage[] => [
  { id: uid(), title: "研究总览", blocks: cleanStarterBlocks(blocks) },
  { id: uid(), title: "资料与线索", blocks: starterBlocks("资料与线索") },
  { id: uid(), title: "阶段结论", blocks: starterBlocks("阶段结论") },
];

const importWeekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const academicSchoolLabels: Record<AcademicImportPreset, string> = { pku: "北京大学", bit: "北京理工大学" };
function courseSchool(course: Course): AcademicImportPreset {
  if (course.school) return course.school;
  if (course.schedule.some((slot) => slot.source === "bit")) return "bit";
  return "pku";
}

function normalizedCourseSchedule(slots: CourseSlot[] | undefined, school: AcademicImportPreset) {
  const normalized = (Array.isArray(slots) ? slots : []).map((slot) => repairImportedTimetableSlot(slot, school));
  const seen = new Set<string>();
  return normalized.filter((slot) => {
    const key = [slot.weekday, slot.start, slot.end, slot.location, slot.weeks ?? ""].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function parseAcademicFile(file: File, preset: AcademicImportPreset) {
  if (/\.ics$/i.test(file.name) || file.type === "text/calendar") return parseAcademicIcs(await file.text(), preset);
  if (/\.xls$/i.test(file.name)) throw new Error("为确保文件解析安全，请从教务系统导出 .xlsx、.csv 或 .ics 文件；旧版 .xls 暂不支持。");
  let sheets: unknown[][][];
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    sheets = [parseDelimitedRows(await file.text())];
  } else if (/\.xlsx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    sheets = (await readExcelFile(file)).map((sheet) => sheet.data as unknown[][]);
  } else {
    throw new Error("文件格式不支持，请上传 .xlsx、.csv 或 .ics 文件。");
  }
  const parsed = sheets.flatMap((rows) => parseAcademicRows(rows, preset));
  const flattened = parsed.flatMap((course) => course.schedule.map((slot) => ({ title: course.title, teacher: course.teacher, location: course.location, weeks: course.weeks, school: course.school, slot })));
  return groupImportedCourses(flattened);
}

const defaultLearningAreas: LearningArea[] = [
  { id: "learning-default-development", title: "开发", category: "技术", progress: 0, goal: "", resources: [], blocks: [] },
  { id: "learning-default-professional", title: "专业学习", category: "专业", progress: 0, goal: "", resources: [], blocks: [] },
  { id: "learning-default-photography", title: "摄影", category: "兴趣", progress: 0, goal: "", resources: [], blocks: [] },
  { id: "learning-default-japanese", title: "日语", category: "语言", progress: 0, goal: "", resources: [], blocks: [] },
];

function withDefaultLearningAreas(items: LearningArea[]) {
  const titles = new Set(items.map((item) => item.title.trim()));
  return [...items, ...defaultLearningAreas.filter((item) => !titles.has(item.title)).map((item) => ({ ...item, resources: [], blocks: [] }))];
}

const initialState: AppState = {
  version: 6,
  tasks: [],
  milestones: [],
  courses: [],
  learning: withDefaultLearningAreas([]),
  research: [],
  ideas: [],
  tools: [],
  habits: [],
  routines: [],
  reminders: [],
  media: [],
  recipes: [],
  pages: [],
  daily: {},
  timeEntries: [],
  finance: createInitialFinanceState(),
  timetableSettings: { termStartDate: "2026-08-31", activeSchool: "pku" },
  studyAutomation: { enabled: true, processedKeys: [] },
  themes: { today: "#718c7c", timetable: "#6d8291", tasks: "#7b846d", calendar: "#6f8295", review: "#8c7a91", finance: "#6f7f72", school: "#657f91", learning: "#80769a", thoughts: "#668476", work: "#8b7658", ideas: "#8a6f7d", tools: "#617f78", life: "#8b706d", free: "#738287" },
};

const navItems: { id: NavId; icon: string; label: string }[] = [
  { id: "today", icon: "今", label: "今日" }, { id: "timetable", icon: "课", label: "课程表" }, { id: "tasks", icon: "览", label: "任务与事项" }, { id: "calendar", icon: "历", label: "日历" }, { id: "review", icon: "复", label: "每日复盘" },
  { id: "finance", icon: "账", label: "个人记账" }, { id: "school", icon: "课", label: "课内学习" }, { id: "learning", icon: "学", label: "课外学习" }, { id: "thoughts", icon: "思", label: "思考集" },
  { id: "work", icon: "研", label: "工作研究" }, { id: "ideas", icon: "灵", label: "灵感" }, { id: "tools", icon: "具", label: "工具集" },
  { id: "life", icon: "生", label: "生活管理" }, { id: "free", icon: "＋", label: "自由空间" },
];
const areaClass: Record<Area, string> = { 课内: "study", 课外: "outside", 工作: "work", 生活: "life", 思考: "thought" };
const toneChoices = ["#718c7c", "#657f91", "#80769a", "#8b7658", "#8a6f7d", "#738287"];
const formatMinutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function withTaskCompletion(task: TaskItem, completed: boolean, at = today): TaskItem {
  if (completed) {
    return { ...task, done: true, status: "已完成", progress: 100, progressLogs: [...(task.progressLogs ?? []).slice(-1_999), { id: uid(), date: at, progress: 100, status: "已完成", note: "标记完成" }] };
  }
  const previous = [...(task.progressLogs ?? [])].reverse().find((entry) => entry.progress < 100);
  const progress = previous?.progress ?? Math.min(taskProgressOf(task), 99);
  const status: TaskProgressStatus = progress > 0 ? "进行中" : "未开始";
  return { ...task, done: false, status, progress, progressLogs: [...(task.progressLogs ?? []).slice(-1_999), { id: uid(), date: at, progress, status, note: "重新打开任务" }] };
}

function postponeTask(task: TaskItem, days = 1): TaskItem {
  const fallbackDate = taskModeOf(task) === "multi" && task.startDate && task.startDate > today ? task.startDate : today;
  const baseDate = task.due && dateKeyPattern.test(task.due) ? task.due : fallbackDate;
  const due = addDays(baseDate, days);
  return { ...task, due, today: taskModeOf(task) === "single" && due === today };
}

function hydrateState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") return initialState;
  const saved = raw as Partial<AppState> & { resources?: { id: string; title: string; type: string; progress: number; url?: string; note?: string }[] };
  const savedVersion = Number((raw as { version?: unknown }).version ?? 0);
  const courses = Array.isArray(saved.courses) ? saved.courses.map((item) => {
    const school: AcademicImportPreset = item.school === "bit" || item.schedule?.some((slot) => slot.source === "bit") ? "bit" : "pku";
    const rootLocationText = item.location ?? "";
    const rootLocationHasSchedule = Boolean(extractScheduleWeekRule(rootLocationText) || importWeekday(rootLocationText) || periodTimeRange(rootLocationText, school));
    return {
      id: item.id ?? uid(), title: item.title ?? "", term: item.term ?? "", teacher: item.teacher ?? "", location: rootLocationHasSchedule ? extractScheduleLocation(rootLocationText) : rootLocationText,
      school: item.school, progress: item.progress ?? 0, requirements: item.requirements ?? "", schedule: normalizedCourseSchedule(item.schedule, school), blocks: cleanStarterBlocks(item.blocks),
    };
  }) : [];
  const normalizedLearning = Array.isArray(saved.learning) ? saved.learning.map((item) => ({ ...item, resources: item.resources ?? [], blocks: cleanStarterBlocks(item.blocks) })) : saved.resources?.map((item) => ({ id: item.id, title: item.title, category: item.type, progress: item.progress, goal: item.note ?? "", resources: [{ id: uid(), title: item.title, type: item.type, url: item.url ?? "", progress: item.progress }], blocks: [] })) ?? [];
  const learning = savedVersion < 6 ? withDefaultLearningAreas(normalizedLearning) : normalizedLearning;
  const tasks = Array.isArray(saved.tasks) ? saved.tasks.map((item) => {
    const mode = taskModeOf(item);
    const progress = taskProgressOf(item);
    const status = taskStatusOf(item);
    return {
      ...item, mode, progress, status, done: status === "已完成",
      courseId: item.courseId ?? courses.find((course) => course.title === item.source)?.id,
      requirements: item.requirements ?? "",
      parentCandidate: item.parentCandidate ?? (mode === "multi" || saved.tasks!.some((child) => child.parentId === item.id)),
      blocks: item.blocks ? cleanStarterBlocks(item.blocks) : undefined,
      startDate: mode === "multi" ? item.startDate || item.due || today : undefined,
      progressLogs: Array.isArray(item.progressLogs) ? item.progressLogs : [],
    };
  }) : [];
  const milestones = Array.isArray(saved.milestones) ? saved.milestones.map((item) => ({ ...item, attachments: item.attachments ?? [], blocks: item.blocks ? cleanStarterBlocks(item.blocks) : undefined, mode: item.courseId ? item.mode ?? "single" : undefined, parentCandidate: item.courseId ? item.parentCandidate ?? tasks.some((task) => task.parentMilestoneId === item.id) : undefined })) : [];
  const invalidAutomaticKeys = new Set(milestones.flatMap((node) => {
    if (!node.automationKey) return [];
    const course = courses.find((item) => item.id === node.courseId);
    return course && isCourseTitleCandidate(course.title) && courseUsesAutomatedStudyPlan(course.title) ? [] : [node.automationKey];
  }));
  return {
    ...initialState, ...saved, version: 6, courses, learning,
    tasks,
    milestones: milestones.filter((node) => !node.automationKey || !invalidAutomaticKeys.has(node.automationKey)),
    research: Array.isArray(saved.research) ? saved.research.map((item) => ({
      id: item.id ?? uid(), title: item.title ?? "", status: item.status ?? "收集箱", summary: item.summary ?? "",
      objective: item.objective ?? item.question ?? "", next: item.next ?? "", progress: item.progress ?? 0,
      pages: item.pages?.length ? item.pages.map((page) => ({ ...page, blocks: cleanStarterBlocks(page.blocks, page.title) })) : starterResearchPages(cleanStarterBlocks(item.blocks)), blocks: undefined,
    })) : [],
    ideas: Array.isArray(saved.ideas) ? saved.ideas : [],
    tools: Array.isArray(saved.tools) ? saved.tools.map((item) => ({
      ...toolCollectionFields(item),
      id: item.id ?? uid(), title: item.title ?? "", status: item.status ?? "想法", description: item.description ?? "",
      url: item.url ?? "", version: item.version ?? "构思", currentVersionId: item.currentVersionId,
      versions: item.versions, blocks: cleanStarterBlocks(item.blocks),
    })) : [],
    habits: Array.isArray(saved.habits) ? saved.habits.map((item) => normalizedHabit(item)) : [],
    routines: Array.isArray(saved.routines) ? saved.routines : [],
    reminders: Array.isArray(saved.reminders) ? saved.reminders.map((item) => normalizedReminder({ ...item, times: Array.isArray(item.times) ? item.times : [] })) : [],
    media: Array.isArray(saved.media) ? saved.media.map((item) => ({ ...item, status: item.status ?? "正在看", kind: item.kind ?? "书籍", blocks: cleanStarterBlocks(item.blocks) })) : [],
    recipes: Array.isArray(saved.recipes) ? saved.recipes.map((item) => ({ ...item, blocks: cleanStarterBlocks(item.blocks) })) : [],
    pages: Array.isArray(saved.pages) ? saved.pages.map((item) => ({ ...item, space: item.space ?? (item.id.startsWith("f2") || item.id.startsWith("p2") ? "free" : "thoughts"), blocks: cleanStarterBlocks(item.blocks) })) : [],
    daily: saved.daily && typeof saved.daily === "object" ? saved.daily : {},
    timeEntries: Array.isArray(saved.timeEntries) ? saved.timeEntries : [],
    finance: normalizeFinanceState(saved.finance),
    timetableSettings: {
      termStartDate: saved.timetableSettings?.termStartDate || initialState.timetableSettings.termStartDate,
      activeSchool: saved.timetableSettings?.activeSchool === "bit" ? "bit" : "pku",
    },
    studyAutomation: {
      enabled: saved.studyAutomation?.enabled !== false,
      processedKeys: Array.isArray(saved.studyAutomation?.processedKeys) ? saved.studyAutomation.processedKeys.filter((key) => !invalidAutomaticKeys.has(key)).slice(-20_000) : [],
    },
    themes: { ...initialState.themes, ...(saved.themes ?? {}) },
  };
}

function clientNormalizationChanged(raw: unknown, hydrated: AppState) {
  if (!raw || typeof raw !== "object") return false;
  const saved = raw as Partial<AppState>;
  return saved.version !== hydrated.version
    || JSON.stringify(Array.isArray(saved.tasks) ? saved.tasks : []) !== JSON.stringify(hydrated.tasks)
    || JSON.stringify(Array.isArray(saved.learning) ? saved.learning : []) !== JSON.stringify(hydrated.learning)
    || JSON.stringify(Array.isArray(saved.habits) ? saved.habits : []) !== JSON.stringify(hydrated.habits)
    || JSON.stringify(Array.isArray(saved.reminders) ? saved.reminders : []) !== JSON.stringify(hydrated.reminders)
    || JSON.stringify(Array.isArray(saved.courses) ? saved.courses : []) !== JSON.stringify(hydrated.courses)
    || JSON.stringify(Array.isArray(saved.milestones) ? saved.milestones : []) !== JSON.stringify(hydrated.milestones)
    || JSON.stringify(saved.studyAutomation ?? null) !== JSON.stringify(hydrated.studyAutomation);
}

const emptyPreviewImports: ImportedCourse[] = [];
function createLocalPreviewState(drafts: ImportedCourse[]): AppState {
  if (!drafts.length) return { ...initialState, finance: createPreviewFinanceState() };
  const courses: Course[] = drafts.map((draft, index) => ({
    id: `local-course-${index}`, title: draft.title, term: "2026 秋季", teacher: draft.teacher,
    location: draft.location, school: draft.school, progress: 0, requirements: "",
    schedule: draft.schedule.map((slot, i) => ({ ...slot, id: `local-slot-${index}-${i}` })),
    blocks: [{ id: `local-note-${index}`, type: "text", text: "本地试用笔记：可以在这里输入内容，检查重新导入课表后是否保留。" }],
  }));
  return { ...initialState, courses, tasks: [
    { id: "demo-paper", title: "会计学专业导论结课论文", area: "课内", source: "会计学专业导论", due: dateKey(new Date(Date.now() + 7*86400000)), startDate: today, mode: "multi", status: "进行中", progress: 20, done: false, today: true, elapsed: 30, blocks: [{ id: "demo-paper-note", type: "text", text: "试用记录：在这里整理论文思路、资料和修改意见。" }] },
    { id: "demo-review", title: "今日审稿", area: "课内", source: "论文", parentId: "demo-paper", due: today, done: false, today: true, elapsed: 0, blocks: [] },
  ], milestones: [{ id: "demo-course-node", courseId: courses[0]?.id, title: "提交结课论文", date: today, time: "18:00", location: "", requirements: "本地演示要求", area: "课内", done: false }], timeEntries: [{ id: "demo-time", taskId: "demo-paper", minutes: 30, date: today, mode: "manual", note: "整理文献" }], finance: createPreviewFinanceState(), timetableSettings: { termStartDate: "2026-08-31", activeSchool: "bit" } };
}

export default function DashboardClient({ account, visibleAccounts, onLogout, deploymentVersion, preview = false, previewAcademicCourses = emptyPreviewImports }: { account: WorkspaceAccount; visibleAccounts: WorkspaceAccount[]; onLogout: () => void; deploymentVersion: string; preview?: boolean; previewAcademicCourses?: ImportedCourse[] }) {
  const [active, setActive] = useState<NavId>("today");
  const [workDetail, setWorkDetail] = useState<WorkTarget | null>(null);
  const [manualTarget, setManualTarget] = useState<WorkTarget | null>(null);
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [workspaceOwner, setWorkspaceOwner] = useState(account.id);
  const [data, setStoredData] = useState<AppState>(() => preview ? createLocalPreviewState(previewAcademicCourses) : initialState);
  const [loaded, setLoaded] = useState(preview);
  const [sync, setSync] = useState<WorkspaceSyncState>(preview ? "preview" : "saving");
  const [dialog, setDialog] = useState<DialogConfig>(null);
  const [popup, setPopupState] = useState<PopupState>(null);
  const popupRef = useRef<PopupState>(null);
  const setPopup = useCallback<React.Dispatch<React.SetStateAction<PopupState>>>((action) => {
    const next = typeof action === "function" ? action(popupRef.current) : action;
    popupRef.current = next;
    setPopupState(next);
  }, []);
  const [mobileNav, setMobileNav] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [selectedPage, setSelectedPage] = useState("");
  const reminderSchedulerRef = useRef(new ReminderScheduler());
  const reminderAlerts = useReminderAlerts(account.id);
  const { deliver: deliverReminderAlert } = reminderAlerts;
  const alertAttemptsRef = useRef(new WeakSet<DueReminder>());
  const alertInFlightRef = useRef(new Set<DueReminder>());
  const loadedWorkspaceRef = useRef<string | null>(preview ? account.id : null);
  const habitDayRef = useRef(dateKey());
  const dirtyRef = useRef(false);
  const editVersionRef = useRef(0);
  const cloudRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveEpochRef = useRef(0);
  const readOnly = workspaceOwner !== account.id;
  const visibleAccount = workspaceOwner === account.id ? account : visibleAccounts.find((item) => item.id === workspaceOwner) ?? account;
  useEffect(() => {
    reminderSchedulerRef.current.reset();
    setPopup((current) => current?.reminderId ? null : current);
  }, [account.id, workspaceOwner]);
  useEffect(() => {
    if (preview || deploymentVersion === "local" || deploymentVersion === "local-preview") return;
    let cancelled = false;
    const checkVersion = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && typeof result.version === "string" && result.version !== deploymentVersion) setUpdateAvailable(true);
      } catch {
        // A version check must never interrupt normal workspace use.
      }
    };
    const onFocus = () => { void checkVersion(); };
    void checkVersion();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(checkVersion, 30_000);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); window.clearInterval(interval); };
  }, [deploymentVersion, preview]);
  const setData: React.Dispatch<React.SetStateAction<AppState>> = useCallback((action) => {
    if (readOnly) {
      setPopup({ eyebrow: "只读空间", title: "这是对方的空间", body: "你可以查看这里的内容，但只有空间主人可以修改。" });
      return;
    }
    dirtyRef.current = true;
    editVersionRef.current += 1;
    if (!preview) setSync("saving");
    setStoredData((current) => {
      const next = typeof action === "function" ? action(current) : action;
      const currentDate = dateKey();
      const previousHabits = new Map(current.habits.map((habit) => [habit.id, habit]));
      return {
        ...next,
        tasks: detachRemovedParents(current, next),
        habits: next.habits.map((habit) => {
          const previous = previousHabits.get(habit.id);
          if (previous && habit.today !== previous.today && habit.lastCompletedDate === previous.lastCompletedDate) {
            const nextStreak = habit.today
              ? previous.lastCompletedDate === previousDateKey(currentDate) ? previous.streak + 1 : 1
              : habit.streak;
            return normalizedHabit({ ...habit, streak: nextStreak, lastCompletedDate: habit.today ? currentDate : undefined }, currentDate);
          }
          return normalizedHabit(habit, currentDate);
        }),
      };
    });
  }, [preview, readOnly]);

  useEffect(() => {
    const loadEpoch = ++saveEpochRef.current;
    loadedWorkspaceRef.current = null;
    if (preview) {
      loadedWorkspaceRef.current = account.id;
      setStoredData(createLocalPreviewState(previewAcademicCourses));
      setLoaded(true);
      setSync("preview");
      return;
    }
    let cancelled = false;
    dirtyRef.current = false;
    setLoaded(false);
    setSync("saving");
    fetch(`/api/state?owner=${workspaceOwner}`, { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { onLogout(); return null; }
      if (!response.ok) throw new Error("空间载入失败");
      return response.json();
    }).then((result) => {
      if (!result || cancelled || saveEpochRef.current !== loadEpoch) return;
      cloudRevisionRef.current = Number(result.revision ?? 0);
      const hydrated = result.data ? hydrateState(result.data) : initialState;
      const needsNormalizationSave = !result.readOnly && clientNormalizationChanged(result.data, hydrated);
      setStoredData(hydrated);
      loadedWorkspaceRef.current = workspaceOwner;
      dirtyRef.current = needsNormalizationSave;
      if (needsNormalizationSave) editVersionRef.current += 1;
      setLoaded(true);
      setSync(result.readOnly ? "readonly" : needsNormalizationSave ? "saving" : "cloud");
    }).catch(() => { if (!cancelled && saveEpochRef.current === loadEpoch) { setLoaded(true); setSync("error"); } });
    return () => { cancelled = true; };
  }, [workspaceOwner, account.id, onLogout, preview, previewAcademicCourses]);
  useEffect(() => {
    if (preview || !loaded || readOnly || !dirtyRef.current) return;
    setSync("saving");
    const editVersion = editVersionRef.current;
    const saveEpoch = saveEpochRef.current;
    const payload = data;
    const handle = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        if (saveEpochRef.current !== saveEpoch) return;
        try {
          const response = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: payload, baseRevision: cloudRevisionRef.current }) });
          if (saveEpochRef.current !== saveEpoch) return;
          if (response.status === 401) { onLogout(); return; }
          if (response.status === 409) {
            setSync("error");
            setPopup({ eyebrow: "数据保护", title: "云端内容已在别处更新", body: "为了避免覆盖之前的内容，本次保存已停止。请刷新页面取得最新版后再继续。" });
            return;
          }
          if (!response.ok) throw new Error("保存失败");
          const result = await response.json();
          cloudRevisionRef.current = Number(result.revision ?? cloudRevisionRef.current + 1);
          if (editVersionRef.current === editVersion) {
            dirtyRef.current = false;
            setSync("cloud");
          }
        } catch { if (saveEpochRef.current === saveEpoch) setSync("error"); }
      });
    }, 550);
    return () => window.clearTimeout(handle);
  }, [account.id, data, loaded, onLogout, preview, readOnly]);
  useEffect(() => {
    const scheduler = reminderSchedulerRef.current;
    if (!loaded || readOnly || loadedWorkspaceRef.current !== account.id) { scheduler.reset(); return; }
    const check = () => {
      const now = Date.now();
      scheduler.check(data.reminders, now);
      if (popup?.reminderId && !data.reminders.some((item) => item.id === popup.reminderId && item.enabled)) {
        setPopup(null);
      }
      const background = document.visibilityState === "hidden" || !document.hasFocus();
      if (background && (reminderAlerts.settings.notifications || reminderAlerts.settings.sound)) {
        for (const due of scheduler.pendingAlerts()) {
          if (alertAttemptsRef.current.has(due)) continue;
          const reminder = data.reminders.find((item) => item.id === due.id && item.enabled);
          if (!reminder) continue;
          alertAttemptsRef.current.add(due);
          alertInFlightRef.current.add(due);
          const stillAllowed = () => loadedWorkspaceRef.current === account.id && scheduler.isPending(due);
          void deliverReminderAlert(reminder.id, reminder.title,
            due.reason === "interval" ? `已经过了 ${reminder.intervalMinutes ?? 20} 分钟，该休息一下了。点击返回序流。` : "提醒时间到了。点击返回序流，可完成或延迟 5 分钟。",
            true, stillAllowed,
          ).then((delivered) => { if (delivered) scheduler.markAnnounced(due); })
            .catch(() => { /* Keep the page popup as a fallback. */ })
            .finally(() => alertInFlightRef.current.delete(due));
        }
      }
      // Wait for an in-flight external delivery so returning to the page cannot ring twice.
      if (background || popupRef.current || dialog || [...alertInFlightRef.current].some((due) => scheduler.isPending(due))) return;
      const due = scheduler.takeNext(data.reminders, now);
      const reminder = due && data.reminders.find((item) => item.id === due.id);
      if (!due || !reminder) return;
      setPopup({
        reminderId: reminder.id,
        eyebrow: reminder.type === "break" ? "休息提醒" : reminder.type === "sleep" ? "睡眠提醒" : reminder.type === "exercise" ? "运动提醒" : "生活提醒",
        title: reminder.title,
        body: due.reason === "interval"
          ? `已经过了 ${reminder.intervalMinutes ?? 20} 分钟，看看远处、活动一下吧。完成或关闭后会重新计时，也可以延迟 5 分钟。`
          : "提醒时间到了。你可以完成、延迟 5 分钟或直接关闭。通知和提示音可在生活管理中单独设置。",
      });
      if (!due.externallyAnnounced) {
        void deliverReminderAlert(reminder.id, reminder.title, "提醒时间到了。", false,
          () => loadedWorkspaceRef.current === account.id && popupRef.current?.reminderId === reminder.id);
      }
      if (due.reason !== "interval") {
        setData((current) => ({
          ...current,
          reminders: current.reminders.map((item) => item.id === due.id
            ? { ...item, lastFired: due.firedKey ?? item.lastFired, snoozedUntil: undefined }
            : item),
        }));
      }
    };
    check();
    const handle = window.setInterval(check, 1000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [account.id, data.reminders, loaded, readOnly, workspaceOwner, popup, dialog, setData, setPopup, deliverReminderAlert, reminderAlerts.settings.notifications, reminderAlerts.settings.sound]);
  useEffect(() => {
    if (preview || readOnly) return;
    const rollHabitsToCurrentDay = () => {
      const currentDate = dateKey();
      if (habitDayRef.current === currentDate) return;
      habitDayRef.current = currentDate;
      setData((current) => ({ ...current, habits: current.habits.map((habit) => normalizedHabit(habit, currentDate)) }));
    };
    rollHabitsToCurrentDay();
    const handle = window.setInterval(rollHabitsToCurrentDay, 30_000);
    window.addEventListener("focus", rollHabitsToCurrentDay);
    return () => { window.clearInterval(handle); window.removeEventListener("focus", rollHabitsToCurrentDay); };
  }, [preview, readOnly, setData]);
  useEffect(() => {
    if (preview || !loaded || readOnly || loadedWorkspaceRef.current !== account.id || !data.studyAutomation.enabled) return;
    const arrangeStudyTasks = () => {
      const currentDate = dateKey();
      const planned = createDailyStudyTaskPlan(data.courses, currentDate, data.timetableSettings.termStartDate);
      const processed = new Set(data.studyAutomation.processedKeys);
      const existing = new Set(data.milestones.map((node) => node.automationKey).filter((key): key is string => Boolean(key)));
      const pending = planned.filter((task) => !processed.has(task.automationKey) && !existing.has(task.automationKey));
      if (!pending.length) return;
      setData((current) => {
        if (!current.studyAutomation.enabled) return current;
        const currentProcessed = new Set(current.studyAutomation.processedKeys);
        const currentExisting = new Set(current.milestones.map((node) => node.automationKey).filter((key): key is string => Boolean(key)));
        const additions = pending.filter((task) => !currentProcessed.has(task.automationKey) && !currentExisting.has(task.automationKey));
        if (!additions.length) return current;
        return {
          ...current,
          milestones: [...current.milestones, ...additions.map((task) => ({
            ...task, id: uid(), mode: "single" as const, parentCandidate: false, area: "课内" as const, done: false,
          }))],
          studyAutomation: {
            ...current.studyAutomation,
            processedKeys: [...new Set([...current.studyAutomation.processedKeys, ...additions.map((task) => task.automationKey)])].slice(-20_000),
          },
        };
      });
    };
    arrangeStudyTasks();
    const handle = window.setInterval(arrangeStudyTasks, 30_000);
    window.addEventListener("focus", arrangeStudyTasks);
    return () => { window.clearInterval(handle); window.removeEventListener("focus", arrangeStudyTasks); };
  }, [account.id, data.courses, data.milestones, data.studyAutomation, data.timetableSettings.termStartDate, loaded, preview, readOnly, setData]);

  const refreshAfterAi = useCallback(async () => {
    if (preview) return;
    const refreshEpoch = ++saveEpochRef.current;
    const response = await fetch(`/api/state?owner=${account.id}`, { cache: "no-store" });
    if (response.status === 401) { onLogout(); return; }
    if (!response.ok) throw new Error("AI 修改已提交，但页面刷新失败");
    const result = await response.json();
    if (saveEpochRef.current !== refreshEpoch) return;
    cloudRevisionRef.current = Number(result.revision ?? 0);
    const hydrated = result.data ? hydrateState(result.data) : initialState;
    const needsNormalizationSave = clientNormalizationChanged(result.data, hydrated);
    dirtyRef.current = needsNormalizationSave;
    editVersionRef.current += 1;
    setStoredData(hydrated);
    loadedWorkspaceRef.current = account.id;
    setWorkspaceOwner(account.id);
    setDetail(null);
    setLoaded(true);
    setSync(needsNormalizationSave ? "saving" : "cloud");
  }, [account.id, onLogout, preview]);

  const navigate = (id: NavId) => { setActive(id); setDetail(null); setWorkDetail(null); setMobileNav(false); };
  const theme = data.themes[active] ?? toneChoices[0];
  const daily = data.daily[today] ?? { note: "", gain: "", problem: "", feeling: "", tomorrow: "" };
  const todayTasks = data.tasks.filter((task) => taskVisibleToday(task, today));
  const activeCourse = detail?.type === "course" ? data.courses.find((course) => course.id === detail.id) : undefined;
  const updateDaily = (field: keyof typeof daily, value: string) => setData((current) => ({ ...current, daily: { ...current.daily, [today]: { ...(current.daily[today] ?? daily), [field]: value } } }));
  const deleteDialog = (title: string, onDelete: () => void, description = "内容会从当前账号的云端空间中移除。") => setDialog({ title: `移除“${title}”？`, description, submitLabel: "确认移除", danger: true, fields: [], onSubmit: onDelete });
  const focusChoices: FocusChoice[] = [
    ...data.tasks.map((task) => ({ kind: "task" as const, id: task.id, title: `${task.area} · ${task.title}`, done: task.done, group: taskModeOf(task) === "multi" ? "长期任务" as const : "短期任务" as const, listed: !task.done && (taskModeOf(task) === "multi" || taskVisibleToday(task, today)) })),
    ...data.milestones.map((node) => {
      const courseTitle = data.courses.find((course) => course.id === node.courseId)?.title;
      return { kind: "milestone" as const, id: node.id, title: `${node.area} · ${courseTitle ? `${courseTitle} / ` : ""}${node.title}`, done: node.done, group: node.courseId ? (node.mode === "multi" ? "长期任务" as const : "短期任务" as const) : "事项" as const, listed: !node.done && (node.courseId ? node.mode === "multi" || node.date === today : node.date === today) };
    }),
  ];
  const focusSettings = data.focusSettings ?? defaultFocusSettings;
  const recordTime = (entry: TimeEntry) => {
    if (readOnly || !loaded || loadedWorkspaceRef.current !== account.id) throw new Error("当前空间尚未就绪或为只读，未记录时间");
    appendTimeEntry(data, entry);
    setData(current => appendTimeEntry(current, entry));
  };
  const focus = useFocusTimer({ scope: workspaceOwner, enabled: loaded && !readOnly && loadedWorkspaceRef.current === account.id, preview, choices: focusChoices, settings: focusSettings, onRecord: recordTime });
  const selectFocusTarget = focus.select;
  const requestWorkDeletion = (target: WorkTarget, title: string) => {
    const node = target.kind === "milestone" ? data.milestones.find((entry) => entry.id === target.id) : undefined;
    const entityLabel = node && !node.courseId ? "事项" : "任务";
    const childCount = data.tasks.filter((entry) => target.kind === "task" ? entry.parentId === target.id : entry.parentMilestoneId === target.id).length;
    deleteDialog(title, () => {
      if (focus.session?.target.kind === target.kind && focus.session.target.id === target.id) focus.discard();
      setData((current) => {
        const next = {
          ...current,
          tasks: target.kind === "task" ? current.tasks.filter((entry) => entry.id !== target.id) : current.tasks,
          milestones: target.kind === "milestone" ? current.milestones.filter((entry) => entry.id !== target.id) : current.milestones,
          timeEntries: current.timeEntries.filter((entry) => !entryMatches(entry, target)),
        };
        return { ...next, tasks: detachRemovedParents(current, next) };
      });
      setWorkDetail(null);
    }, `删除后，这一${entityLabel}的计时记录也会被移除。${childCount ? `其下 ${childCount} 个关联任务会保留并变为独立任务。` : ""}`);
  };
  useEffect(() => { if (workDetail) selectFocusTarget(`${workDetail.kind}:${workDetail.id}`); }, [workDetail, selectFocusTarget, focus.session?.id]);
  useEffect(() => { setWorkDetail(null); setManualTarget(null); }, [workspaceOwner]);
  const focusPanel = <FocusTimer controller={focus} choices={focusChoices} onSettings={value => setData(current => ({ ...current, focusSettings: value }))} onManual={setManualTarget} onOpen={setWorkDetail} />;
  const exportData = () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `序流备份-${today}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const reloadForUpdate = async () => {
    if (sync === "saving") return;
    if (sync === "error" && !window.confirm("云端同步异常，刷新可能丢失尚未保存的编辑。建议先导出数据备份。仍要刷新吗？")) return;
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      await registration?.update();
    } catch {
      // A service-worker update failure must not block a normal page refresh.
    }
    window.location.reload();
  };
  const postponeWork = useCallback((target: WorkTarget, days = 1) => {
    setData((current) => target.kind === "task"
      ? { ...current, tasks: current.tasks.map((entry) => entry.id === target.id ? postponeTask(entry, days) : entry) }
      : { ...current, milestones: current.milestones.map((entry) => entry.id === target.id ? { ...entry, date: addDays(entry.date || today, days) } : entry) });
  }, [setData]);
  const insertAiCourseNote = useCallback(({ courseId, question, answer }: { courseId: string; question: string; answer: string }) => {
    if (!answer.trim() || !data.courses.some((course) => course.id === courseId)) throw new Error("当前课程不存在或回答为空");
    const blocks = aiCourseAnswerBlocks(question, answer);
    setData((current) => ({
      ...current,
      courses: current.courses.map((course) => course.id === courseId ? { ...course, blocks: [...course.blocks, ...blocks] } : course),
    }));
  }, [data.courses, setData]);

  return <div className="shell" style={{ "--accent": theme } as React.CSSProperties}>
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}><button className="brand" onClick={() => navigate("today")}><span className="brandMark">序</span><span>序流</span></button><div className="workspaceSwitcher"><span>当前空间</span><button className={!readOnly ? "active" : ""} onClick={() => { setWorkspaceOwner(account.id); setDetail(null); }}><i>{account.displayName.slice(0, 1)}</i><b>{account.displayName}</b><small>我的</small></button>{visibleAccounts.map((visible) => <button key={visible.id} className={workspaceOwner === visible.id ? "active" : ""} onClick={() => { setWorkspaceOwner(visible.id); setDetail(null); }}><i>{visible.displayName.slice(0, 1)}</i><b>{visible.displayName}</b><small>只读</small></button>)}</div><div className="navGroup">{navItems.slice(0, 5).map((item) => <NavButton key={item.id} {...item} active={active} onClick={navigate} />)}</div><div className="navCaption">我的空间</div><div className="navGroup">{navItems.slice(5).map((item) => <NavButton key={item.id} {...item} active={active} onClick={navigate} />)}</div><button className="exportButton" onClick={exportData}>导出数据备份</button><button className="refreshButton" disabled={sync === "saving"} onClick={() => void reloadForUpdate()}>{sync === "saving" ? "保存后可刷新" : "↻ 刷新应用"}</button><a className="changelogLink" href="/changelog" target="_blank" rel="noreferrer">更新日志 ↗</a>{!preview && <button className="logoutButton" onClick={onLogout}>退出登录</button>}<div className="sidebarFoot"><span className={`syncDot ${sync}`} />{sync === "saving" ? "正在保存" : sync === "readonly" ? "正在查看只读空间" : sync === "error" ? "云端连接异常" : sync === "preview" ? "本地预览 · 不会写入云端" : "已保存到云端"}</div></aside>
    <main className="main">{preview && <div className="readOnlyBanner">本地试运行 · 可测试任务计时、子任务与事项记录。示例数据仅在本次页面保留，刷新后重置。</div>}<header className="mobileHeader"><button className="iconButton" aria-label="打开导航" onClick={() => setMobileNav(true)}>☰</button><strong>序流</strong><div className="mobileHeaderActions"><button className="iconButton refreshIconButton" disabled={sync === "saving"} aria-label="刷新应用" title="刷新应用" onClick={() => void reloadForUpdate()}>↻</button><span className={`syncDot ${sync}`} /></div></header>{updateAvailable && <div className="updateBanner"><span>网站已有新版本，为避免继续使用旧页面，请先刷新。</span><button disabled={sync === "saving"} onClick={() => void reloadForUpdate()}>{sync === "saving" ? "等待保存" : "立即刷新"}</button></div>}{readOnly && <div className="readOnlyBanner">正在查看 <strong>{visibleAccount.displayName}</strong> 的空间 · 只读</div>}{!loaded ? <div className="workspaceLoading">正在载入空间…</div> : <>{!detail && !workDetail && <ThemePicker color={theme} onChange={(color) => setData((current) => ({ ...current, themes: { ...current.themes, [active]: color } }))} />}{workDetail ? <TaskDetail key={`${workspaceOwner}:${workDetail.kind}:${workDetail.id}`} target={workDetail} data={data} setData={setData} access={{ ownerId: workspaceOwner, readOnly, preview }} focus={focus} focusPanel={focusPanel} onManual={setManualTarget} onOpen={setWorkDetail} onClose={() => setWorkDetail(null)} requestDelete={requestWorkDeletion} postponeWork={postponeWork} /> : detail ? <DetailRouter target={detail} data={data} setData={setData} back={() => setDetail(null)} setDialog={setDialog} deleteDialog={deleteDialog} access={{ ownerId: workspaceOwner, readOnly, preview }} /> : <>
      {active === "today" && <TodayView data={data} setData={setData} tasks={todayTasks} milestones={data.milestones.filter((item) => item.date === today || Boolean(item.courseId && item.mode === "multi" && !item.done))} totalMinutes={data.timeEntries.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.minutes, 0)} daily={daily} updateDaily={updateDaily} focusPanel={focusPanel} openWork={setWorkDetail} requestDelete={requestWorkDeletion} postponeWork={postponeWork} readOnly={readOnly} setPopup={setPopup} setDialog={setDialog} />}
      {active === "timetable" && <TimetableViewV2 data={data} setData={setData} setDialog={setDialog} openCourse={(id) => setDetail({ type: "course", id })} deleteDialog={deleteDialog} dualSchool={workspaceOwner === "owner"} readOnly={readOnly} />}
      {active === "tasks" && <TaskOverviewView data={data} setData={setData} setDialog={setDialog} openWork={setWorkDetail} requestDelete={requestWorkDeletion} postponeWork={postponeWork} readOnly={readOnly} />}
      {active === "calendar" && <CalendarView data={data} setData={setData} setDialog={setDialog} openWork={setWorkDetail} readOnly={readOnly} />}
      {active === "review" && <ReviewView data={data} setData={setData} />}
      {active === "finance" && <FinanceView finance={data.finance} readOnly={readOnly} projectOptions={[...data.courses.map((item) => item.title), ...data.learning.map((item) => item.title), ...data.research.map((item) => item.title), ...data.tools.map((item) => item.title)]} onChange={(updater) => setData((current) => ({ ...current, finance: updater(current.finance) }))} />}
      {active === "school" && <SchoolView data={data} setData={setData} openDetail={(id) => setDetail({ type: "course", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "learning" && <LearningView data={data} setData={setData} openDetail={(id) => setDetail({ type: "learning", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {(active === "thoughts" || active === "free") && <NotesView space={active} data={data} setData={setData} selectedPage={selectedPage} setSelectedPage={setSelectedPage} setDialog={setDialog} deleteDialog={deleteDialog} access={{ ownerId: workspaceOwner, readOnly, preview }} />}
      {active === "work" && <WorkView data={data} setData={setData} openDetail={(id) => setDetail({ type: "research", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "ideas" && <IdeasView data={data} setData={setData} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "tools" && <ToolsView key={workspaceOwner} data={data} setData={setData} openDetail={(id) => setDetail({ type: "tool", id })} setDialog={setDialog} deleteDialog={deleteDialog} readOnly={readOnly} />}
      {active === "life" && <LifeViewV2 data={data} setData={setData} openDetail={setDetail} setDialog={setDialog} deleteDialog={deleteDialog} setPopup={setPopup} alerts={reminderAlerts} readOnly={readOnly} workspaceOwner={workspaceOwner} />}
    </>}</>}</main>
    {manualTarget && <ManualTimeDialog target={manualTarget} title={focusChoices.find(t => t.id === manualTarget.id && t.kind === manualTarget.kind)?.title ?? "任务"} onClose={() => setManualTarget(null)} onSave={entry => { recordTime(entry); setManualTarget(null); }} />}
    {!workDetail && active !== "today" && focus.session && <div className="activeFocusBar"><strong>{focusChoices.find(t => t.id === focus.session!.target.id && t.kind === focus.session!.target.kind)?.title ?? "当前任务"}</strong><span>{formatClock(focus.seconds)}</span><button onClick={() => setWorkDetail(focus.session!.target)}>打开计时与记录</button></div>}
    <AiAssistant accountName={account.displayName} activeWorkspaceOwner={workspaceOwner} activeWorkspaceName={visibleAccount.displayName} activeCourse={activeCourse ? { id: activeCourse.id, title: activeCourse.title, canInsert: !readOnly && !preview } : undefined} disabledReason={updateAvailable ? "网站已有新版本，请刷新页面后再使用 AI。" : aiDisabledReasonForSync(preview, sync)} onApplied={refreshAfterAi} onInsertCourseNote={insertAiCourseNote} />
    <nav className="mobileTabs">{navItems.slice(0, 3).map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.label}</button>)}<button onClick={() => setMobileNav(true)}><span>格</span>空间</button></nav>{mobileNav && <button className="navScrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}<FormDialog config={dialog} onClose={() => setDialog(null)} /><PagePopup popup={popup} onClose={() => {
      if (popup?.reminderId) reminderSchedulerRef.current.dismiss(popup.reminderId, data.reminders, Date.now());
      setPopup(null);
    }} onSnooze={() => {
      if (!popup?.reminderId || readOnly) return;
      const id = popup.reminderId;
      reminderSchedulerRef.current.dismiss(id, data.reminders, Date.now());
      setPopup(null);
      setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === id ? { ...item, snoozedUntil: Date.now() + 300000 } : item) }));
    }} />
  </div>;
}

function NavButton({ id, icon, label, active, onClick }: { id: NavId; icon: string; label: string; active: NavId; onClick: (id: NavId) => void }) { return <button className={`navButton ${active === id ? "active" : ""}`} onClick={() => onClick(id)}><span>{icon}</span>{label}</button>; }
function ThemePicker({ color, onChange }: { color: string; onChange: (color: string) => void }) { return <div className="themePicker" aria-label="页面颜色"><span>页面颜色</span>{toneChoices.map((tone) => <button key={tone} className={color === tone ? "active" : ""} style={{ background: tone }} aria-label={`使用颜色 ${tone}`} onClick={() => onChange(tone)} />)}<label title="自定义颜色"><input type="color" value={color} onChange={(event) => onChange(event.target.value)} />＋</label></div>; }
function PageHead({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <div className="pageHead"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
function SyncChip() { return <span className="syncChip"><span />云端自动保存 · 支持导出备份</span>; }
function PanelTitle({ title, subtitle, meta }: { title: string; subtitle: string; meta?: string }) { return <div className="panelHead"><div><h2>{title}</h2><p>{subtitle}</p></div>{meta && <span className="countChip">{meta}</span>}</div>; }
function SectionHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="sectionHead"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }

function TodayView({ data, setData, tasks, milestones, totalMinutes, daily, updateDaily, focusPanel, openWork, requestDelete, postponeWork, readOnly, setPopup, setDialog }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; tasks: TaskItem[]; milestones: Milestone[]; totalMinutes: number; daily: AppState["daily"][string]; updateDaily: (field: keyof AppState["daily"][string], value: string) => void; focusPanel: React.ReactNode; openWork: (target: WorkTarget) => void; requestDelete: (target: WorkTarget, title: string) => void; postponeWork: (target: WorkTarget, days?: number) => void; readOnly: boolean; setPopup: (value: PopupState) => void; setDialog: (value: DialogConfig) => void }) {
  const [creatingTask, setCreatingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editingNode, setEditingNode] = useState<Milestone | null>(null);
  const addEvent = () => setDialog({
    title: "新增事项",
    description: "事项用于会议、预约、行程等日历事件；需要完成的内容请新增任务。",
    submitLabel: "创建事项",
    fields: [
      { name: "title", label: "事项名称", placeholder: "例如：项目会议" },
      { name: "date", label: "日期", type: "date", value: today },
      { name: "time", label: "时间", type: "time", value: "00:00" },
      { name: "location", label: "地点" },
      { name: "requirements", label: "事项说明", type: "textarea", placeholder: "议程、携带材料或其他说明" },
      { name: "area", label: "所属领域", type: "select", options: ["课内", "课外", "工作", "生活", "思考"], value: "工作" },
    ],
    onSubmit: (values) => {
      const id = uid();
      setData((current) => ({ ...current, milestones: [...current.milestones, { id, title: values.title.trim() || "未命名事项", date: values.date || today, time: values.time || "00:00", location: values.location.trim(), requirements: values.requirements.trim(), area: (values.area || "工作") as Area, done: false }] }));
    },
  });
  const courseTasks = milestones.filter((node) => Boolean(node.courseId));
  const calendarItems = milestones.filter((node) => !node.courseId);
  type TodayTaskEntry = { kind: "task"; item: TaskItem } | { kind: "milestone"; item: Milestone };
  const shortEntries: TodayTaskEntry[] = [
    ...tasks.filter((task) => taskModeOf(task) !== "multi").map((item) => ({ kind: "task" as const, item })),
    ...courseTasks.filter((node) => node.mode !== "multi").map((item) => ({ kind: "milestone" as const, item })),
  ];
  const courseAssignments = shortEntries.filter((entry) => entry.kind === "task" ? Boolean(entry.item.courseId) : Boolean(entry.item.courseId && !entry.item.automationKey));
  const automaticStudyTasks = shortEntries.filter((entry) => entry.kind === "milestone" && Boolean(entry.item.automationKey));
  const otherShortTasks = shortEntries.filter((entry) => !courseAssignments.includes(entry) && !automaticStudyTasks.includes(entry));
  const shortTaskSections = [
    { id: "course", title: "课程作业", note: "根据实际课程要求手动添加", entries: courseAssignments },
    { id: "automatic", title: "自动学习任务", note: "按课表和学习流程生成", entries: automaticStudyTasks },
    { id: "other", title: "其他短期任务", note: "独立任务和长期任务分支", entries: otherShortTasks },
  ].filter((section) => section.entries.length);
  const taskGroups = [
    {
      id: "single",
      title: "短期任务",
      subtitle: "课程作业优先显示；自动学习任务在下方轻分隔",
      entries: shortEntries,
    },
    {
      id: "multi",
      title: "长期任务",
      subtitle: "持续推进并记录进度；包含长期课程任务",
      entries: [
        ...tasks.filter((task) => taskModeOf(task) === "multi").map((item) => ({ kind: "task" as const, item })),
        ...courseTasks.filter((node) => node.mode === "multi").map((item) => ({ kind: "milestone" as const, item })),
      ],
    },
  ];
  const allTaskEntries = taskGroups.flatMap((group) => group.entries);
  const automaticTasks = milestones.filter((node) => Boolean(node.automationKey));
  const renderTaskEntry = (entry: TodayTaskEntry) => entry.kind === "task" ? <div key={"task-" + entry.item.id} className={"taskRow " + (entry.item.done ? "done" : "")}>
    <button className="checkButton" disabled={readOnly} aria-pressed={entry.item.done} aria-label={entry.item.done ? "标记未完成" : "标记完成"} onClick={() => setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === entry.item.id ? withTaskCompletion(item, !item.done) : item) }))}>{entry.item.done ? "✓" : ""}</button>
    <div className="taskBody"><button className="taskTitleButton" onClick={() => readOnly ? openWork({ kind: "task", id: entry.item.id }) : setEditingTask(entry.item)}>{entry.item.title}</button>{entry.item.done && <span className="taskStatus 已完成 todayCompletionStatus">已完成</span>}<small>{entry.item.parentId ? "属于：" + (data.tasks.find((task) => task.id === entry.item.parentId)?.title ?? "上级任务") : entry.item.parentMilestoneId ? "属于：" + (data.milestones.find((node) => node.id === entry.item.parentMilestoneId)?.title ?? "关联对象") : entry.item.source} · {taskModeOf(entry.item) === "multi" ? (entry.item.startDate || "未设开始") + " → " + (entry.item.due || "未设截止") : entry.item.due || "未设日期"}</small><button className="taskRecordLink" onClick={() => readOnly ? openWork({ kind: "task", id: entry.item.id }) : setEditingTask(entry.item)}>{readOnly ? "查看详细信息" : "修改基础信息"} · 已投入 {entry.item.elapsed} 分钟</button>{taskModeOf(entry.item) === "multi" && <><span>{taskProgressOf(entry.item)}% · {taskStatusOf(entry.item)}</span><i className="todayTaskProgress"><b style={{ width: taskProgressOf(entry.item) + "%" }} /></i></>}</div>
    <div className="taskRowActions"><span className={"areaTag " + areaClass[entry.item.area]}>{entry.item.area}</span>{!entry.item.done && <button type="button" className="quickPostponeButton" disabled={readOnly} aria-label={"将任务推迟一天：" + entry.item.title} onClick={() => postponeWork({ kind: "task", id: entry.item.id })}>＋1天</button>}<button type="button" className="miniRemove todayQuickDelete" disabled={readOnly} aria-label={"快捷删除任务：" + entry.item.title} onClick={() => requestDelete({ kind: "task", id: entry.item.id }, entry.item.title)}>×</button></div>
  </div> : <div key={"milestone-" + entry.item.id} className={"taskRow " + (entry.item.done ? "done" : "")}>
    <button className="checkButton" disabled={readOnly} aria-pressed={entry.item.done} aria-label={(entry.item.done ? "标记未完成：" : "标记完成：") + entry.item.title} onClick={() => setData((current) => ({ ...current, milestones: current.milestones.map((node) => node.id === entry.item.id ? { ...node, done: !node.done } : node) }))}>{entry.item.done ? "✓" : ""}</button>
    <div className="taskBody"><button className="taskTitleButton" onClick={() => readOnly ? openWork({ kind: "milestone", id: entry.item.id }) : setEditingNode(entry.item)}>{entry.item.title}</button>{entry.item.done && <span className="taskStatus 已完成 todayCompletionStatus">已完成</span>}<small>{entry.item.automationKey ? "课表自动安排 · " : ""}{data.courses.find((course) => course.id === entry.item.courseId)?.title ?? "课程任务"} · {entry.item.mode === "multi" ? "截止 " : ""}{entry.item.date}</small><button className="taskRecordLink" onClick={() => readOnly ? openWork({ kind: "milestone", id: entry.item.id }) : setEditingNode(entry.item)}>{readOnly ? "查看详细信息" : "修改基础信息"} · 已投入 {entry.item.elapsed ?? 0} 分钟</button></div>
    <div className="taskRowActions"><span className={"areaTag " + areaClass[entry.item.area]}>{entry.item.area}</span>{!entry.item.done && <button type="button" className="quickPostponeButton" disabled={readOnly} aria-label={"将课程任务推迟一天：" + entry.item.title} onClick={() => postponeWork({ kind: "milestone", id: entry.item.id })}>＋1天</button>}<button type="button" className="miniRemove todayQuickDelete" disabled={readOnly} aria-label={"快捷删除任务：" + entry.item.title} onClick={() => requestDelete({ kind: "milestone", id: entry.item.id }, entry.item.title)}>×</button></div>
  </div>;
  return <div className="page">
    <PageHead eyebrow={(new Date().getMonth() + 1) + "月" + new Date().getDate() + "日 · " + new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())} title="今天，把重要的事接起来。" subtitle={allTaskEntries.filter((entry) => !entry.item.done).length + " 项任务待完成 · 今日已专注 " + formatMinutes(totalMinutes)} action={<div className="pageHeadActions"><button className="primaryButton" disabled={readOnly} onClick={() => setCreatingTask(true)}>＋ 新增任务</button><button className="softButton" disabled={readOnly} onClick={addEvent}>＋ 新增事项</button><SyncChip /></div>} />
    {creatingTask && <TaskSettingsDialog tasks={data.tasks} milestones={data.milestones} courses={data.courses} learning={data.learning} onClose={() => setCreatingTask(false)} onSave={(task) => { setData((current) => ({ ...current, tasks: [...current.tasks, task] })); setCreatingTask(false); }} />}
    {editingTask && <TaskSettingsDialog task={editingTask} tasks={data.tasks} milestones={data.milestones} courses={data.courses} learning={data.learning} onClose={() => setEditingTask(null)} onSave={(task) => { setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? preserveTaskContent(item, task) : item) })); setEditingTask(null); }} onOpenDetail={() => { const id = editingTask.id; setEditingTask(null); openWork({ kind: "task", id }); }} />}
    {editingNode && <MilestoneSettingsDialog node={editingNode} onClose={() => setEditingNode(null)} onSave={(node) => { setData((current) => ({ ...current, milestones: current.milestones.map((item) => item.id === node.id ? node : item) })); setEditingNode(null); }} onOpenDetail={() => { const id = editingNode.id; setEditingNode(null); openWork({ kind: "milestone", id }); }} />}
    <div className="todayGrid"><div className="stack">
      {taskGroups.map((group) => <Fragment key={group.id}><section className="panel taskPanel todayCategoryPanel">
        <PanelTitle title={group.title} subtitle={group.subtitle} meta={group.entries.filter((entry) => entry.item.done).length + " / " + group.entries.length} />
        <div className={"taskList " + (group.id === "single" ? "groupedTaskList" : "")}>{group.id === "single" ? shortTaskSections.map((section) => <div className="todayTaskSubgroup" key={section.id}><div className="todayTaskSubhead"><strong>{section.title}</strong><span>{section.note} · {section.entries.length} 项</span></div>{section.entries.map(renderTaskEntry)}</div>) : group.entries.map(renderTaskEntry)}</div>
        {!group.entries.length && <div className="emptyState compact"><h2>今天没有{group.title}</h2><p>{group.id === "multi" ? "长期任务会在推进期间持续显示。" : "设置为今天的短期任务会显示在这里。"}</p></div>}
      </section>{group.id === "single" && <section className="panel taskPanel todayCategoryPanel"><PanelTitle title="事项" subtitle="会议、预约、行程等日历事项" meta={calendarItems.filter((item) => item.done).length + " / " + calendarItems.length} /><div className="taskList">{calendarItems.map((item) => <div className={"taskRow " + (item.done ? "done" : "")} key={item.id}><button className="checkButton" disabled={readOnly} aria-pressed={item.done} aria-label={(item.done ? "标记未完成：" : "标记完成：") + item.title} onClick={() => setData((current) => ({ ...current, milestones: current.milestones.map((node) => node.id === item.id ? { ...node, done: !node.done } : node) }))}>{item.done ? "✓" : ""}</button><div className="taskBody"><button className="taskTitleButton" onClick={() => readOnly ? openWork({ kind: "milestone", id: item.id }) : setEditingNode(item)}>{item.title}</button>{item.done && <span className="taskStatus 已完成 todayCompletionStatus">已完成</span>}<span>{item.time} · {item.location || "未填写地点"}</span><button className="taskRecordLink" onClick={() => readOnly ? openWork({ kind: "milestone", id: item.id }) : setEditingNode(item)}>{readOnly ? "查看详细信息" : "修改基础信息"} · 已投入 {item.elapsed ?? 0} 分钟</button></div><div className="taskRowActions"><span className={"areaTag " + areaClass[item.area]}>{item.area}</span>{!item.done && <button type="button" className="quickPostponeButton" disabled={readOnly} aria-label={"将事项推迟一天：" + item.title} onClick={() => postponeWork({ kind: "milestone", id: item.id })}>＋1天</button>}<button type="button" className="miniRemove todayQuickDelete" disabled={readOnly} aria-label={"快捷删除事项：" + item.title} onClick={() => requestDelete({ kind: "milestone", id: item.id }, item.title)}>×</button></div></div>)}</div>{!calendarItems.length && <div className="emptyState compact"><h2>今天没有事项</h2><p>今天的会议、预约和行程会显示在这里。</p></div>}</section>}</Fragment>)}
      <section className="panel notePanel"><PanelTitle title="今日随记" subtitle="收获、问题或突然出现的想法" meta="自动保存" /><textarea value={daily.note} onChange={(event) => updateDaily("note", event.target.value)} placeholder="此刻有什么值得记下来？" /></section>
    </div><div className="stack"><section className="panel studyPlanPanel"><PanelTitle title="课表学习计划" subtitle="按课表和分科学习方法自动安排" meta={data.studyAutomation.enabled ? "已开启" : "已暂停"} /><p>{data.studyAutomation.enabled ? `今天已自动安排 ${automaticTasks.length} 项；包括今日课上、课后和明日课前任务。` : "暂停期间不会继续生成新的学习任务，已有任务仍会保留。"}</p><button className="softButton" disabled={readOnly} onClick={() => setData((current) => ({ ...current, studyAutomation: { ...current.studyAutomation, enabled: !current.studyAutomation.enabled } }))}>{data.studyAutomation.enabled ? "暂停自动安排" : "开启自动安排"}</button></section>{focusPanel}<section className="panel todayHabitsPanel"><PanelTitle title="今日习惯" subtitle="在今日页直接完成打卡" meta={data.habits.filter((habit) => habit.today).length + " / " + data.habits.length} /><div className="todayHabitList">{data.habits.map((habit) => <div className="habitRow todayHabitRow" key={habit.id}><button className={`habitCheck ${habit.today ? "done" : ""}`} disabled={readOnly} aria-pressed={habit.today} aria-label={(habit.today ? "取消打卡：" : "完成打卡：") + habit.title} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? toggledHabit(item) : item) }))}>{habit.today ? "✓" : ""}</button><div><strong>{habit.title}</strong><span>{habit.schedule} · 连续 {habit.streak} 天</span></div></div>)}</div>{!data.habits.length && <div className="emptyState compact"><h2>还没有习惯</h2><p>可在“生活”页面添加日常习惯。</p></div>}</section><div className="miniStats"><div><strong>{formatMinutes(totalMinutes)}</strong><span>今日专注</span></div><div><strong>{allTaskEntries.filter((entry) => entry.item.done).length}</strong><span>完成任务</span></div><div><strong>{Math.round(data.habits.filter((habit) => habit.today).length / Math.max(1, data.habits.length) * 100)}%</strong><span>习惯完成</span></div></div><section className="panel reminderPanel"><PanelTitle title="生活提醒" subtitle="一个项目可设置多个时间" /><div className="reminderList">{data.reminders.map((reminder) => <div className="reminderRow" key={reminder.id}><span className={"reminderIcon " + reminder.type}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : reminder.type === "exercise" ? "动" : "提"}</span><div><strong>{reminder.title}</strong><span>{[...(reminder.type === "break" ? ["每 " + (reminder.intervalMinutes ?? 20) + " 分钟 · 自动计时"] : []), ...reminder.times].join(" / ")} · {reminder.enabled ? "等待提醒" : "已关闭"}</span></div><button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: "你可以完成、延迟 5 分钟或关闭这条页面提示。" })}>预览</button></div>)}</div></section></div></div>
  </div>;
}
function TimetableViewV2({ data, setData, setDialog, openCourse, deleteDialog, dualSchool, readOnly }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; openCourse: (id: string) => void; deleteDialog: (title: string, onDelete: () => void) => void; dualSchool: boolean; readOnly: boolean }) {
  const [importOpen, setImportOpen] = useState(false);
  const [preset, setPreset] = useState<AcademicImportPreset>(data.timetableSettings.activeSchool);
  const [selectedSchool, setSelectedSchool] = useState<AcademicImportPreset>(data.timetableSettings.activeSchool);
  const [selectedActualWeek, setSelectedActualWeek] = useState<number | null>(null);
  const [imported, setImported] = useState<ImportedCourse[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [replaceSchedules, setReplaceSchedules] = useState(false);
  const term = `${new Date().getFullYear()} ${new Date().getMonth() >= 7 ? "秋季" : "春季"}`;
  const weekdays = importWeekdays;
  const validCourses = data.courses.filter((course) => isCourseTitleCandidate(course.title));
  const schoolCourses = dualSchool ? validCourses.filter((course) => courseSchool(course) === selectedSchool) : validCourses;
  const currentWeekInfo = timetableWeekInfo(today, data.timetableSettings.termStartDate);
  const weekInfo = selectedActualWeek === null ? currentWeekInfo
    : timetableWeekInfo(addDays(data.timetableSettings.termStartDate, (selectedActualWeek - 1) * 7), data.timetableSettings.termStartDate);
  const isCurrentWeek = selectedActualWeek === null || weekInfo?.actualWeek === currentWeekInfo?.actualWeek;
  const weekOptions = Array.from({ length: Math.max(23, currentWeekInfo?.actualWeek ?? 1, selectedActualWeek ?? 1) }, (_, index) => index + 1);
  const formalWeekStart = addDays(data.timetableSettings.termStartDate, 21);
  const weekDates = weekInfo ? weekdays.map((_, index) => addDays(weekInfo.weekStartDate, index)) : [];
  const visibleEntries = weekInfo ? schoolCourses.flatMap((course) => course.schedule
    .filter((slot) => courseRunsInTimetableWeek(slot.weeks, weekInfo.timetableWeek))
    .map((slot) => ({ course, slot }))) : [];
  const timeRanges = officialTimetableRows[selectedSchool];
  const changeSchool = (school: AcademicImportPreset) => {
    setSelectedSchool(school);
    setPreset(school);
    if (!readOnly) setData((current) => ({ ...current, timetableSettings: { ...current.timetableSettings, activeSchool: school } }));
  };

  const addSlot = () => setDialog({
    title: "添加课程时间",
    description: "同一门课程可以添加多个上课时间。",
    submitLabel: "加入课程表",
    fields: [
      { name: "course", label: "课程", type: "select", options: schoolCourses.map((course) => course.title) },
      { name: "weekday", label: "星期", type: "select", options: weekdays },
      { name: "start", label: "开始时间", type: "time", value: "08:00" },
      { name: "end", label: "结束时间", type: "time", value: "09:40" },
      { name: "location", label: "地点" },
      { name: "weeks", label: "上课周次", placeholder: "例如：-3--1周、1-16周（单周）" },
    ],
    onSubmit: (values) => setData((current) => ({
      ...current,
      courses: current.courses.map((course) => course.title === values.course && (!dualSchool || courseSchool(course) === selectedSchool) ? {
        ...course,
        school: dualSchool ? selectedSchool : course.school,
        schedule: [...course.schedule, { id: uid(), weekday: Math.max(1, weekdays.indexOf(values.weekday) + 1), start: values.start, end: values.end, location: values.location || course.location, weeks: values.weeks, source: "manual" }],
      } : course),
    })),
  });

  const handleAcademicFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage("文件超过 10 MB，请从教务系统导出精简的课程文件后再试。");
      input.value = "";
      return;
    }
    setImporting(true);
    setImportMessage("");
    setImportFileName(file.name);
    try {
      const result = await parseAcademicFile(file, preset);
      setImported(result);
      setImportMessage(result.length ? `已识别 ${result.length} 门课程、${result.reduce((sum, course) => sum + course.schedule.length, 0)} 个上课时间。请核对后再合并。` : "没有识别到课程。请上传教务系统直接导出的 Excel、CSV 或 ICS 原文件。" );
    } catch {
      setImported([]);
      setImportMessage("文件解析失败。请重新从教务系统导出 Excel、CSV 或 ICS，不要上传截图或 PDF。");
    } finally {
      setImporting(false);
      input.value = "";
    }
  };

  const patchImported = (key: string, patch: Partial<ImportedCourse>) => setImported((current) => current.map((course) => course.key === key ? { ...course, ...patch } : course));
  const patchImportedSlot = (key: string, slotIndex: number, patch: Partial<Omit<CourseSlot, "id">>) => setImported((current) => current.map((course) => course.key === key ? { ...course, schedule: course.schedule.map((slot, index) => index === slotIndex ? { ...slot, ...patch } : slot) } : course));
  const removeImportedSlot = (key: string, slotIndex: number) => setImported((current) => current.map((course) => course.key === key ? { ...course, schedule: course.schedule.filter((_, index) => index !== slotIndex) } : course).filter((course) => course.schedule.length));

  const mergeImported = () => {
    if (!imported.length || readOnly) return;
    const courses = updateAcademicCourses(data.courses, imported, {
      replaceSchedules, id: uid,
      create: (draft, schedule) => ({ id: uid(), title: draft.title, term, teacher: draft.teacher, location: draft.location, school: draft.school,
        progress: 0, requirements: draft.weeks ? `上课周次：${draft.weeks}` : "", schedule, blocks: starterBlocks("课程资料与笔记") }),
    });
    if (!courseContentPreserved(data.courses, courses)) { setImportMessage("课程内容校验未通过，未应用导入。"); return; }
    // Save the exact pre-import state locally in addition to the existing cloud revision history.
    try { sessionStorage.setItem(`xuliu-before-academic-import-${preset}`, JSON.stringify(data)); }
    catch { setImportMessage("导入前备份未能保存，请先导出数据备份后重试。"); return; }
    setData((current) => ({ ...current, courses: updateAcademicCourses(current.courses, imported, {
      replaceSchedules, id: uid,
      create: (draft, schedule) => ({ id: uid(), title: draft.title, term, teacher: draft.teacher, location: draft.location, school: draft.school,
        progress: 0, requirements: draft.weeks ? `上课周次：${draft.weeks}` : "", schedule, blocks: starterBlocks("课程资料与笔记") }),
    }) }));
    setImportMessage(`已${replaceSchedules ? "重新导入" : "合并"} ${imported.length} 门课程。课名已去除编号，原有课程、笔记、附件和进度完整保留。导入前备份已保存在此浏览器。`);
    setImported([]);
  };

  return <div className="page timetablePage">
    <PageHead
      eyebrow={weekInfo ? `课表 ${weekInfo.timetableWeek} 周 · 实际第 ${weekInfo.actualWeek} 周${weekInfo.miniTerm ? " · 小学期" : ""}` : "本学期尚未开始"}
      title="课程表"
      subtitle="切换周次，查看对应日期的课程；未填写周次的课程按每周课程处理"
      action={<div className="pageHeadActions"><button className="softButton" onClick={() => setImportOpen((value) => !value)}>{importOpen ? "收起教务导入" : "⇧ 教务导入"}</button><button className="primaryButton" disabled={!schoolCourses.length || readOnly} title={schoolCourses.length ? "添加课程时间" : "请先在课内学习中新建课程，或通过教务导入创建课程"} onClick={addSlot}>＋ 添加课程时间</button></div>}
    />

    <section className="panel timetableWeekBar" aria-label="课表周次与学期设置">
      <div className="timetableWeekNavigation" role="group" aria-label="切换课表周次">
        <button className="softButton" disabled={!weekInfo || weekInfo.actualWeek <= 1} onClick={() => setSelectedActualWeek((weekInfo?.actualWeek ?? 1) - 1)}>上一周</button>
        <label className="timetableWeekSelect"><span>查看周次</span><select value={weekInfo?.actualWeek ?? ""} onChange={(event) => setSelectedActualWeek(Number(event.target.value))}>
          <option value="" disabled>选择周次</option>
          {weekOptions.map((actualWeek) => <option key={actualWeek} value={actualWeek}>{actualWeek <= 3 ? `小学期 ${actualWeek - 4} 周` : `第 ${actualWeek - 3} 周`}{actualWeek === currentWeekInfo?.actualWeek ? " · 本周" : ""}</option>)}
        </select></label>
        <button className="softButton" onClick={() => setSelectedActualWeek((weekInfo?.actualWeek ?? 0) + 1)}>下一周</button>
        <button className="softButton" disabled={isCurrentWeek} onClick={() => setSelectedActualWeek(null)}>回到本周</button>
      </div>
      <div className="timetableWeekIdentity" aria-live="polite"><span>{isCurrentWeek ? "本周" : "查看"}</span><strong>{weekInfo ? `${weekInfo.timetableWeek} 周` : "未开始"}</strong><small>{weekInfo ? `实际第 ${weekInfo.actualWeek} 周${weekInfo.miniTerm ? " · 小学期" : ""} · ${weekInfo.weekStartDate.replaceAll("-", "/")}—${weekInfo.weekEndDate.replaceAll("-", "/")}` : `小学期 -3 周从 ${data.timetableSettings.termStartDate} 开始`}</small></div>
      <label className="termStartField"><span>小学期 -3 周周一</span><input type="date" value={data.timetableSettings.termStartDate} disabled={readOnly} onChange={(event) => { const value = event.target.value; if (value) setData((current) => ({ ...current, timetableSettings: { ...current.timetableSettings, termStartDate: value } })); }} /><small>正式秋季第 1 周从 {formalWeekStart.slice(5).replace("-", "/")} 开始</small></label>
      {dualSchool ? <div className="timetableSchoolSwitch" role="group" aria-label="切换学校课表"><span>查看课表</span><div>{(["pku", "bit"] as const).map((school) => <button key={school} className={selectedSchool === school ? "active" : ""} onClick={() => changeSchool(school)}>{academicSchoolLabels[school]}</button>)}</div></div> : null}
    </section>

    {importOpen ? <section className="panel academicImportPanel" aria-label="教务课表导入">
      <div className="academicImportHead">
        <div><span className="cardKicker">ACADEMIC IMPORT</span><h2>从教务系统导入</h2><p>文件只在当前浏览器中解析，确认前不会写入课程表。</p></div>
        <div className="schoolPreset" role="group" aria-label="选择学校">
          <button className={preset === "pku" ? "active" : ""} onClick={() => { if (dualSchool) changeSchool("pku"); else setPreset("pku"); setImported([]); setImportMessage(""); }}>北京大学</button>
          <button className={preset === "bit" ? "active" : ""} onClick={() => { if (dualSchool) changeSchool("bit"); else setPreset("bit"); setImported([]); setImportMessage(""); }}>北京理工大学</button>
        </div>
      </div>
      <div className="academicImportGuide">
        <div><strong>{preset === "pku" ? "北大校内门户" : "北理工教务系统"}</strong><span>{preset === "pku" ? "进入“我的课表”，下载或导出课表原文件" : "进入“课表查询”，使用导出功能下载原文件"}</span></div>
        <div><strong>支持格式</strong><span>Excel（.xlsx）、CSV、ICS 日历文件</span></div>
        <div><strong>导入方式</strong><span>自动识别 → 手动核对 → 安全合并，不覆盖已有笔记</span></div>
      </div>
      <div className="academicFileRow">
        <label className={`academicFileButton ${importing ? "disabled" : ""}`} htmlFor="academic-course-file">{importing ? "正在识别…" : "选择教务课表文件"}</label>
        <input id="academic-course-file" className="visuallyHidden" type="file" accept=".xlsx,.csv,.ics,text/csv,text/calendar,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importing || readOnly} onChange={handleAcademicFile} />
        <span>{importFileName || "尚未选择文件"}</span>
      </div>
      {importMessage ? <p className={`academicImportMessage ${imported.length ? "success" : ""}`}>{importMessage}</p> : null}
      {imported.length ? <div className="academicPreview">
        <label className="academicReplaceOption"><input type="checkbox" checked={replaceSchedules} disabled={readOnly} onChange={(event) => setReplaceSchedules(event.target.checked)} /><span>重新导入：替换本文件对应课程的教务时间，保留手动时间、原课程和全部笔记</span></label><div className="academicPreviewHead"><div><strong>导入预览</strong><span>{imported.length} 门课程 · 可在合并前修正</span></div><button className="primaryButton" disabled={readOnly} onClick={mergeImported}>{replaceSchedules ? "确认重新导入课表" : "确认合并到课程表"}</button></div>
        <div className="academicPreviewList">{imported.map((course) => <article className="academicPreviewCard" key={course.key}>
          <div className="academicCourseFields">
            <label><span>课程名称</span><input value={course.title} onChange={(event) => patchImported(course.key, { title: event.target.value })} /></label>
            <label><span>任课教师</span><input value={course.teacher} placeholder="可稍后补充" onChange={(event) => patchImported(course.key, { teacher: event.target.value })} /></label>
          </div>
          <div className="academicSlots">{course.schedule.map((slot, slotIndex) => <div className="academicSlotRow" key={`${course.key}-${slotIndex}`}>
            <select aria-label={`${course.title} 星期`} value={slot.weekday} onChange={(event) => patchImportedSlot(course.key, slotIndex, { weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select>
            <input aria-label={`${course.title} 开始时间`} type="time" value={slot.start} onChange={(event) => patchImportedSlot(course.key, slotIndex, { start: event.target.value })} />
            <span>—</span>
            <input aria-label={`${course.title} 结束时间`} type="time" value={slot.end} onChange={(event) => patchImportedSlot(course.key, slotIndex, { end: event.target.value })} />
            <input aria-label={`${course.title} 地点`} value={slot.location} placeholder="上课地点" onChange={(event) => patchImportedSlot(course.key, slotIndex, { location: event.target.value })} />
            <input aria-label={`${course.title} 周次`} value={slot.weeks ?? ""} placeholder="周次" onChange={(event) => patchImportedSlot(course.key, slotIndex, { weeks: event.target.value })} />
            <button className="miniRemove" aria-label={`移除 ${course.title} 的这个时间`} onClick={() => removeImportedSlot(course.key, slotIndex)}>×</button>
          </div>)}</div>
        </article>)}</div>
      </div> : null}
    </section> : null}

    <section className="panel timetableMatrixShell" aria-label={weekInfo ? `第 ${weekInfo.timetableWeek} 周课程表` : "课程表"}>
      <div className="timetableMatrix">
        <div className="timetableTimeHead"><span>TIMETABLE</span><strong>时间</strong></div>
        {weekdays.map((day, index) => <div className={`timetableColumnHead ${weekDates[index] === today ? "today" : ""}`} key={day}><strong>{day}</strong><span>{weekDates[index]?.slice(5).replace("-", "/")}</span></div>)}
        {timeRanges.map((range, rowIndex) => <Fragment key={`${range.start}-${range.end}`}>
          <div className="timetableTimeCell"><small>{range.label}</small><strong>{range.start}</strong><span>{range.end}</span></div>
          {weekdays.map((day, dayIndex) => {
            const slots = visibleEntries.filter(({ slot }) => slot.weekday === dayIndex + 1 && timetableRowIndex(slot.start, selectedSchool) === rowIndex);
            return <div className={`timetableSlotCell ${weekDates[dayIndex] === today ? "today" : ""}`} key={`${day}-${range.start}`}>{slots.map(({ course, slot }) => <article className="timetableCard" key={slot.id}><button className="timetableOpen" onClick={() => openCourse(course.id)}><span className="timetableCardTime">{slot.start}—{slot.end}</span><strong>{course.title}</strong><small>{slot.location || course.location || "地点未填写"}</small><span>{slot.weeks || "每周"}</span></button>{!readOnly && <button className="miniRemove" aria-label={`移除 ${course.title} 的课程时间`} onClick={() => deleteDialog(`${course.title} ${day} ${slot.start}`, () => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, schedule: item.schedule.filter((entry) => entry.id !== slot.id) } : item) })))}>×</button>}</article>)}</div>;
          })}
        </Fragment>)}
      </div>
      {!visibleEntries.length && <div className="timetableGridNotice"><strong>{weekInfo ? `${weekInfo.timetableWeek} 周没有课程` : "本学期尚未开始"}</strong><span>{weekInfo ? `${dualSchool ? academicSchoolLabels[selectedSchool] : "当前空间"}在所选周次没有已排课程，可切换其他周次查看。` : "可选择周次，提前查看本学期课程。"}</span></div>}
    </section>
  </div>;
}

function TimetableView({ data, setData, setDialog, openCourse, deleteDialog }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; openCourse: (id: string) => void; deleteDialog: (title: string, onDelete: () => void) => void }) {
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const addSlot = () => setDialog({ title: "添加课程时间", description: "同一门课程可以添加多个上课时间。", submitLabel: "加入课程表", fields: [{ name: "course", label: "课程", type: "select", options: data.courses.map((course) => course.title) }, { name: "weekday", label: "星期", type: "select", options: weekdays }, { name: "start", label: "开始时间", type: "time", value: "08:00" }, { name: "end", label: "结束时间", type: "time", value: "09:40" }, { name: "location", label: "地点" }], onSubmit: (values) => setData((current) => ({ ...current, courses: current.courses.map((course) => course.title === values.course ? { ...course, schedule: [...course.schedule, { id: uid(), weekday: Math.max(1, weekdays.indexOf(values.weekday) + 1), start: values.start, end: values.end, location: values.location || course.location }] } : course) })) });
  return <div className="page timetablePage"><PageHead eyebrow="本学期 · 每周节奏" title="课程表" subtitle="课程表只管理固定上课时间；考试、作业与重要节点仍进入日历和任务总览" action={<button className="primaryButton" disabled={!data.courses.length} title={data.courses.length ? "添加课程时间" : "请先新建课程"} onClick={addSlot}>＋ 添加课程时间</button>} /><section className="timetableGrid">{weekdays.map((day, index) => { const slots = data.courses.flatMap((course) => course.schedule.filter((slot) => slot.weekday === index + 1).map((slot) => ({ course, slot }))).sort((a, b) => a.slot.start.localeCompare(b.slot.start)); return <div className="timetableDay" key={day}><div className="timetableDayHead"><strong>{day}</strong><span>{slots.length} 节</span></div>{slots.length ? slots.map(({ course, slot }) => <article className="timetableCard" key={slot.id}><button className="timetableOpen" onClick={() => openCourse(course.id)}><span>{slot.start}—{slot.end}</span><strong>{course.title}</strong><small>{slot.location || course.location}</small></button><button className="miniRemove" aria-label={`移除 ${course.title} 的课程时间`} onClick={() => deleteDialog(`${course.title} ${day} ${slot.start}`, () => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, schedule: item.schedule.filter((entry) => entry.id !== slot.id) } : item) })))}>×</button></article>) : <p className="timetableEmpty">没有课程</p>}</div>; })}</section></div>;
}

function preserveTaskContent(current: TaskItem, settings: TaskItem): TaskItem {
  return { ...settings, elapsed: current.elapsed, blocks: current.blocks };
}

function ManualTimeDialog({ target, title, onClose, onSave }: { target: WorkTarget; title: string; onClose: () => void; onSave: (entry: TimeEntry) => void }) {
  const [minutes, setMinutes] = useState("30");
  const [date, setDate] = useState(dateKey());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const entryId = useRef(uid());
  return <div className="dialogScrim"><form className="appDialog" role="dialog" aria-modal="true" aria-label="补记任务时间" onSubmit={event => {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 1440) { setError("请输入 1—1440 之间的整数分钟数"); return; }
    if (!dateKeyPattern.test(date)) { setError("请选择记录日期"); return; }
    try { onSave({ id: entryId.current, taskId: target.id, targetKind: target.kind, minutes: value, date, mode: "manual", note: note.trim() }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "未保存，请重试"); }
  }}><div className="dialogHead"><div><span>时间记录</span><h2>补记投入时间</h2><p>{title}</p></div><button type="button" aria-label="关闭补记" onClick={onClose}>×</button></div><div className="dialogFields"><label>分钟数<input required type="number" min="1" max="1440" step="1" value={minutes} onChange={e => setMinutes(e.target.value)} /></label><label>记录日期<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="wide">做了什么<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：审阅初稿，调整第三部分结构" /></label></div>{error && <p role="alert" className="dialogError">{error}</p>}<div className="dialogActions"><button type="button" className="softButton" onClick={onClose}>取消</button><button className="primaryButton" type="submit">记入时间</button></div></form></div>;
}

function TaskDetail({ target, data, setData, access, focus, focusPanel, onManual, onOpen, onClose, requestDelete, postponeWork }: {
  target: WorkTarget; data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; access: EditorAccess;
  focus: FocusController; focusPanel: React.ReactNode; onManual: (target: WorkTarget) => void; onOpen: (target: WorkTarget) => void; onClose: () => void;
  requestDelete: (target: WorkTarget, title: string) => void; postponeWork: (target: WorkTarget, days?: number) => void;
}) {
  const [editing, setEditing] = useState<TaskItem | "new" | null>(null);
  const [nodePending, setNodePending] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  const task = target.kind === "task" ? data.tasks.find((entry) => entry.id === target.id) : undefined;
  const node = target.kind === "milestone" ? data.milestones.find((entry) => entry.id === target.id) : undefined;
  const item = task ?? node;
  if (!item) return <div className="page"><button className="backButton" onClick={onClose}>← 返回</button><p>这项内容已不存在。</p></div>;
  const isEvent = Boolean(node && !node.courseId);
  const isCourseTask = Boolean(node?.courseId);
  const entityLabel = isEvent ? "事项" : "任务";
  const descendants = descendantTasks(data.tasks, target);
  const children = data.tasks.filter((entry) => target.kind === "task" ? entry.parentId === target.id : entry.parentMilestoneId === target.id);
  const entries = data.timeEntries.filter((entry) => entryMatches(entry, target));
  const ownMinutes = item.elapsed ?? 0;
  const combined = ownMinutes + descendants.reduce((sum, entry) => sum + entry.elapsed, 0);
  const parent: WorkTarget | undefined = task?.parentId ? { kind: "task", id: task.parentId } : task?.parentMilestoneId ? { kind: "milestone", id: task.parentMilestoneId } : undefined;
  const parentTitle = parent?.kind === "task" ? data.tasks.find((entry) => entry.id === parent.id)?.title : data.milestones.find((entry) => entry.id === parent?.id)?.title;
  const subtitle = task
    ? (taskModeOf(task) === "multi" ? "长期任务" : "短期任务") + " · " + task.area + " · " + task.source + " · " + taskScheduleSummary(task, dateKey())
    : isCourseTask
      ? (node?.mode === "multi" ? "长期任务" : "短期任务") + " · 课内 · " + node?.date + " " + node?.time + " · " + (data.courses.find((course) => course.id === node?.courseId)?.title ?? "课程任务")
      : "事项 · " + node?.area + " · " + node?.date + " " + node?.time + (node?.location ? " · " + node.location : "");
  const toggle = () => setData((current) => target.kind === "task"
    ? { ...current, tasks: current.tasks.map((entry) => entry.id === target.id ? withTaskCompletion(entry, !entry.done) : entry) }
    : { ...current, milestones: current.milestones.map((entry) => entry.id === target.id ? { ...entry, done: !entry.done } : entry) });
  const remove = () => requestDelete(target, item.title);
  const saveTask = (value: TaskItem) => {
    setData((current) => ({ ...current, tasks: current.tasks.some((entry) => entry.id === value.id) ? current.tasks.map((entry) => entry.id === value.id ? preserveTaskContent(entry, value) : entry) : [...current.tasks, value] }));
    setEditing(null);
  };
  const saveBlocks = (blocks: Block[]) => setData((current) => target.kind === "task"
    ? { ...current, tasks: current.tasks.map((entry) => entry.id === target.id ? { ...entry, blocks } : entry) }
    : { ...current, milestones: current.milestones.map((entry) => entry.id === target.id ? { ...entry, blocks } : entry) });
  return <div className="page taskDetailPage">
    <button className="backButton" disabled={nodePending} onClick={onClose}>← 返回列表</button>
    <PageHead eyebrow={isEvent ? "事项详情" : isCourseTask ? "课程任务详情" : "任务详情"} title={item.title} subtitle={subtitle} action={<div className="pageHeadActions">{task && <button className="softButton" disabled={access.readOnly} onClick={() => setEditing(task)}>任务设置</button>}{!item.done && <button className="softButton" disabled={access.readOnly || nodePending} onClick={() => postponeWork(target)}>推迟 1 天</button>}<button className="primaryButton" disabled={access.readOnly} onClick={toggle}>{item.done ? "重新打开" + entityLabel : "标记" + entityLabel + "完成"}</button><button className="textButton dangerText" disabled={access.readOnly || nodePending} onClick={remove}>删除{entityLabel}</button></div>} />
    {parent && <button className="taskParentLink" disabled={nodePending} onClick={() => onOpen(parent)}>属于：{parentTitle ?? "查看关联内容"} →</button>}
    <div className="taskDetailGrid"><div className="stack">
      <section className="panel taskTimePanel" aria-label={entityLabel + "时间记录"}><SectionHead title="时间投入" subtitle={"计时与手动补记都会累计到这一" + entityLabel} action={<div className="pageHeadActions"><button className="primaryButton" disabled={access.readOnly} onClick={() => focus.start(target)}>为此{entityLabel}计时</button><button className="softButton" disabled={access.readOnly} onClick={() => onManual(target)}>补记时间</button></div>} /><div className="taskTimeStats"><div><strong>{formatMinutes(ownMinutes)}</strong><span>本{entityLabel}累计</span></div><div><strong>{formatMinutes(entries.filter((entry) => entry.date === dateKey()).reduce((sum, entry) => sum + entry.minutes, 0))}</strong><span>今日投入</span></div>{descendants.length > 0 && <div><strong>{formatMinutes(combined)}</strong><span>含全部子任务</span></div>}</div><div className="taskTimeHistory">{[...entries].reverse().slice(0, 50).map((entry) => <div key={entry.id}><time>{entry.date}</time><strong>{entry.minutes} 分钟</strong><span>{entry.mode === "manual" ? "手动补记" : entry.mode === "pomodoro" ? "番茄钟" : "正向计时"}</span>{entry.note && <p>{entry.note}</p>}</div>)}{entries.length === 0 && <p className="muted">还没有时间明细。开始计时，或补记已经投入的时间。</p>}{entries.length > 50 && <p>显示最近 50 条；全部记录保留在数据备份中。</p>}</div></section>
      <section className="panel taskChildrenPanel"><SectionHead title={isEvent ? "关联任务" : "子任务"} subtitle={children.length ? children.filter((entry) => entry.done).length + " / " + children.length + " 项完成" : isEvent ? "可把需要跟进的动作建为关联任务" : "把任务拆成今天可以推进的一小步"} action={<button className="softButton" disabled={access.readOnly || nodePending} onClick={() => setEditing("new")}>＋ 添加任务</button>} /><div className="taskList">{children.map((child) => <div className={"taskRow " + (child.done ? "done" : "")} key={child.id}><button className="checkButton" disabled={access.readOnly} aria-label={"切换子任务完成：" + child.title} onClick={() => setData((current) => ({ ...current, tasks: current.tasks.map((entry) => entry.id === child.id ? withTaskCompletion(entry, !entry.done) : entry) }))}>{child.done ? "✓" : ""}</button><div className="taskBody"><button className="taskTitleButton" disabled={nodePending} onClick={() => onOpen({ kind: "task", id: child.id })}>{child.title}</button><span>{child.due ?? "未设日期"} · 已投入 {child.elapsed} 分钟</span></div></div>)}</div></section>
      {task && <section className="panel taskRequirements"><SectionHead title="具体要求" subtitle="在详情页可直接补充完成标准和参考信息" /><label className="editField"><span>任务要求</span><textarea readOnly={access.readOnly} maxLength={4000} value={task.requirements ?? ""} placeholder="填写交付内容、完成标准、参考信息等…" onChange={(event) => { const requirements = event.target.value; setData((current) => ({ ...current, tasks: current.tasks.map((entry) => entry.id === task.id ? { ...entry, requirements } : entry) })); }} /></label></section>}
      {node && <section className="panel taskRequirements"><CourseNodeEditor node={node} variant={node.courseId ? "courseTask" : "event"} access={access} onPendingChange={setNodePending} onChange={(update) => setData((current) => ({ ...current, milestones: current.milestones.map((entry) => entry.id === node.id ? update(entry) : entry) }))} onClose={onClose} /></section>}
      <section className="panel editorSection" aria-label={entityLabel + "记录空间"}><SectionHead title={entityLabel + "记录"} subtitle="记录思路、过程与结果；各入口共享这份内容" /><BlockEditor blocks={item.blocks ?? []} onChange={saveBlocks} access={access} /></section>
      {task?.progressLogs?.length ? <section className="panel taskProgressHistory"><SectionHead title="推进历史" subtitle="保留已有进度记录" />{[...task.progressLogs].reverse().slice(0, 20).map((log) => <div key={log.id}><time>{log.date}</time><span>{log.status} · {log.progress}%</span><p>{log.note}</p></div>)}</section> : null}
    </div><aside className="taskFocusAside">{focusPanel}</aside></div>
    {editing && <TaskSettingsDialog tasks={data.tasks} milestones={data.milestones} courses={data.courses} learning={data.learning} task={editing === "new" ? undefined : editing} presetParent={editing === "new" ? target : undefined} onClose={() => setEditing(null)} onSave={saveTask} />}
  </div>;
}
function TaskOverviewView({ data, setData, setDialog, openWork, requestDelete, postponeWork, readOnly }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; openWork: (target: WorkTarget) => void; requestDelete: (target: WorkTarget, title: string) => void; postponeWork: (target: WorkTarget, days?: number) => void; readOnly: boolean }) {
  const [scope, setScope] = useState<"semester" | "week" | "active" | "done">("semester");
  const [editingTask, setEditingTask] = useState<TaskItem | "new" | null>(null);
  const [editingNode, setEditingNode] = useState<Milestone | null>(null);
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const weekEnd = dateKey(end);
  const items = [
    ...data.tasks.map((task) => ({ id: task.id, kind: "task" as const, entity: "task" as const, period: taskModeOf(task), title: task.title, area: task.area, source: task.courseId ? data.courses.find((course) => course.id === task.courseId)?.title ?? task.source : task.source, due: task.due ?? "", done: task.done, progress: taskProgressOf(task), status: taskStatusOf(task), task, node: undefined })),
    ...data.milestones.map((node) => ({ id: node.id, kind: "milestone" as const, entity: node.courseId ? "task" as const : "event" as const, period: node.courseId ? (node.mode ?? "single") as TaskMode : undefined, title: node.title, area: node.area, source: node.courseId ? data.courses.find((course) => course.id === node.courseId)?.title ?? "课程任务" : node.location || "日历事项", due: node.date, done: node.done, progress: node.done ? 100 : 0, status: node.done ? "已完成" as const : "未开始" as const, task: undefined, node })),
  ].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const visible = items.filter((item) => {
    if (scope === "done") return item.done;
    if (scope === "active") return !item.done && item.entity === "task" && item.period === "multi";
    if (scope === "week") return !item.done && (item.task ? taskOverlapsRange(item.task, today, weekEnd) : Boolean(item.due && item.due >= today && item.due <= weekEnd));
    return !item.done;
  });
  const sections = [
    { id: "multi", title: "长期任务", subtitle: "持续推进的课程、工作与个人任务", items: visible.filter((item) => item.entity === "task" && item.period === "multi") },
    { id: "single", title: "短期任务", subtitle: "一次或短期完成的任务，课程节点也在这里", items: visible.filter((item) => item.entity === "task" && item.period !== "multi") },
    { id: "event", title: "事项", subtitle: "会议、预约、行程等日历事件", items: visible.filter((item) => item.entity === "event") },
  ];
  const taskCount = items.filter((item) => item.entity === "task").length;
  const eventCount = items.filter((item) => item.entity === "event").length;
  const weekCount = items.filter((item) => !item.done && (item.task ? taskOverlapsRange(item.task, today, weekEnd) : Boolean(item.due && item.due >= today && item.due <= weekEnd))).length;
  const toggle = (item: (typeof items)[number]) => setData((current) => item.kind === "task"
    ? { ...current, tasks: current.tasks.map((entry) => entry.id === item.id ? withTaskCompletion(entry, !entry.done) : entry) }
    : { ...current, milestones: current.milestones.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) });
  const saveTask = (task: TaskItem) => setData((current) => ({ ...current, tasks: current.tasks.some((item) => item.id === task.id) ? current.tasks.map((item) => item.id === task.id ? preserveTaskContent(item, task) : item) : [...current.tasks, task] }));
  const addEvent = () => setDialog({
    title: "新增事项",
    description: "事项用于会议、预约、行程等日历事件；需要完成的内容请新增任务。",
    submitLabel: "创建事项",
    fields: [
      { name: "title", label: "事项名称", placeholder: "例如：项目会议" },
      { name: "date", label: "日期", type: "date", value: today },
      { name: "time", label: "时间", type: "time", value: "00:00" },
      { name: "location", label: "地点" },
      { name: "requirements", label: "事项说明", type: "textarea", placeholder: "议程、携带材料或其他说明" },
      { name: "area", label: "所属领域", type: "select", options: ["课内", "课外", "工作", "生活", "思考"], value: "工作" },
    ],
    onSubmit: (values) => {
      const id = uid();
      setData((current) => ({ ...current, milestones: [...current.milestones, { id, title: values.title.trim() || "未命名事项", date: values.date || today, time: values.time || "00:00", location: values.location.trim(), requirements: values.requirements.trim(), area: (values.area || "工作") as Area, done: false }] }));
    },
  });
  const recordProgress = (task: TaskItem) => setDialog({
    title: "记录“" + task.title + "”的今日进度",
    description: "当前 " + taskProgressOf(task) + "%。这条记录会保留日期，方便之后查看每天推进了什么。",
    submitLabel: "保存今日进度",
    fields: [
      { name: "progress", label: "完成进度（0—100）", type: "number", value: String(taskProgressOf(task)) },
      { name: "status", label: "当前状态", type: "select", options: taskStatusOptions, value: taskStatusOf(task) },
      { name: "note", label: "今天推进了什么", type: "textarea", placeholder: "例如：完成资料整理和第一部分初稿" },
    ],
    onSubmit: (values) => setData((current) => ({ ...current, tasks: current.tasks.map((item) => {
      if (item.id !== task.id) return item;
      let nextProgress = Math.min(100, Math.max(0, Math.round(Number(values.progress) || 0)));
      let nextStatus = taskStatusOptions.includes(values.status as TaskProgressStatus) ? values.status as TaskProgressStatus : taskStatusOf(item);
      if (nextProgress >= 100 || nextStatus === "已完成") { nextProgress = 100; nextStatus = "已完成"; }
      else if (nextProgress > 0 && nextStatus === "未开始") nextStatus = "进行中";
      return { ...item, done: nextStatus === "已完成", progress: nextProgress, status: nextStatus, progressLogs: [...(item.progressLogs ?? []).slice(-1_999), { id: uid(), date: today, progress: nextProgress, status: nextStatus, note: values.note.trim().slice(0, 500) }] };
    }) })),
  });
  return <div className="page taskOverviewPage">
    <PageHead eyebrow="全局执行与时间系统" title="任务与事项" subtitle="任务按长期、短期分区并显示所属领域；事项单独管理" action={<div className="pageHeadActions"><button className="primaryButton" disabled={readOnly} onClick={() => setEditingTask("new")}>＋ 新增任务</button><button className="softButton" disabled={readOnly} onClick={addEvent}>＋ 新增事项</button></div>} />
    <div className="overviewStats"><div><span>全部任务</span><strong>{taskCount}</strong></div><div><span>全部事项</span><strong>{eventCount}</strong></div><div><span>本周待办</span><strong>{weekCount}</strong></div></div>
    <div className="scopeTabs taskScopeTabs"><button className={scope === "semester" ? "active" : ""} onClick={() => setScope("semester")}>全部待办</button><button className={scope === "week" ? "active" : ""} onClick={() => setScope("week")}>本周</button><button className={scope === "active" ? "active" : ""} onClick={() => setScope("active")}>长期推进</button><button className={scope === "done" ? "active" : ""} onClick={() => setScope("done")}>已完成</button></div>
    <div className="taskOverviewSections">{sections.map((section) => <section className={"panel overviewPanel overviewGroup " + section.id} key={section.id}>
      <div className="overviewGroupHead"><div><span>{section.id === "event" ? "日历" : "任务"}</span><h2>{section.title}</h2><p>{section.subtitle}</p></div><strong>{section.items.length}</strong></div>
      <div className="overviewList">{section.items.map((item) => {
        const isMulti = item.entity === "task" && item.period === "multi";
        const latest = item.task?.progressLogs?.at(-1);
        return <div className={"overviewRow " + (item.done ? "done " : "") + (isMulti ? "multiTask" : "")} key={item.kind + "-" + item.id}>
          <button className="checkButton" disabled={readOnly} aria-pressed={item.done} aria-label={(item.done ? "重新打开" : "完成") + item.title} onClick={() => toggle(item)}>{item.done ? "✓" : ""}</button>
          <div className="overviewTaskMain"><div className="overviewTaskTitle"><button className="taskTitleButton" onClick={() => readOnly ? openWork({ kind: item.kind, id: item.id }) : item.task ? setEditingTask(item.task) : setEditingNode(item.node!)}>{item.title}</button>{isMulti && <span className={"taskStatus " + item.status}>{item.status}</span>}</div><span>{item.task?.parentId ? "属于：" + (data.tasks.find((task) => task.id === item.task!.parentId)?.title ?? "上级任务") : item.task?.parentMilestoneId ? "属于：" + (data.milestones.find((node) => node.id === item.task!.parentMilestoneId)?.title ?? "关联对象") : item.source || "未分类"}{item.node?.courseId ? " · 课程任务" : ""}</span>{isMulti && item.task && <><div className="taskOverviewProgress"><i><b style={{ width: item.progress + "%" }} /></i><strong>{item.progress}%</strong></div>{latest && <small>{latest.date}{latest.note ? " · " + latest.note : " · 记录为 " + latest.progress + "%"}</small>}</>}</div>
          <span className={"areaTag " + areaClass[item.area]}>{item.area}</span>
          <div className="overviewSchedule"><time>{item.task && isMulti ? (item.task.startDate || "未设开始") + " → " + (item.due || "未设截止") : item.due || "未设日期"}</time>{item.task && isMulti && <small>{taskScheduleSummary(item.task, today)}</small>}{item.node && <small>{item.node.time}{item.node.location ? " · " + item.node.location : ""}</small>}</div>
          <div className="overviewTaskActions"><button className="softButton" disabled={readOnly} onClick={() => item.task ? setEditingTask(item.task) : setEditingNode(item.node!)}>修改</button><button className="softButton" onClick={() => openWork({ kind: item.kind, id: item.id })}>详细界面</button>{!item.done && <button className="quickPostponeButton" disabled={readOnly} onClick={() => postponeWork({ kind: item.kind, id: item.id })}>推迟 1 天</button>}{item.task && !readOnly && isMulti && !item.done && <button className="softButton" onClick={() => recordProgress(item.task!)}>记录进度</button>}<button className="textButton dangerText" disabled={readOnly} onClick={() => requestDelete({ kind: item.kind, id: item.id }, item.title)}>删除</button></div>
        </div>;
      })}{!section.items.length && <div className="emptyState compact"><h2>暂无{section.title}</h2><p>{scope === "done" ? "这里还没有已完成内容。" : "可从右上角新增，或修改已有内容的分类。"}</p></div>}</div>
    </section>)}</div>
    {editingTask && <TaskSettingsDialog tasks={data.tasks} milestones={data.milestones} courses={data.courses} learning={data.learning} task={editingTask === "new" ? undefined : editingTask} onClose={() => setEditingTask(null)} onSave={(task) => { saveTask(task); setEditingTask(null); }} onOpenDetail={editingTask === "new" ? undefined : () => { const id = editingTask.id; setEditingTask(null); openWork({ kind: "task", id }); }} />}
    {editingNode && <MilestoneSettingsDialog node={editingNode} onClose={() => setEditingNode(null)} onSave={(node) => { setData((current) => ({ ...current, milestones: current.milestones.map((item) => item.id === node.id ? node : item) })); setEditingNode(null); }} onOpenDetail={() => { const id = editingNode.id; setEditingNode(null); openWork({ kind: "milestone", id }); }} />}
  </div>;
}

function TaskSettingsDialog({ task, tasks, milestones, courses, learning, presetParent, onClose, onSave, onOpenDetail }: { task?: TaskItem; tasks: TaskItem[]; milestones: Milestone[]; courses: Course[]; learning: LearningArea[]; presetParent?: WorkTarget; onClose: () => void; onSave: (task: TaskItem) => void; onOpenDetail?: () => void }) {
  const presetTask = presetParent?.kind === "task" ? tasks.find((item) => item.id === presetParent.id) : undefined;
  const presetNode = presetParent?.kind === "milestone" ? milestones.find((item) => item.id === presetParent.id) : undefined;
  const parentItem = presetTask ?? presetNode;
  const classroomSubjects = Array.from(new Map(courses.filter((course) => isCourseTitleCandidate(course.title)).map((course) => [course.title.trim(), course])).values()).map((course) => ({ id: course.id, title: course.title.trim(), area: "课内" as const }));
  const extracurricularSubjects = Array.from(new Map(learning.filter((item) => item.title.trim()).map((item) => [item.title.trim(), item])).values()).map((subject) => ({ id: subject.id, title: subject.title.trim(), area: "课外" as const }));
  const subjectOptions = [...classroomSubjects, ...extracurricularSubjects];
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 7);
  const initialMode = taskModeOf(task ?? {});
  const [mode, setMode] = useState<TaskMode>(initialMode);
  const [origin, setOrigin] = useState<"course" | "other">(task ? task.courseId ? "course" : "other" : "course");
  const [courseId, setCourseId] = useState(task?.courseId ?? presetNode?.courseId ?? subjectOptions[0]?.id ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [requirements, setRequirements] = useState(task?.requirements ?? "");
  const [area, setArea] = useState<Area>(task?.area ?? parentItem?.area ?? subjectOptions[0]?.area ?? "课内");
  const [source, setSource] = useState(task?.source ?? parentItem?.title ?? subjectOptions[0]?.title ?? "");
  const [parent, setParent] = useState(task?.parentId ? "task:" + task.parentId : task?.parentMilestoneId ? "milestone:" + task.parentMilestoneId : presetParent ? presetParent.kind + ":" + presetParent.id : "");
  const [parentCandidate, setParentCandidate] = useState(task?.parentCandidate ?? initialMode === "multi");
  const excludedParents = new Set(task ? [task.id, ...descendantTasks(tasks, { kind: "task", id: task.id }).map((item) => item.id)] : []);
  const selectedParentId = parent.startsWith("task:") ? parent.slice(5) : "";
  const selectedNodeId = parent.startsWith("milestone:") ? parent.slice(10) : "";
  const taskParents = tasks.filter((item) => !excludedParents.has(item.id) && (!item.done || item.id === selectedParentId) && ((item.parentCandidate ?? taskModeOf(item) === "multi") || item.id === selectedParentId));
  const nodeParents = milestones.filter((item) => item.courseId && (!item.done || item.id === selectedNodeId) && ((item.parentCandidate ?? item.mode === "multi") || item.id === selectedNodeId));
  const eventParents = milestones.filter((item) => !item.courseId && (!item.done || item.id === selectedNodeId));
  const [startDate, setStartDate] = useState(task?.startDate || today);
  const [due, setDue] = useState(task?.due || (initialMode === "multi" ? dateKey(defaultEnd) : today));
  const [status, setStatus] = useState<TaskProgressStatus>(taskStatusOf(task ?? {}));
  const [progress, setProgress] = useState(taskProgressOf(task ?? {}));
  const [error, setError] = useState("");
  const openDetailAfterSave = useRef(false);
  const selectedSubject = subjectOptions.find((subject) => subject.id === courseId);
  const updateOrigin = (next: "course" | "other") => {
    setOrigin(next);
    if (next === "course") {
      const subject = selectedSubject ?? subjectOptions[0];
      setCourseId(subject?.id ?? "");
      setArea(subject?.area ?? "课内");
      setSource(subject?.title ?? "学习任务");
    } else {
      setCourseId("");
      if (area === "课内") setArea("工作");
      if (!task) setSource("");
    }
  };
  const updateParent = (value: string) => {
    setParent(value);
    if (value.startsWith("task:")) {
      const item = tasks.find((candidate) => candidate.id === value.slice(5));
      if (item) { setArea(item.area); setSource(item.title); }
    } else if (value.startsWith("milestone:")) {
      const item = milestones.find((candidate) => candidate.id === value.slice(10));
      if (item) { setArea(item.area); setSource(item.title); }
    }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError("请填写任务名称"); return; }
    if (origin === "course" && subjectOptions.length > 0 && !courseId) { setError("请选择所属学习科目"); return; }
    if (mode === "multi" && (!startDate || !due || startDate > due)) { setError("长期任务的开始日期不能晚于截止日期"); return; }
    let nextProgress = mode === "multi" ? Math.min(100, Math.max(0, Math.round(progress))) : (status === "已完成" ? 100 : 0);
    let nextStatus = status;
    if (nextProgress >= 100 || nextStatus === "已完成") { nextProgress = 100; nextStatus = "已完成"; }
    else if (nextProgress > 0 && nextStatus === "未开始") nextStatus = "进行中";
    const changed = Boolean(task) && (nextProgress !== taskProgressOf(task!) || nextStatus !== taskStatusOf(task!));
    const progressLogs = [...(task?.progressLogs ?? [])];
    if (changed) progressLogs.push({ id: uid(), date: today, progress: nextProgress, status: nextStatus, note: "在任务设置中更新" });
    const nextTask: TaskItem = {
      ...task,
      parentId: parent.startsWith("task:") ? parent.slice(5) : undefined,
      parentMilestoneId: parent.startsWith("milestone:") ? parent.slice(10) : undefined,
      courseId: origin === "course" ? courseId || undefined : undefined,
      id: task?.id ?? uid(),
      title: title.trim().slice(0, 500),
      requirements: requirements.trim().slice(0, 4_000),
      parentCandidate,
      area: origin === "course" ? selectedSubject?.area ?? area : area,
      source: origin === "course" ? selectedSubject?.title || source.trim() || "学习任务" : source.trim().slice(0, 500) || area + "任务",
      due: due || undefined,
      done: nextStatus === "已完成",
      today: mode === "single" && due === today,
      elapsed: task?.elapsed ?? 0,
      mode,
      startDate: mode === "multi" ? startDate : undefined,
      status: nextStatus,
      progress: nextProgress,
      progressLogs: progressLogs.slice(-2_000),
    };
    const relationError = parentError([...tasks.filter((item) => item.id !== nextTask.id), nextTask], milestones);
    if (relationError) { setError(relationError); return; }
    onSave(nextTask);
    if (openDetailAfterSave.current) onOpenDetail?.();
  };
  const history = [...(task?.progressLogs ?? [])].reverse().slice(0, 5);
  return <div className="dialogScrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="appDialog taskSettingsDialog" role="dialog" aria-modal="true" aria-label={task ? "修改任务" : "新增任务"} onSubmit={submit}>
    <div className="dialogHead"><div><span>任务设置</span><h2>{task ? "修改任务" : "新增任务"}</h2><p>先选择任务周期；学习任务可关联课内或课外学习科目。</p></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>
    <div className="taskModePicker"><button type="button" className={mode === "single" ? "active" : ""} onClick={() => { setMode("single"); if (!task) setParentCandidate(false); }}><strong>短期任务</strong><span>一次或短期完成</span></button><button type="button" className={mode === "multi" ? "active" : ""} onClick={() => { if (!task && due === today) setDue(dateKey(defaultEnd)); setMode("multi"); if (!task) setParentCandidate(true); }}><strong>长期任务</strong><span>持续推进并记录进度</span></button></div>
    <div className="taskOriginPicker"><button type="button" className={origin === "course" ? "active" : ""} onClick={() => updateOrigin("course")}><strong>学习任务</strong><span>关联课内或课外学习科目</span></button><button type="button" className={origin === "other" ? "active" : ""} onClick={() => updateOrigin("other")}><strong>其他任务</strong><span>工作、生活或思考</span></button></div>
    <div className="dialogFields taskDialogFields">
      <label className="wide"><span>任务名称</span><input autoFocus required maxLength={500} value={title} placeholder="要完成什么？" onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="wide"><span>具体要求</span><textarea maxLength={4000} value={requirements} placeholder="填写交付内容、完成标准、参考信息等…" onChange={(event) => setRequirements(event.target.value)} /></label>
      {origin === "course" ? <><label><span>所属学习科目</span><select value={courseId} onChange={(event) => { const value = event.target.value; const subject = subjectOptions.find((item) => item.id === value); setCourseId(value); setArea(subject?.area ?? "课内"); setSource(subject?.title ?? "学习任务"); }}><option value="">请选择学习科目</option>{classroomSubjects.length > 0 && <optgroup label="课内学习科目">{classroomSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.title}</option>)}</optgroup>}{extracurricularSubjects.length > 0 && <optgroup label="课外学习科目">{extracurricularSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.title}</option>)}</optgroup>}</select></label><label><span>所属领域</span><input value={selectedSubject?.area ?? area} disabled /></label></> : <label><span>所属领域</span><select value={area} onChange={(event) => setArea(event.target.value as Area)}>{(["课内", "课外", "工作", "生活", "思考"] as Area[]).map((item) => <option key={item}>{item}</option>)}</select></label>}
      <label><span>来源说明（可选）</span><input value={source} disabled={origin === "course"} placeholder={origin === "course" ? "由所属学习科目自动填写" : "项目、场景或来源"} onChange={(event) => setSource(event.target.value)} /></label>
      <label className="wide"><span>所属任务或事项</span><select value={parent} onChange={(event) => updateParent(event.target.value)}><option value="">独立任务</option>{(taskParents.length > 0 || nodeParents.length > 0) && <optgroup label="可作为上级的任务">{taskParents.map((item) => <option value={"task:" + item.id} key={item.id}>{taskModeOf(item) === "multi" ? "长期" : "短期"} · {item.area} · {item.title}</option>)}{nodeParents.map((item) => <option value={"milestone:" + item.id} key={"node-" + item.id}>{item.mode === "multi" ? "长期" : "短期"} · {item.area} · {item.title}</option>)}</optgroup>}{eventParents.length > 0 && <optgroup label="事项">{eventParents.map((item) => <option value={"milestone:" + item.id} key={"event-" + item.id}>{item.area} · {item.title}</option>)}</optgroup>}</select><small>任务候选只显示已开启“允许其他任务归属于它”的内容。</small></label>
      <label className="wide taskCandidateToggle"><span><input type="checkbox" checked={parentCandidate} onChange={(event) => setParentCandidate(event.target.checked)} />允许其他任务归属于它</span><small>开启后会进入“所属任务”备选清单；长期任务默认开启。</small></label>
      {mode === "multi" && <label><span>开始日期</span><input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>}
      <label><span>{mode === "multi" ? "截止日期" : "任务日期"}</span><input type="date" required value={due} min={mode === "multi" ? startDate : undefined} onChange={(event) => setDue(event.target.value)} /></label>
      <label><span>当前状态</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskProgressStatus)}>{taskStatusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
      {mode === "multi" && <label><span>总进度 · {progress}%</span><input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></label>}
    </div>
    {history.length > 0 && <div className="taskProgressHistory"><strong>最近进度记录</strong>{history.map((entry) => <div key={entry.id}><time>{entry.date}</time><span>{entry.status} · {entry.progress}%</span><p>{entry.note || "未填写说明"}</p></div>)}</div>}
    {error && <p className="dialogError" role="alert">{error}</p>}
    <div className="dialogActions">{task && onOpenDetail && <button type="submit" className="softButton dialogDetailAction" onClick={() => { openDetailAfterSave.current = true; }}>保存并进入详细界面</button>}<button type="button" className="softButton" onClick={onClose}>取消</button><button type="submit" className="primaryButton" onClick={() => { openDetailAfterSave.current = false; }}>{task ? "保存设置" : "创建任务"}</button></div>
  </form></div>;
}

function MilestoneSettingsDialog({ node, onClose, onSave, onOpenDetail }: { node: Milestone; onClose: () => void; onSave: (node: Milestone) => void; onOpenDetail: () => void }) {
  const [draft, setDraft] = useState<Milestone>(() => ({ ...node }));
  const openDetailAfterSave = useRef(false);
  const isCourseTask = Boolean(draft.courseId);
  const entityLabel = isCourseTask ? "课程任务" : "事项";
  const patch = (values: Partial<Milestone>) => setDraft((current) => ({ ...current, ...values }));
  return <div className="dialogScrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="appDialog taskSettingsDialog" role="dialog" aria-modal="true" aria-label={`修改${entityLabel}`} onSubmit={(event) => { event.preventDefault(); if (!draft.title.trim()) return; onSave({ ...draft, title: draft.title.trim().slice(0, 500), requirements: draft.requirements.trim().slice(0, 4_000) }); if (openDetailAfterSave.current) onOpenDetail(); }}>
    <div className="dialogHead"><div><span>{entityLabel}设置</span><h2>修改{entityLabel}</h2><p>这里编辑创建时的基础信息；记录、附件和计时可进入详细界面处理。</p></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>
    {isCourseTask && <div className="taskModePicker"><button type="button" className={(draft.mode ?? "single") === "single" ? "active" : ""} onClick={() => patch({ mode: "single" })}><strong>短期任务</strong><span>一次或短期完成</span></button><button type="button" className={draft.mode === "multi" ? "active" : ""} onClick={() => patch({ mode: "multi", parentCandidate: draft.parentCandidate ?? true })}><strong>长期任务</strong><span>持续推进并记录进度</span></button></div>}
    <div className="dialogFields taskDialogFields">
      <label className="wide"><span>{isCourseTask ? "任务名称" : "事项名称"}</span><input autoFocus required maxLength={500} value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></label>
      <label className="wide"><span>{isCourseTask ? "具体要求" : "事项说明"}</span><textarea maxLength={4000} value={draft.requirements} placeholder={isCourseTask ? "填写交付内容、完成标准、参考信息等…" : "填写议程、携带材料或其他说明…"} onChange={(event) => patch({ requirements: event.target.value })} /></label>
      {isCourseTask && <label className="wide taskCandidateToggle"><span><input type="checkbox" checked={draft.parentCandidate ?? false} onChange={(event) => patch({ parentCandidate: event.target.checked })} />允许其他任务归属于它</span><small>开启后会进入“所属任务”备选清单；长期任务默认开启。</small></label>}
      {!isCourseTask && <label><span>所属领域</span><select value={draft.area} onChange={(event) => patch({ area: event.target.value as Area })}>{(["课内", "课外", "工作", "生活", "思考"] as Area[]).map((area) => <option key={area}>{area}</option>)}</select></label>}
      <label><span>日期</span><input type="date" required value={draft.date} onChange={(event) => patch({ date: event.target.value })} /></label>
      <label><span>时间</span><input type="time" required value={draft.time} onChange={(event) => patch({ time: event.target.value })} /></label>
      <label className="wide"><span>地点</span><input maxLength={500} value={draft.location} onChange={(event) => patch({ location: event.target.value })} /></label>
    </div>
    <div className="dialogActions"><button type="submit" className="softButton dialogDetailAction" onClick={() => { openDetailAfterSave.current = true; }}>保存并进入详细界面</button><button type="button" className="softButton" onClick={onClose}>取消</button><button type="submit" className="primaryButton" onClick={() => { openDetailAfterSave.current = false; }}>保存设置</button></div>
  </form></div>;
}
function CalendarView({ data, setData, setDialog, openWork, readOnly }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; openWork: (target: WorkTarget) => void; readOnly: boolean }) {
  const start = new Date(); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 35 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const [editingNode, setEditingNode] = useState<Milestone | null>(null);
  const addNode = () => setDialog({
    title: "新建日历事项",
    description: "事项用于会议、预约和行程；需要完成的内容请在任务页新增任务。",
    submitLabel: "创建事项",
    fields: [
      { name: "title", label: "事项名称", placeholder: "例如：项目会议" },
      { name: "date", label: "日期", type: "date", value: today },
      { name: "time", label: "时间", type: "time", value: "00:00" },
      { name: "location", label: "地点" },
      { name: "requirements", label: "事项说明", type: "textarea" },
      { name: "area", label: "所属领域", type: "select", options: ["课内", "课外", "工作", "生活", "思考"], value: "工作" },
    ],
    onSubmit: (values) => {
      const id = uid();
      setData((current) => ({ ...current, milestones: [...current.milestones, { id, title: values.title.trim() || "未命名事项", date: values.date || today, time: values.time || "00:00", location: values.location.trim(), requirements: values.requirements.trim(), area: (values.area || "工作") as Area, done: false }] }));
    },
  });
  return <div className="page"><PageHead eyebrow="全局时间线" title="日历" subtitle="课程任务与日历事项共同显示，点击后先修改基础信息" action={<button className="primaryButton" disabled={readOnly} onClick={addNode}>＋ 新建事项</button>} /><section className="panel calendarPanel"><div className="weekHead">{"日一二三四五六".split("").map((day) => <span key={day}>周{day}</span>)}</div><div className="calendarGrid">{days.map((date) => { const key = dateKey(date); const events = data.milestones.filter((item) => item.date === key); return <div className={"calendarCell " + (key === today ? "today" : "")} key={key}><strong>{date.getDate()}</strong><div>{events.map((event) => <button type="button" key={event.id} className={"calendarEvent " + areaClass[event.area]} title={(event.courseId ? "课程任务" : "事项") + " · " + event.time + " " + event.location + " " + event.requirements} onClick={() => readOnly ? openWork({ kind: "milestone", id: event.id }) : setEditingNode(event)}><small>{event.courseId ? "任务" : "事项"}</small>{event.time} {event.title}</button>)}</div></div>; })}</div></section>{editingNode && <MilestoneSettingsDialog node={editingNode} onClose={() => setEditingNode(null)} onSave={(node) => { setData((current) => ({ ...current, milestones: current.milestones.map((item) => item.id === node.id ? node : item) })); setEditingNode(null); }} onOpenDetail={() => { const id = editingNode.id; setEditingNode(null); openWork({ kind: "milestone", id }); }} />}</div>;
}
function ReviewView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const empty = { note: "", gain: "", problem: "", feeling: "", tomorrow: "" };
  const daily = data.daily[selectedDate] ?? empty;
  const updateDaily = (field: keyof typeof daily, value: string) => setData((current) => ({ ...current, daily: { ...current.daily, [selectedDate]: { ...(current.daily[selectedDate] ?? empty), [field]: value } } }));
  const dayTasks = data.tasks.filter((task) => taskScheduledForDate(task, selectedDate)); const doneCount = dayTasks.filter((task) => task.done || task.progressLogs?.some((entry) => entry.date === selectedDate && entry.progress === 100)).length;
  const totalMinutes = data.timeEntries.filter((entry) => entry.date === selectedDate).reduce((sum, entry) => sum + entry.minutes, 0);
  const history = Object.keys(data.daily).sort((a, b) => b.localeCompare(a));
  const fields: { key: keyof typeof daily; title: string; placeholder: string }[] = [{ key: "gain", title: "今天有什么收获？", placeholder: "写下具体学会或推进的内容…" }, { key: "problem", title: "哪里卡住了？", placeholder: "问题、阻力和未解决事项…" }, { key: "feeling", title: "精力与状态", placeholder: "今天的节奏是否合适？" }, { key: "tomorrow", title: "明天最重要的一步", placeholder: "只写一个清晰的下一步…" }];
  return <div className="page reviewHistoryPage"><PageHead eyebrow="每日复盘" title={selectedDate === today ? "把今天收好，再开始明天。" : `${selectedDate} 的记录`} subtitle="选择任意日期查看或继续补充，不会每天覆盖成初始示例" action={<label className="datePicker"><span>选择日期</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>} /><div className="reviewLayout"><aside className="panel historyPanel"><h2>过往记录</h2><button className={selectedDate === today ? "active" : ""} onClick={() => setSelectedDate(today)}>今天 <span>{today}</span></button>{history.filter((date) => date !== today).map((date) => <button key={date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)}>{date}<span>{data.daily[date]?.gain || data.daily[date]?.note ? "有记录" : "空白"}</span></button>)}</aside><div><div className="reviewSummary"><div><span>完成任务</span><strong>{doneCount} / {dayTasks.length}</strong></div><div><span>专注时长</span><strong>{formatMinutes(totalMinutes)}</strong></div><div><span>记录日期</span><strong>{selectedDate.slice(5)}</strong></div></div><section className="panel reviewForm"><label><span>当天随记</span><textarea value={daily.note} placeholder="当天发生了什么？" onChange={(event) => updateDaily("note", event.target.value)} /></label>{fields.map((field) => <label key={field.key}><span>{field.title}</span><textarea value={daily[field.key]} placeholder={field.placeholder} onChange={(event) => updateDaily(field.key, event.target.value)} /></label>)}</section></div></div></div>;
}

type CollectionProps = { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; deleteDialog: (title: string, onDelete: () => void) => void };

function SchoolView({ data, setData, openDetail, setDialog, deleteDialog }: CollectionProps & { openDetail: (id: string) => void }) {
  const visibleCourses = data.courses.filter((course) => isCourseTitleCandidate(course.title));
  const add = () => setDialog({ title: "新增课程", description: "创建后即可进入课程详情，继续补充要求、资料和节点。", submitLabel: "创建课程", fields: [{ name: "title", label: "课程名称", placeholder: "例如：审计学" }, { name: "school", label: "所属课表", type: "select", options: ["北京大学", "北京理工大学"] }, { name: "term", label: "学期", value: "2026 秋季" }, { name: "teacher", label: "教师或说明" }, { name: "location", label: "上课地点" }], onSubmit: (values) => setData((current) => ({ ...current, courses: [...current.courses, { id: uid(), title: values.title || "未命名课程", term: values.term, teacher: values.teacher, location: values.location, school: values.school === "北京理工大学" ? "bit" : "pku", progress: 0, requirements: "", schedule: [], blocks: starterBlocks("课程资料与笔记") }] })) });
  return <CollectionPage eyebrow="课内学习 · 本学期" title="课程总览" subtitle="每门课程都有独立详情、课程节点与自由笔记空间" addLabel="新增课程" onAdd={add}><div className="cardGrid">{visibleCourses.map((course) => <article className="panel entityCard" key={course.id}><button className="cardOpen" onClick={() => openDetail(course.id)}><span className="cardKicker">{course.term}</span><h2>{course.title}</h2><p>{course.teacher || "课程详情"}</p><div className="progressLine"><span style={{ width: `${course.progress}%` }} /></div><div className="cardFoot"><span>{course.progress}%</span><strong>进入课程详情 →</strong></div></button><button className="cardRemove" aria-label={`移除 ${course.title}`} onClick={() => deleteDialog(course.title, () => setData((current) => ({ ...current, courses: current.courses.filter((item) => item.id !== course.id) })))}>×</button></article>)}</div></CollectionPage>;
}

function LearningView({ data, setData, openDetail, setDialog, deleteDialog }: CollectionProps & { openDetail: (id: string) => void }) {
  const add = () => setDialog({ title: "新增课外学习领域", description: "根目录建议使用日语、摄影、深度学习这类长期主题。", submitLabel: "创建领域", fields: [{ name: "title", label: "领域名称", placeholder: "例如：日语" }, { name: "category", label: "分类", placeholder: "语言 / 兴趣 / 技术" }, { name: "goal", label: "阶段目标", type: "textarea" }], onSubmit: (values) => setData((current) => ({ ...current, learning: [...current.learning, { id: uid(), title: values.title || "未命名领域", category: values.category, goal: values.goal, progress: 0, resources: [], blocks: starterBlocks("学习路线与笔记") }] })) });
  return <CollectionPage eyebrow="课外学习 · 长期积累" title="学习领域" subtitle="以大文件夹组织兴趣和技能，进入后管理进度、资源与笔记" addLabel="新增学习领域" onAdd={add}><div className="folderGrid">{data.learning.map((item) => <article className="folderCard" key={item.id}><button className="folderOpen" onClick={() => openDetail(item.id)}><span className="folderTab" /><div className="folderIcon">{item.title.slice(0, 1)}</div><span className="cardKicker">{item.category}</span><h2>{item.title}</h2><p>{item.goal || "添加阶段目标"}</p><div className="folderMeta"><span>{item.resources.length} 项资源</span><strong>{item.progress}%</strong></div></button><button className="cardRemove" aria-label={`移除 ${item.title}`} onClick={() => deleteDialog(item.title, () => setData((current) => ({ ...current, learning: current.learning.filter((entry) => entry.id !== item.id) })))}>×</button></article>)}</div></CollectionPage>;
}

function WorkView({ data, setData, openDetail, setDialog, deleteDialog }: CollectionProps & { openDetail: (id: string) => void }) {
  const statuses = ["收集箱", "研究中", "验证中", "已归档"];
  const add = () => setDialog({ title: "新增研究项目", description: "先给项目一个落点；进入项目后可以像笔记空间一样自由添加研究页面。", submitLabel: "创建项目", fields: [{ name: "title", label: "项目名称", placeholder: "例如：AI 学习产品" }, { name: "status", label: "放到哪里", type: "select", options: statuses }, { name: "summary", label: "当前关注", type: "textarea", placeholder: "现在最想弄清或推进什么？" }, { name: "objective", label: "希望得到的结果", type: "textarea" }], onSubmit: (values) => setData((current) => ({ ...current, research: [...current.research, { id: uid(), title: values.title || "未命名研究", status: values.status || "收集箱", summary: values.summary, objective: values.objective, next: "补充下一步行动", progress: 0, pages: starterResearchPages() }] })) });
  return <div className="page workPage"><PageHead eyebrow="工作 · 探索、研究与机会" title="工作研究" subtitle="项目只负责聚拢方向，项目内部用自由页面记录资料、判断、实验和结论" action={<button className="primaryButton" onClick={add}>＋ 新增研究项目</button>} /><div className="researchBoard">{statuses.map((status) => { const projects = data.research.filter((project) => project.status === status || (status === "研究中" && !statuses.includes(project.status))); return <section className="researchLane" key={status}><div className="researchLaneHead"><strong>{status}</strong><span>{projects.length}</span></div><div>{projects.map((project) => <article className="panel researchCard freeResearchCard" key={project.id}><button className="cardOpen" onClick={() => openDetail(project.id)}><div className="courseTop"><span>{project.pages.length} 个页面</span><span>{project.progress}%</span></div><h2>{project.title}</h2><p>{project.summary || project.objective || "进入项目补充当前关注"}</p><div className="nextStep"><span>下一步</span><strong>{project.next || "暂未设置"}</strong></div><div className="openHint">打开项目笔记 →</div></button><button className="cardRemove" aria-label={`移除 ${project.title}`} onClick={() => deleteDialog(project.title, () => setData((current) => ({ ...current, research: current.research.filter((item) => item.id !== project.id) })))}>×</button></article>)}{!projects.length && <p className="laneEmpty">这里暂时没有项目。</p>}</div></section>; })}</div></div>;
}

function ToolsView({ data, setData, openDetail, setDialog, deleteDialog, readOnly }: CollectionProps & { openDetail: (id: string) => void; readOnly: boolean }) {
  const [filter, setFilter] = useState<"all" | "tool" | "collection">("all");
  const [creating, setCreating] = useState(false);
  const collectionCount = data.tools.filter((tool) => tool.kind === "collection").length;
  const shownTools = data.tools.filter((tool) => filter === "all" || (tool.kind === "collection" ? "collection" : "tool") === filter);
  const add = () => setDialog({ title: "加入工具", description: "网站、软件、程序和正在开发的小工具都可以放在这里。", submitLabel: "加入工具集", fields: [{ name: "title", label: "工具名称" }, { name: "status", label: "状态", type: "select", options: ["想法", "开发中", "迭代中", "已完成", "已归档"] }, { name: "description", label: "用途说明", type: "textarea" }, { name: "url", label: "访问链接" }], onSubmit: (values) => setData((current) => ({ ...current, tools: [...current.tools, { id: uid(), title: values.title || "未命名工具", status: values.status || "想法", description: values.description, url: values.url, version: "0.1", blocks: starterBlocks("产品说明与迭代记录") }] })) });
  return <div className="page toolsPage">
    <PageHead eyebrow="作品与生产力" title="工具集" subtitle="收藏常用工具，也把同一主题的网站整理成合集" action={!readOnly ? <div className="pageHeadActions"><button className="softButton" onClick={add}>＋ 加入工具</button><button className="primaryButton" disabled={creating} onClick={() => setCreating(true)}>＋ 新建网站合集</button></div> : undefined} />
    <div className="collectionFilters" role="group" aria-label="工具集类型">{([{ id: "all", label: "全部", count: data.tools.length }, { id: "tool", label: "工具", count: data.tools.length - collectionCount }, { id: "collection", label: "网站合集", count: collectionCount }] as const).map((item) => <button key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div>
    {creating && !readOnly && <CollectionForm onCancel={() => setCreating(false)} onSave={(value) => {
      const id = uid();
      setData((current) => ({ ...current, tools: [...current.tools, { id, ...value, kind: "collection", websites: [], status: "常用", url: "", version: "", blocks: [] }] }));
      setCreating(false);
      openDetail(id);
    }} />}
    <div className="cardGrid">{shownTools.map((tool) => <article className={`panel entityCard toolCard ${tool.kind === "collection" ? "websiteCollectionCard" : ""}`} key={tool.id}>
      <button className="cardOpen" onClick={() => openDetail(tool.id)}><div className="toolMark">{tool.kind === "collection" ? "集" : tool.title.slice(0, 1)}</div><span className="statusPill">{tool.kind === "collection" ? "网站合集" : tool.status}</span><h2>{tool.title}</h2><p>{tool.description || (tool.kind === "collection" ? "同一主题的常用网站与使用说明" : "")}</p>{tool.kind === "collection" && <div className="collectionSitePreview">{(tool.websites ?? []).slice(0, 3).map((website) => <span key={website.id}>{website.title}</span>)}</div>}<div className="cardFoot"><span>{tool.kind === "collection" ? `${tool.websites?.length ?? 0} 个网站` : `版本 ${tool.version}`}</span><strong>{tool.kind === "collection" ? "进入合集 →" : "查看详情 →"}</strong></div></button>
      {!readOnly && <button className="cardRemove" aria-label={`移除 ${tool.title}`} onClick={() => deleteDialog(tool.title, () => setData((current) => ({ ...current, tools: current.tools.filter((item) => item.id !== tool.id) })))}>×</button>}
    </article>)}</div>
    {shownTools.length === 0 && !creating && <div className="panel collectionEmpty"><h2>{filter === "tool" ? "还没有工具" : "把常用入口整理在一起"}</h2><p>{readOnly ? "这里暂时没有内容。" : "单个工具可以直接收藏；围绕北理、文献检索等主题，可以新建网站合集。"}</p></div>}
  </div>;
}

function IdeasView({ data, setData, deleteDialog }: CollectionProps) {
  const [idea, setIdea] = useState(""); const add = () => { if (!idea.trim()) return; setData((current) => ({ ...current, ideas: [{ id: uid(), title: idea.trim(), note: "", createdAt: today }, ...current.ideas] })); setIdea(""); };
  return <div className="page narrowPage"><PageHead eyebrow="快速捕捉" title="灵感" subtitle="先记下来，再决定它属于哪个研究或工具" /><div className="ideaCapture"><input value={idea} placeholder="此刻想到什么？" onChange={(event) => setIdea(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} /><button onClick={add}>记录</button></div><div className="ideaList">{data.ideas.map((item) => <article className="panel ideaCard" key={item.id}><span>{item.createdAt}</span><div className="ideaTitle"><input value={item.title} onChange={(event) => setData((current) => ({ ...current, ideas: current.ideas.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry) }))} /><button onClick={() => deleteDialog(item.title, () => setData((current) => ({ ...current, ideas: current.ideas.filter((entry) => entry.id !== item.id) })))}>移除</button></div><textarea value={item.note} placeholder="展开这条想法…" onChange={(event) => setData((current) => ({ ...current, ideas: current.ideas.map((entry) => entry.id === item.id ? { ...entry, note: event.target.value } : entry) }))} /></article>)}</div></div>;
}

function LifeView({ data, setData, openDetail, setDialog, deleteDialog, setPopup }: CollectionProps & { openDetail: (target: DetailTarget) => void; setPopup: (value: PopupState) => void }) {
  const addHabit = () => setDialog({ title: "新增习惯或规律", submitLabel: "添加", fields: [{ name: "title", label: "名称" }, { name: "schedule", label: "频率", placeholder: "每天 / 每周三次" }], onSubmit: (values) => setData((current) => ({ ...current, habits: [...current.habits, { id: uid(), title: values.title || "未命名习惯", schedule: values.schedule, streak: 0, today: false }] })) });
  const addMedia = () => setDialog({ title: "加入媒体与书籍", submitLabel: "加入", fields: [{ name: "title", label: "名称" }, { name: "kind", label: "类型", type: "select", options: ["书籍", "动画", "影视"] }, { name: "status", label: "状态", type: "select", options: ["正在看", "想看", "书单"] }, { name: "progress", label: "进度", placeholder: "例如：38% / 第 7 集" }], onSubmit: (values) => setData((current) => ({ ...current, media: [...current.media, { id: uid(), title: values.title || "未命名", kind: (values.kind || "书籍") as "书籍" | "动画" | "影视", status: (values.status || "正在看") as "正在看" | "想看" | "书单", progress: values.progress, blocks: starterBlocks("记录") }] })) });
  const addRecipe = () => setDialog({ title: "新增菜谱", submitLabel: "保存菜谱", fields: [{ name: "title", label: "菜名" }, { name: "ingredients", label: "主要食材", type: "textarea" }, { name: "note", label: "备注", type: "textarea" }], onSubmit: (values) => setData((current) => ({ ...current, recipes: [...current.recipes, { id: uid(), title: values.title || "未命名菜谱", ingredients: values.ingredients, note: values.note, blocks: starterBlocks("步骤与调整") }] })) });
  return <div className="page lifePage"><PageHead eyebrow="生活管理" title="日常习惯和规律（总）" subtitle="把需要长期维持的节奏放在一个安静、可复盘的地方" /><section className="lifeSection"><SectionHead title="日常习惯和规律（总）" subtitle="习惯打卡与生活流程" action={<button className="softButton" onClick={addHabit}>＋ 添加</button>} /><div className="lifeGrid"><div className="panel lifePanel"><h3>今日习惯</h3>{data.habits.map((habit) => <div className="habitRow" key={habit.id}><button className={`habitCheck ${habit.today ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? toggledHabit(item) : item) }))}>{habit.today ? "✓" : ""}</button><div><strong>{habit.title}</strong><span>{habit.schedule} · 连续 {habit.streak} 天</span></div><button className="miniRemove" onClick={() => deleteDialog(habit.title, () => setData((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habit.id) })))}>×</button></div>)}</div><div className="panel lifePanel"><h3>生活流程</h3>{data.routines.map((routine) => <div className="routineRow" key={routine.id}><span>{routine.title.slice(0, 1)}</span><div><strong>{routine.title}</strong><p>{routine.note}</p></div></div>)}</div></div></section><section className="lifeSection"><SectionHead title="习惯提醒" subtitle="运动、中间休息和睡觉 · 仅在页面内弹出" /><div className="panel reminderSettings">{data.reminders.map((reminder) => <div className="settingRow" key={reminder.id}><span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : "动"}</span><div><strong>{reminder.title}</strong><span>{reminder.type === "break" ? "专注满 20 分钟触发" : "到点后页面右下角提示"}</span></div>{reminder.type === "break" ? <span className="timeText">20 分钟</span> : <input type="time" value={reminder.time} onChange={(event) => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, time: event.target.value } : item) }))} />}<button className={`switch ${reminder.enabled ? "on" : ""}`} aria-label={reminder.enabled ? "关闭提醒" : "开启提醒"} onClick={() => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item) }))}><span /></button><button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: "这是一条安静的页面 popup。它不会调用系统提示，也不会发出闹钟声。" })}>预览</button></div>)}</div></section><section className="lifeSection"><SectionHead title="媒体与书籍" subtitle="分为正在看、想看和书单" action={<button className="softButton" onClick={addMedia}>＋ 添加</button>} /><div className="mediaColumns">{(["正在看", "想看", "书单"] as const).map((status) => <div className="mediaColumn" key={status}><div className="mediaColumnHead"><strong>{status}</strong><span>{data.media.filter((item) => item.status === status).length}</span></div>{data.media.filter((item) => item.status === status).map((item) => <article className="mediaCard" key={item.id}><button onClick={() => openDetail({ type: "media", id: item.id })}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.progress || "尚未记录进度"}</small></button><button className="miniRemove" onClick={() => deleteDialog(item.title, () => setData((current) => ({ ...current, media: current.media.filter((entry) => entry.id !== item.id) })))}>×</button></article>)}</div>)}</div></section><section className="lifeSection"><SectionHead title="菜谱记录" subtitle="保存食材、步骤和下次调整" action={<button className="softButton" onClick={addRecipe}>＋ 新增菜谱</button>} /><div className="recipeGrid">{data.recipes.map((recipe) => <article className="panel recipeCard" key={recipe.id}><button className="cardOpen" onClick={() => openDetail({ type: "recipe", id: recipe.id })}><span className="recipeMark">食</span><h3>{recipe.title}</h3><p>{recipe.ingredients}</p><strong>查看菜谱详情 →</strong></button><button className="cardRemove" onClick={() => deleteDialog(recipe.title, () => setData((current) => ({ ...current, recipes: current.recipes.filter((item) => item.id !== recipe.id) })))}>×</button></article>)}</div></section></div>;
}

function LifeViewV2({ data, setData, openDetail, setDialog, deleteDialog, setPopup, alerts, readOnly, workspaceOwner }: CollectionProps & { openDetail: (target: DetailTarget) => void; setPopup: React.Dispatch<React.SetStateAction<PopupState>>; alerts: ReturnType<typeof useReminderAlerts>; readOnly: boolean; workspaceOwner: string }) {
  const showEyeRestPopup = useCallback((value: { eyebrow: string; title: string; body: string }) => setPopup((current) => current ?? value), [setPopup]);
  const addHabit = () => setDialog({ title: "新增习惯或规律", submitLabel: "添加", fields: [{ name: "title", label: "名称" }, { name: "schedule", label: "频率", placeholder: "每天 / 每周三次" }], onSubmit: (values) => setData((current) => ({ ...current, habits: [...current.habits, { id: uid(), title: values.title || "未命名习惯", schedule: values.schedule, streak: 0, today: false }] })) });
  const editReminder = (existing?: Reminder) => {
    const labels = { exercise: "运动（固定时间）", break: "休息（间隔提醒）", sleep: "睡觉（固定时间）", custom: "其他（固定时间）" };
    setDialog({
      title: existing ? "编辑提醒" : "新增提醒项目",
      description: "休息类型会在打开网页后自动按间隔提醒，不需要开始专注。只需要每 20 分钟提醒时，请把固定时间留空；运动等类型使用固定时间。修改计时设置后重新计时。",
      submitLabel: existing ? "保存提醒" : "创建提醒",
      fields: [
        { name: "title", label: "提醒名称", value: existing?.title ?? "", placeholder: "例如：休息眼睛 / 喝水 / 拉伸" },
        { name: "type", label: "类型", type: "select", options: Object.values(labels), value: labels[existing?.type ?? "break"] },
        { name: "times", label: "固定时间（间隔提醒可留空）", value: existing?.times.join(", ") ?? "", placeholder: "10:30, 17:30" },
        { name: "interval", label: "自动提醒间隔（分钟，仅休息类型）", type: "number", value: String(existing?.intervalMinutes ?? 20), placeholder: "20（最少 5 分钟）" },
      ],
      onSubmit: (values) => {
        const type = (Object.entries(labels).find(([, label]) => label === values.type)?.[0] ?? "break") as Reminder["type"];
        const times = values.times.split(/[，,\s]+/).filter((value) => reminderTimePattern.test(value));
        const reminder = normalizedReminder({
          id: existing?.id ?? uid(), title: values.title.trim() || "未命名提醒", type, times,
          intervalMinutes: type === "break" ? Number(values.interval) || 20 : undefined,
          enabled: existing?.enabled ?? true,
        });
        setData((current) => ({
          ...current,
          reminders: existing ? current.reminders.map((item) => item.id === existing.id ? reminder : item) : [...current.reminders, reminder],
        }));
      },
    });
  };
  const addMedia = () => setDialog({ title: "加入媒体与书籍", submitLabel: "加入", fields: [{ name: "title", label: "名称" }, { name: "kind", label: "类型", type: "select", options: ["书籍", "动画", "影视"] }, { name: "status", label: "状态", type: "select", options: ["正在看", "想看", "书单"] }, { name: "progress", label: "进度", placeholder: "例如：38% / 第 7 集" }], onSubmit: (values) => setData((current) => ({ ...current, media: [...current.media, { id: uid(), title: values.title || "未命名", kind: (values.kind || "书籍") as "书籍" | "动画" | "影视", status: (values.status || "正在看") as "正在看" | "想看" | "书单", progress: values.progress, blocks: starterBlocks("记录") }] })) });
  const addRecipe = () => setDialog({ title: "新增菜谱", submitLabel: "保存菜谱", fields: [{ name: "title", label: "菜名" }, { name: "ingredients", label: "主要食材", type: "textarea" }, { name: "note", label: "备注", type: "textarea" }], onSubmit: (values) => setData((current) => ({ ...current, recipes: [...current.recipes, { id: uid(), title: values.title || "未命名菜谱", ingredients: values.ingredients, note: values.note, blocks: starterBlocks("步骤与调整") }] })) });
  const patchReminder = (id: string, patch: Partial<Reminder>) => setData((current) => ({
    ...current,
    reminders: current.reminders.map((item) => {
      if (item.id !== id) return item;
      if (item.enabled && item.type !== "break" && patch.times && !patch.times.some((time) => reminderTimePattern.test(time))) return item;
      return normalizedReminder({ ...item, ...patch });
    }),
  }));
  return <div className="page lifePage">
    <PageHead eyebrow="生活管理" title="日常习惯和规律（总）" subtitle="习惯、提醒、媒体、书籍和菜谱集中在一个可复盘的地方" />
    <section className="lifeSection"><SectionHead title="日常习惯和规律（总）" subtitle="习惯打卡与生活流程" action={<button className="softButton" onClick={addHabit}>＋ 添加</button>} /><div className="lifeGrid"><div className="panel lifePanel"><h3>今日习惯</h3>{data.habits.map((habit) => <div className="habitRow" key={habit.id}><button className={`habitCheck ${habit.today ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? toggledHabit(item) : item) }))}>{habit.today ? "✓" : ""}</button><div><strong>{habit.title}</strong><span>{habit.schedule} · 连续 {habit.streak} 天</span></div><button className="miniRemove" onClick={() => deleteDialog(habit.title, () => setData((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habit.id) })))}>×</button></div>)}</div><div className="panel lifePanel"><h3>生活流程</h3>{data.routines.map((routine) => <div className="routineRow" key={routine.id}><span>{routine.title.slice(0, 1)}</span><div><strong>{routine.title}</strong><p>{routine.note}</p></div></div>)}</div></div></section>
    <section className="lifeSection">
      <SectionHead title="习惯提醒" subtitle="休息提醒打开网页后自动计时；运动、睡觉等仍可设置固定时间" action={<button className="softButton" onClick={() => editReminder()}>＋ 新增提醒</button>} />
      <p className="reminderHelp">每 20 分钟休息：点击“编辑”，选择“休息（间隔提醒）”，间隔填 20。无需开始专注；切换站内页面不会重置。关闭或刷新网页后重新计时，后台休眠可能延迟，返回页面时补提示。</p>
      <ReminderAlertsSettings alerts={alerts} readOnly={readOnly} />
      <EyeRestCycle key={workspaceOwner} owner={workspaceOwner} readOnly={readOnly} alerts={alerts} onPopup={showEyeRestPopup} />
      <div className="panel reminderSettings">
        {!data.reminders.length && <div className="emptyState compact"><h2>添加你的第一条提醒</h2><p>例如：每 20 分钟休息眼睛，或每天 23:00 准备睡觉。</p></div>}
        {data.reminders.map((reminder) => <div className="settingRow reminderProjectRow" key={reminder.id}>
          <span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : reminder.type === "exercise" ? "动" : "提"}</span>
          <div className="reminderProjectBody">
            <strong>{reminder.title}</strong>
            <p className="reminderMode">{reminder.enabled ? reminder.type === "break" ? "自动间隔提醒 · 不依赖专注计时" : "固定时间提醒" : "已关闭"}</p>
            <div className="reminderTimes">
              {reminder.type === "break" && <label className="intervalField">每 <input aria-label={`${reminder.title} 间隔分钟`} type="number" min="5" max="1440" value={reminder.intervalMinutes ?? 20} onChange={(event) => patchReminder(reminder.id, { intervalMinutes: Math.max(5, Number(event.target.value) || 20) })} /> 分钟</label>}
              {reminder.times.map((time, index) => <span key={`${reminder.id}-${index}`}><input aria-label={`${reminder.title} 提醒时间 ${index + 1}`} type="time" value={time} onChange={(event) => patchReminder(reminder.id, { times: reminder.times.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry) })} /><button aria-label={`移除时间 ${time}`} onClick={() => patchReminder(reminder.id, { times: reminder.times.filter((_, entryIndex) => entryIndex !== index) })}>×</button></span>)}
              <button className="addTimeButton" onClick={() => patchReminder(reminder.id, { times: [...reminder.times, "12:00"] })}>＋ 固定时间</button>
            </div>
          </div>
          <div className="reminderActions">
            <button className={`switch ${reminder.enabled ? "on" : ""}`} role="switch" aria-checked={reminder.enabled} aria-label={`${reminder.enabled ? "关闭" : "开启"}${reminder.title}提醒`} onClick={() => patchReminder(reminder.id, { enabled: !reminder.enabled })}><span /></button>
            <button className="softButton" onClick={() => editReminder(reminder)}>编辑</button>
            <button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: reminder.type === "break" ? `打开网页后，每 ${reminder.intervalMinutes ?? 20} 分钟自动提醒，不依赖专注计时。本次预览不会改变计时或提醒设置。` : "固定时间到达后会弹出页面提示。本次预览不会改变提醒设置。" })}>预览</button>
            <button className="miniRemove" aria-label={`删除${reminder.title}提醒`} onClick={() => deleteDialog(reminder.title, () => setData((current) => ({ ...current, reminders: current.reminders.filter((item) => item.id !== reminder.id) })))}>×</button>
          </div>
        </div>)}
      </div>
    </section>
    <section className="lifeSection"><SectionHead title="媒体与书籍" subtitle="分为正在看、想看和书单" action={<button className="softButton" onClick={addMedia}>＋ 添加</button>} /><div className="mediaColumns">{(["正在看", "想看", "书单"] as const).map((status) => <div className="mediaColumn" key={status}><div className="mediaColumnHead"><strong>{status}</strong><span>{data.media.filter((item) => item.status === status).length}</span></div>{data.media.filter((item) => item.status === status).map((item) => <article className="mediaCard" key={item.id}><button onClick={() => openDetail({ type: "media", id: item.id })}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.progress || "尚未记录进度"}</small></button><button className="miniRemove" onClick={() => deleteDialog(item.title, () => setData((current) => ({ ...current, media: current.media.filter((entry) => entry.id !== item.id) })))}>×</button></article>)}</div>)}</div></section>
    <section className="lifeSection"><SectionHead title="菜谱记录" subtitle="保存食材、步骤和下次调整" action={<button className="softButton" onClick={addRecipe}>＋ 新增菜谱</button>} /><div className="recipeGrid">{data.recipes.map((recipe) => <article className="panel recipeCard" key={recipe.id}><button className="cardOpen" onClick={() => openDetail({ type: "recipe", id: recipe.id })}><span className="recipeMark">食</span><h3>{recipe.title}</h3><p>{recipe.ingredients}</p><strong>查看菜谱详情 →</strong></button><button className="cardRemove" onClick={() => deleteDialog(recipe.title, () => setData((current) => ({ ...current, recipes: current.recipes.filter((item) => item.id !== recipe.id) })))}>×</button></article>)}</div></section>
  </div>;
}

function NotesView({ space, data, setData, selectedPage, setSelectedPage, setDialog, deleteDialog, access }: CollectionProps & { space: "thoughts" | "free"; selectedPage: string; setSelectedPage: (id: string) => void; access: EditorAccess }) {
  const nodes = data.pages.filter((item) => item.space === space); const selected = nodes.find((item) => item.id === selectedPage) ?? nodes.find((item) => item.kind === "page") ?? nodes[0];
  useEffect(() => { if (selected && selected.id !== selectedPage) setSelectedPage(selected.id); }, [selected, selectedPage, setSelectedPage]);
  const addNode = (kind: "folder" | "page", parentId: string | null = selected?.kind === "folder" ? selected.id : selected?.parentId ?? null) => setDialog({ title: kind === "folder" ? "新建文件夹" : "新建页面", description: parentId ? "将创建在当前层级中。" : "将创建在根目录。", submitLabel: "创建", fields: [{ name: "title", label: "名称", placeholder: kind === "folder" ? "文件夹名称" : "页面标题" }], onSubmit: (values) => { const id = uid(); setData((current) => ({ ...current, pages: [...current.pages, { id, space, parentId, title: values.title || (kind === "folder" ? "未命名文件夹" : "未命名页面"), kind, blocks: kind === "page" ? starterBlocks("开始记录") : [] }] })); setSelectedPage(id); } });
  const removeNode = (id: string) => setData((current) => { const removedIds = pageTreeIds(current.pages, id); return { ...current, pages: current.pages.filter((item) => !removedIds.has(item.id)) }; });
  const children = (parentId: string | null) => nodes.filter((item) => item.parentId === parentId);
  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => children(parentId).map((node) => <div className="treeBranch" key={node.id} style={{ "--depth": depth } as React.CSSProperties}><button className={`treeNode ${selected?.id === node.id ? "active" : ""}`} onClick={() => setSelectedPage(node.id)}><span className="treeGlyph">{node.kind === "folder" ? "▾" : "·"}</span><span>{node.title}</span></button>{node.kind === "folder" && <div className="treeChildren">{renderTree(node.id, depth + 1)}</div>}</div>);
  return <div className="page notesPage"><PageHead eyebrow={space === "thoughts" ? "思考集" : "自由空间"} title={space === "thoughts" ? "让想法长成结构" : "按你的方式继续扩展"} subtitle="支持多级文件夹、局部富文本、图片与资料附件" /><section className="notesShell"><aside className="treePanel"><div className="treeActions"><button onClick={() => addNode("folder", null)}>＋ 根文件夹</button><button onClick={() => addNode("page")}>＋ 页面</button></div><div className="treeRootLabel">{space === "thoughts" ? "思考集根目录" : "自由空间根目录"}</div><div className="treeList">{renderTree(null)}</div></aside><div className="editorArea">{selected ? selected.kind === "page" ? <><div className="editorTop"><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item) }))} /><button className="textButton dangerText" onClick={() => deleteDialog(selected.title, () => removeNode(selected.id))}>移除页面</button></div><BlockEditor blocks={selected.blocks} onChange={(blocks) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, blocks } : item) }))} access={access} /></> : <div className="folderLanding"><span className="largeFolder">▰</span><p className="eyebrow">文件夹</p><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item) }))} /><p>此文件夹包含 {children(selected.id).length} 项内容。你可以继续创建任意层级。</p><div className="folderActions"><button className="primaryButton" onClick={() => addNode("page", selected.id)}>＋ 新建页面</button><button className="softButton" onClick={() => addNode("folder", selected.id)}>＋ 子文件夹</button><button className="textButton dangerText" onClick={() => deleteDialog(selected.title, () => removeNode(selected.id))}>移除文件夹</button></div></div> : <div className="emptyState"><h2>这里还是空的</h2><p>先创建一个根文件夹或页面。</p></div>}</div></section></div>;
}

function CollectionPage({ eyebrow, title, subtitle, addLabel, onAdd, children }: { eyebrow: string; title: string; subtitle: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) { return <div className="page"><PageHead eyebrow={eyebrow} title={title} subtitle={subtitle} action={<button className="primaryButton" onClick={onAdd}>＋ {addLabel}</button>} />{children}</div>; }

function DetailRouter({ target, data, setData, back, setDialog, deleteDialog, access }: { target: NonNullable<DetailTarget>; data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void; deleteDialog: (title: string, onDelete: () => void) => void; access: EditorAccess }) {
  if (target.type === "course") { const item = data.courses.find((entry) => entry.id === target.id); return item ? <CourseDetail key={`${access.ownerId}:${item.id}`} course={item} data={data} setData={setData} back={back} setDialog={setDialog} deleteDialog={deleteDialog} access={access} /> : null; }
  if (target.type === "learning") { const item = data.learning.find((entry) => entry.id === target.id); return item ? <LearningDetail item={item} setData={setData} back={back} setDialog={setDialog} access={access} /> : null; }
  if (target.type === "research") { const item = data.research.find((entry) => entry.id === target.id); return item ? <ResearchDetail item={item} setData={setData} back={back} setDialog={setDialog} access={access} /> : null; }
  if (target.type === "tool") {
    const item = data.tools.find((entry) => entry.id === target.id);
    if (!item) return null;
    if (item.kind === "collection") return <DetailLayout eyebrow="网站合集 · 工具集" title={item.title} subtitle="围绕同一个主题，收好每一个常用入口" back={back}><WebsiteCollection key={`${access.ownerId}:${item.id}`} collection={item} readOnly={access.readOnly} onChange={(update) => setData((current) => ({ ...current, tools: current.tools.map((entry) => entry.id === item.id ? { ...entry, ...update(entry) } : entry) }))} /></DetailLayout>;
    return <ToolDetailV2 key={item.id} item={item} setData={setData} back={back} access={access} />;
  }
  if (target.type === "media") { const item = data.media.find((entry) => entry.id === target.id); return item ? <SimpleDetail title={item.title} eyebrow={`${item.kind} · ${item.status}`} description="观看或阅读详情" fields={[{ label: "进度", value: item.progress, onChange: (value) => setData((current) => ({ ...current, media: current.media.map((entry) => entry.id === item.id ? { ...entry, progress: value } : entry) })) }]} blocks={item.blocks} setBlocks={(blocks) => setData((current) => ({ ...current, media: current.media.map((entry) => entry.id === item.id ? { ...entry, blocks } : entry) }))} back={back} access={access} /> : null; }
  const item = data.recipes.find((entry) => entry.id === target.id); return item ? <SimpleDetail title={item.title} eyebrow="菜谱记录" description={item.note} fields={[{ label: "食材", value: item.ingredients, onChange: (value) => setData((current) => ({ ...current, recipes: current.recipes.map((entry) => entry.id === item.id ? { ...entry, ingredients: value } : entry) })) }, { label: "备注", value: item.note, onChange: (value) => setData((current) => ({ ...current, recipes: current.recipes.map((entry) => entry.id === item.id ? { ...entry, note: value } : entry) })) }]} blocks={item.blocks} setBlocks={(blocks) => setData((current) => ({ ...current, recipes: current.recipes.map((entry) => entry.id === item.id ? { ...entry, blocks } : entry) }))} back={back} access={access} /> : null;
}

function AttachmentFileList({ files, onRemove }: { files: StoredAttachment[]; onRemove: (id: string) => void }) {
  if (!files.length) return null;
  return <div className="embeddedFileList">{files.map((file) => <div className="embeddedFileItem" key={file.id}>
    <span className="fileIcon">{(file.fileName.split(".").pop() || "资料").slice(0, 4).toUpperCase()}</span>
    <div className="fileMeta"><strong>{file.fileName}</strong><span>{formatBytes(file.fileSize)} · {file.mimeType || "文件"}</span></div>
    <div className="fileActions"><a href={fileProxyUrl(file)} target="_blank" rel="noreferrer">打开</a><a href={fileProxyUrl(file, true)}>下载</a><button type="button" aria-label={`移除附件：${file.fileName}`} onClick={() => onRemove(file.id)}>×</button></div>
  </div>)}</div>;
}

function CourseDetail({ course, data, setData, back, setDialog, deleteDialog, access }: { course: Course; data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void; deleteDialog: (title: string, onDelete: () => void) => void; access: EditorAccess }) {
  const [editingNodeId, setEditingNodeId] = useState("");
  const [creatingNode, setCreatingNode] = useState(false);
  const [nodePending, setNodePending] = useState(false);
  const nodes = data.milestones.filter((item) => item.courseId === course.id);
  const patchCourse = (patch: Partial<Course>) => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, ...patch } : item) }));
  const updateNode = (nodeId: string, update: (current: Milestone) => Milestone) => setData((current) => ({ ...current, milestones: current.milestones.map((item) => item.id === nodeId ? update(item) : item) }));
  const addNode = () => setCreatingNode(true);
  return <DetailLayout eyebrow={`${course.term} · 课内课程`} title={course.title} subtitle="课程要求、近期任务、资料与自由笔记" back={back}><div className="detailGrid"><div className="detailMain"><section className="panel detailSection"><SectionHead title="课程基本要求" subtitle="可直接修改" /><div className="fieldGrid"><label className="editField"><span>所属课表</span><select value={courseSchool(course)} onChange={(event) => patchCourse({ school: event.target.value as AcademicImportPreset })}><option value="pku">北京大学</option><option value="bit">北京理工大学</option></select></label><EditableField label="教师或说明" value={course.teacher} onChange={(value) => patchCourse({ teacher: value })} /><EditableField label="上课地点" value={course.location} onChange={(value) => patchCourse({ location: value })} /><EditableField label="当前进度" value={String(course.progress)} type="number" onChange={(value) => patchCourse({ progress: Math.min(100, Number(value) || 0) })} /><label className="editField wide"><span>课程要求</span><textarea value={course.requirements} onChange={(event) => patchCourse({ requirements: event.target.value })} /></label></div></section><section className="panel detailSection"><SectionHead title="课程任务" subtitle="要求附件、在线预览与完成成果；课程任务自动同步到日历" action={!access.readOnly && <button className="primaryButton" disabled={creatingNode} onClick={addNode}>＋ 新增课程任务</button>} />{creatingNode && <CourseNodeForm courseId={course.id} location={course.location} date={today} access={access} onCancel={() => setCreatingNode(false)} onCreate={(node) => { setData((current) => ({ ...current, milestones: [...current.milestones, node] })); setCreatingNode(false); setEditingNodeId(node.id); }} />}<div className="nodeTable"><div className="nodeTableHead"><span>任务</span><span>时间</span><span>地点</span><span>要求与成果</span><span>完成</span></div>{nodes.map((node) => <Fragment key={node.id}><div className={`nodeRow ${node.done ? "done" : ""}`}><strong>{node.title}</strong><span>{node.date}<small>{node.time}</small></span><span>{node.location}</span><div className="nodeRequirementCell"><span title={node.requirements}>{node.requirements || "未填写要求"}</span><button type="button" disabled={nodePending} aria-expanded={editingNodeId === node.id} onClick={() => setEditingNodeId((current) => current === node.id ? "" : node.id)}>{editingNodeId === node.id ? "收起" : "查看要求与成果"}{node.attachments?.length ? ` · ${node.attachments.length} 个要求附件` : ""}</button><small className="nodeOutcomeSummary">{node.outcomeAttachments?.length ? `已保存 ${node.outcomeAttachments.length} 个成果文件` : node.outcomeText ? "已记录成果说明" : "暂无成果"}</small></div><button className={`habitCheck ${node.done ? "done" : ""}`} disabled={access.readOnly} aria-label={`${node.done ? "取消完成" : "标记完成"}：${node.title}`} onClick={() => updateNode(node.id, (current) => ({ ...current, done: !current.done }))}>{node.done ? "✓" : ""}</button><button className="miniRemove" disabled={access.readOnly || nodePending} aria-label={`删除课程节点：${node.title}`} onClick={() => deleteDialog(node.title, () => setData((current) => ({ ...current, milestones: current.milestones.filter((item) => item.id !== node.id) })))}>×</button></div>{editingNodeId === node.id && <CourseNodeEditor key={node.id} onPendingChange={setNodePending} node={node} access={access} onChange={(update) => updateNode(node.id, update)} onClose={() => setEditingNodeId("")} />}</Fragment>)}</div></section><section className="panel editorSection"><SectionHead title="资料、笔记与自由内容" subtitle="支持局部富文本；图片与资料可直接拖入" /><BlockEditor blocks={course.blocks} onChange={(blocks) => patchCourse({ blocks })} showToc={false} access={access} /></section></div><aside className="detailAside"><div className="progressCard"><span>课程进度</span><strong>{course.progress}%</strong><div className="progressLine"><i style={{ width: `${course.progress}%` }} /></div></div><BlockToc blocks={course.blocks} /></aside></div></DetailLayout>;
}

function LearningDetail({ item, setData, back, setDialog, access }: { item: LearningArea; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void; access: EditorAccess }) {
  const patch = (value: Partial<LearningArea>) => setData((current) => ({ ...current, learning: current.learning.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));
  const addResource = () => setDialog({ title: `为“${item.title}”添加资源`, submitLabel: "添加资源", fields: [{ name: "title", label: "资源名称" }, { name: "type", label: "类型", type: "select", options: ["B站课程", "书籍", "软件", "网站", "线下课程", "其他"] }, { name: "url", label: "链接" }, { name: "progress", label: "进度（0—100）", type: "number", value: "0" }], onSubmit: (values) => patch({ resources: [...item.resources, { id: uid(), title: values.title || "未命名资源", type: values.type, url: values.url, progress: Number(values.progress) || 0 }] }) });
  return <DetailLayout eyebrow={`${item.category} · 课外学习`} title={item.title} subtitle="进度、资源、路线与笔记" back={back}><div className="detailGrid"><div className="detailMain"><section className="panel detailSection"><SectionHead title="学习目标与进度" subtitle="这个大文件夹的整体状态" /><label className="editField wide"><span>阶段目标</span><textarea value={item.goal} onChange={(event) => patch({ goal: event.target.value })} /></label><div className="rangeField"><span>整体进度</span><input type="range" min="0" max="100" value={item.progress} onChange={(event) => patch({ progress: Number(event.target.value) })} /><strong>{item.progress}%</strong></div></section><section className="panel detailSection"><SectionHead title="学习资源" subtitle="课程、书籍、网站和软件" action={<button className="primaryButton" onClick={addResource}>＋ 添加资源</button>} /><div className="resourceTable">{item.resources.map((resource) => <div className="resourceRow" key={resource.id}><span className="resourceMark">{resource.type.slice(0, 1)}</span><div><strong>{resource.title}</strong><span>{resource.type}</span></div><input type="range" min="0" max="100" value={resource.progress} onChange={(event) => patch({ resources: item.resources.map((entry) => entry.id === resource.id ? { ...entry, progress: Number(event.target.value) } : entry) })} /><b>{resource.progress}%</b>{resource.url ? <a href={resource.url} target="_blank" rel="noreferrer">打开</a> : <span>无链接</span>}<button className="miniRemove" onClick={() => patch({ resources: item.resources.filter((entry) => entry.id !== resource.id) })}>×</button></div>)}</div></section><section className="panel editorSection"><SectionHead title="学习笔记" subtitle="自由写笔记，并直接拖入图片与资料" /><BlockEditor blocks={item.blocks} onChange={(blocks) => patch({ blocks })} access={access} /></section></div><aside className="detailAside"><div className="progressCard"><span>整体进度</span><strong>{item.progress}%</strong><div className="progressLine"><i style={{ width: `${item.progress}%` }} /></div></div><div className="tipCard"><strong>建议结构</strong><p>学习目标</p><p>路线与阶段</p><p>资源库</p><p>练习作品</p><p>问题与复盘</p></div></aside></div></DetailLayout>;
}

function ResearchDetail({ item, setData, back, setDialog, access }: { item: ResearchProject; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void; access: EditorAccess }) {
  const [selectedPageId, setSelectedPageId] = useState(item.pages[0]?.id ?? "");
  const selectedPage = item.pages.find((page) => page.id === selectedPageId) ?? item.pages[0];
  useEffect(() => { if (selectedPage && selectedPage.id !== selectedPageId) setSelectedPageId(selectedPage.id); }, [selectedPage, selectedPageId]);
  const patch = (value: Partial<ResearchProject>) => setData((current) => ({ ...current, research: current.research.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));
  const addPage = () => setDialog({ title: "新增研究页面", description: "页面没有固定格式，可以继续插入内容块，也可以直接拖入图片和资料。", submitLabel: "创建页面", fields: [{ name: "title", label: "页面标题", placeholder: "例如：竞品拆解 / 用户访谈" }], onSubmit: (values) => { const page = { id: uid(), title: values.title || "未命名页面", blocks: starterBlocks(values.title || "研究记录") }; patch({ pages: [...item.pages, page] }); setSelectedPageId(page.id); } });
  const patchPage = (pageId: string, value: Partial<ResearchPage>) => patch({ pages: item.pages.map((page) => page.id === pageId ? { ...page, ...value } : page) });
  return <DetailLayout eyebrow={`${item.status} · 工作研究`} title={item.title} subtitle="自由页面式项目笔记：资料、实验、机会判断和结论可以按你的方式组织" back={back}><section className="panel researchOverview"><div><label><span>项目状态</span><select value={item.status} onChange={(event) => patch({ status: event.target.value })}><option>收集箱</option><option>研究中</option><option>验证中</option><option>已归档</option></select></label><label><span>当前关注</span><textarea value={item.summary} onChange={(event) => patch({ summary: event.target.value })} /></label><label><span>希望得到的结果</span><textarea value={item.objective} onChange={(event) => patch({ objective: event.target.value })} /></label><label><span>下一步行动</span><textarea value={item.next} onChange={(event) => patch({ next: event.target.value })} /></label></div><div className="researchProgress"><span>自己定义的推进度</span><strong>{item.progress}%</strong><input type="range" min="0" max="100" value={item.progress} onChange={(event) => patch({ progress: Number(event.target.value) })} /></div></section><section className="researchNotebook"><aside className="researchPages"><div><strong>项目页面</strong><button onClick={addPage}>＋</button></div>{item.pages.map((page) => <button key={page.id} className={selectedPage?.id === page.id ? "active" : ""} onClick={() => setSelectedPageId(page.id)}><span>·</span>{page.title}</button>)}</aside><div className="panel researchPageEditor">{selectedPage ? <><div className="editorTop"><input className="pageTitleInput" value={selectedPage.title} onChange={(event) => patchPage(selectedPage.id, { title: event.target.value })} />{item.pages.length > 1 && <button className="textButton dangerText" onClick={() => patch({ pages: item.pages.filter((page) => page.id !== selectedPage.id) })}>移除页面</button>}</div><BlockEditor blocks={selectedPage.blocks} onChange={(blocks) => patchPage(selectedPage.id, { blocks })} access={access} /></> : <div className="emptyState"><h2>创建第一个研究页面</h2><button className="primaryButton" onClick={addPage}>＋ 新增页面</button></div>}</div></section></DetailLayout>;
}

function ToolDetailV2({ item, setData, back, access }: { item: ToolItem; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; access: EditorAccess }) {
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newNote, setNewNote] = useState("");
  const fallbackVersion: ToolVersion = { id: `legacy-${item.id}`, label: item.version || "当前版本", url: item.url, note: "从原有工具记录迁移", createdAt: today };
  const versions = item.versions === undefined ? [fallbackVersion] : item.versions;
  const currentVersionId = item.currentVersionId && versions.some((version) => version.id === item.currentVersionId) ? item.currentVersionId : versions[0]?.id;
  const currentVersion = versions.find((version) => version.id === currentVersionId);
  const currentVersionLabel = currentVersion?.label ?? "";
  const currentVersionUrl = currentVersion?.url ?? "";
  const patch = (value: Partial<ToolItem>) => setData((current) => ({ ...current, tools: current.tools.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));

  const addVersion = () => {
    if (!newLabel.trim()) return;
    const version: ToolVersion = { id: uid(), label: newLabel.trim(), url: newUrl.trim(), note: newNote.trim(), createdAt: today };
    patch({ versions: [...versions, version], currentVersionId: version.id, version: version.label, url: version.url });
    setNewLabel("");
    setNewUrl("");
    setNewNote("");
  };

  const selectVersion = (version: ToolVersion) => patch({ versions, currentVersionId: version.id, version: version.label, url: version.url });
  const patchVersion = (versionId: string, value: Partial<ToolVersion>) => {
    const nextVersions = versions.map((version) => version.id === versionId ? { ...version, ...value } : version);
    const selected = nextVersions.find((version) => version.id === currentVersionId);
    patch({ versions: nextVersions, version: selected?.label ?? "", url: selected?.url ?? "" });
  };

  return <DetailLayout eyebrow={`${item.status} · 工具集`} title={item.title} subtitle="用途、访问地址、多版本入口与迭代记录" back={back}>
    <div className="detailGrid"><div className="detailMain">
      <section className="panel detailSection">
        <SectionHead title="工具信息" subtitle="当前版本会作为工具集中的默认打开地址" />
        <div className="fieldGrid"><EditableField label="当前状态" value={item.status} onChange={(value) => patch({ status: value })} /><div className="currentVersionField"><span>当前版本</span><strong>{currentVersionLabel || "未设置"}</strong><small>{currentVersionUrl || "暂无访问链接"}</small></div><label className="editField wide"><span>用途说明</span><textarea value={item.description} onChange={(event) => patch({ description: event.target.value })} /></label></div>
        {currentVersionUrl ? <a className="launchButton" href={currentVersionUrl} target="_blank" rel="noreferrer">打开当前版本 ↗</a> : null}
      </section>

      <section className="panel detailSection versionManager">
        <SectionHead title="版本管理" subtitle={`保存每次部署的网址，需要时一键切换当前版本 · ${versions.length} 个版本`} />
        <div className="versionCreate">
          <label><span>版本名称</span><input value={newLabel} placeholder="例如：V5 / 1.2.0" onChange={(event) => setNewLabel(event.target.value)} /></label>
          <label><span>访问网址</span><input value={newUrl} placeholder="https://..." onChange={(event) => setNewUrl(event.target.value)} /></label>
          <label className="wide"><span>版本说明</span><textarea value={newNote} placeholder="这版新增了什么、保留原因或使用提示" onChange={(event) => setNewNote(event.target.value)} /></label>
          <button className="primaryButton" disabled={!newLabel.trim()} onClick={addVersion}>保存为新版本</button>
        </div>
        <div className="versionList">{versions.length === 0 && <div className="emptyState"><p>暂无版本，保存新版本后会显示在这里。</p></div>}{versions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          return <article className={`versionRow ${isCurrent ? "current" : ""}`} key={version.id}>
            <div className="versionBadge"><strong>{version.label}</strong><span>{isCurrent ? "当前" : version.createdAt || "历史"}</span></div>
            <div className="versionFields">
              <input aria-label={`${version.label} 版本名称`} value={version.label} onChange={(event) => patchVersion(version.id, { label: event.target.value })} />
              <input aria-label={`${version.label} 访问网址`} value={version.url} placeholder="版本网址" onChange={(event) => patchVersion(version.id, { url: event.target.value })} />
              <textarea aria-label={`${version.label} 版本说明`} value={version.note} placeholder="版本说明" onChange={(event) => patchVersion(version.id, { note: event.target.value })} />
            </div>
            <div className="versionActions">{version.url ? <a href={version.url} target="_blank" rel="noreferrer">打开</a> : null}<button className={isCurrent ? "active" : ""} disabled={isCurrent} onClick={() => selectVersion(version)}>{isCurrent ? "当前版本" : "设为当前"}</button></div>
          </article>;
        })}</div>
      </section>

      <section className="panel editorSection"><SectionHead title="产品详情与迭代记录" subtitle="用局部富文本记录迭代，也可直接拖入资料" /><BlockEditor blocks={item.blocks} onChange={(blocks) => patch({ blocks })} access={access} /></section>
    </div><aside className="detailAside"><div className="toolHero"><span>{item.title.slice(0, 1)}</span><strong>{item.title}</strong><small>版本 {currentVersionLabel || "未设置"}</small></div><div className="tipCard"><strong>版本管理建议</strong><p>保留可用的旧网址</p><p>记录本版核心变化</p><p>指定默认打开版本</p><p>注明测试版或稳定版</p><p>保留回退入口</p></div></aside></div>
  </DetailLayout>;
}

function ToolDetail({ item, setData, back, access }: { item: ToolItem; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; access: EditorAccess }) {
  const patch = (value: Partial<ToolItem>) => setData((current) => ({ ...current, tools: current.tools.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));
  return <DetailLayout eyebrow={`${item.status} · 工具集`} title={item.title} subtitle="用途、访问地址、版本与迭代记录" back={back}><div className="detailGrid"><div className="detailMain"><section className="panel detailSection"><SectionHead title="工具信息" subtitle="可以随时修改" /><div className="fieldGrid"><EditableField label="当前状态" value={item.status} onChange={(value) => patch({ status: value })} /><EditableField label="版本" value={item.version} onChange={(value) => patch({ version: value })} /><EditableField label="访问链接" value={item.url} onChange={(value) => patch({ url: value })} /><label className="editField wide"><span>用途说明</span><textarea value={item.description} onChange={(event) => patch({ description: event.target.value })} /></label></div>{item.url && <a className="launchButton" href={item.url} target="_blank" rel="noreferrer">打开工具 ↗</a>}</section><section className="panel editorSection"><SectionHead title="产品详情与迭代记录" subtitle="用局部富文本记录迭代，也可直接拖入资料" /><BlockEditor blocks={item.blocks} onChange={(blocks) => patch({ blocks })} access={access} /></section></div><aside className="detailAside"><div className="toolHero"><span>{item.title.slice(0, 1)}</span><strong>{item.title}</strong><small>版本 {item.version}</small></div><div className="tipCard"><strong>工具档案建议</strong><p>解决的问题</p><p>目标用户</p><p>功能清单</p><p>访问与部署</p><p>迭代记录</p></div></aside></div></DetailLayout>;
}

function SimpleDetail({ title, eyebrow, description, fields, blocks, setBlocks, back, access }: { title: string; eyebrow: string; description: string; fields: { label: string; value: string; onChange: (value: string) => void }[]; blocks: Block[]; setBlocks: (blocks: Block[]) => void; back: () => void; access: EditorAccess }) {
  return <DetailLayout eyebrow={eyebrow} title={title} subtitle={description || "详情记录"} back={back}><div className="detailGrid singleAside"><div className="detailMain"><section className="panel detailSection"><SectionHead title="基本记录" subtitle="可直接修改" /><div className="fieldGrid">{fields.map((field) => <EditableField key={field.label} label={field.label} value={field.value} onChange={field.onChange} />)}</div></section><section className="panel editorSection"><SectionHead title="详情内容" subtitle="支持局部富文本、目录和资料拖入" /><BlockEditor blocks={blocks} onChange={setBlocks} access={access} /></section></div></div></DetailLayout>;
}

const formatBlockTypes = new Set<BlockType>(["heading", "text", "checklist", "link", "image"]);
const fontSizePixels = { small: 13, normal: 15, large: 18, xlarge: 22 } as const;
const fontFamilies = { sans: "inherit", serif: "Georgia, 'Noto Serif SC', serif", mono: "'Cascadia Mono', Consolas, monospace" } as const;
const inlineTextColorOptions = [
  { value: "#28312c", label: "黑色", group: "standard" }, { value: "#c44747", label: "红色", group: "standard" },
  { value: "#3f7f62", label: "绿色", group: "standard" }, { value: "#3974a6", label: "蓝色", group: "standard" },
  { value: "#6f6259", label: "暖灰", group: "muted" }, { value: "#9b704c", label: "柔棕", group: "muted" },
  { value: "#607f99", label: "雾蓝", group: "muted" }, { value: "#756484", label: "灰紫", group: "muted" },
] as const;
const inlineHighlightOptions = [
  { value: "#f8d6d6", label: "浅红", group: "standard" }, { value: "#f6e9b9", label: "浅黄", group: "standard" },
  { value: "#d7ebdd", label: "浅绿", group: "standard" }, { value: "#d9e9f5", label: "浅蓝", group: "standard" },
  { value: "#f1e5d7", label: "米杏", group: "muted" }, { value: "#f1dfdf", label: "豆沙粉", group: "muted" },
  { value: "#dfe8df", label: "鼠尾草", group: "muted" }, { value: "#e8e2eb", label: "雾紫", group: "muted" },
] as const;

function textStyle(block: Block): React.CSSProperties {
  const headingSizes = { 1: 26, 2: 22, 3: 18 } as const;
  return {
    color: block.color,
    backgroundColor: block.backgroundColor,
    fontSize: block.fontSize ? fontSizePixels[block.fontSize] : block.type === "heading" ? headingSizes[block.headingLevel ?? 1] : undefined,
    fontWeight: block.fontWeight === "bold" ? 760 : block.fontWeight,
    fontStyle: block.fontStyle,
    textDecoration: block.textDecoration,
    textAlign: block.textAlign,
    fontFamily: block.fontFamily ? fontFamilies[block.fontFamily] : undefined,
  };
}

function scrollToContentBlock(id: string) {
  const target = document.getElementById(`content-block-${id}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.querySelector<HTMLElement>("[contenteditable='true'], input, textarea, button")?.focus({ preventScroll: true });
}

function BlockToc({ blocks, compact = false }: { blocks: Block[]; compact?: boolean }) {
  const headings = blocks.filter((block) => block.type === "heading" && block.text?.trim());
  return <nav className={`blockToc ${compact ? "compact" : ""}`} aria-label="内容目录">
    <div><strong>内容目录</strong><span>{headings.length} 个标题</span></div>
    {headings.length ? <ol>{headings.map((block) => <li className={`level${block.headingLevel ?? 1}`} key={block.id}><button onClick={() => scrollToContentBlock(block.id)}>{block.text}</button></li>)}</ol> : <p>插入标题后，目录会自动生成。</p>}
  </nav>;
}

function BlockInsertPoint({ index, open, dropActive, onToggle, onInsert, onDragOver, onDrop }: {
  index: number;
  open: boolean;
  dropActive: boolean;
  onToggle: () => void;
  onInsert: (type: BlockType, headingLevel?: 1 | 2 | 3) => void;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
}) {
  const positionLabel = index === 0 ? "最前面" : `第 ${index} 个内容块后`;
  return <div className={`blockInsertPoint ${open ? "open" : ""} ${dropActive ? "dropActive" : ""}`} onDragOver={onDragOver} onDrop={onDrop}>
    <button type="button" className="blockInsertToggle" aria-expanded={open} aria-label={`在${positionLabel}插入内容`} title={`在${positionLabel}插入内容`} onClick={onToggle}>＋</button>
    {open && <div className="blockInsertMenu" role="toolbar" aria-label={`在${positionLabel}插入`}>
      <span>插入到这里</span>
      <button type="button" onClick={() => onInsert("heading", 1)}>标题</button>
      <button type="button" onClick={() => onInsert("heading", 2)}>次级标题</button>
      <button type="button" onClick={() => onInsert("text")}>正文</button>
      <button type="button" onClick={() => onInsert("checklist")}>清单</button>
      <button type="button" onClick={() => onInsert("link")}>链接</button>
      <button type="button" onClick={() => onInsert("table")}>表格</button>
      <button type="button" onClick={() => onInsert("image")}>图片</button>
      <button type="button" onClick={() => onInsert("file")}>附件</button>
      <button type="button" className="blockInsertClose" aria-label="关闭插入菜单" onClick={onToggle}>×</button>
    </div>}
  </div>;
}

type InlineMarks = Omit<InlineRun, "text">;
type SavedInlineSelection = { blockId: string; element: HTMLElement; range: Range };
type FloatingInlineToolbar = { top: number; left: number; placement: "above" | "below" };
type UploadState = { progress: number; error?: string; dragging?: boolean };
type DeletedItem =
  | { kind: "block"; block: Block; index: number; beforeId?: string; afterId?: string }
  | { kind: "embeddedImage"; blockId: string; image: EmbeddedImage; index: number }
  | { kind: "embeddedFile"; blockId: string; file: StoredAttachment; index: number };

function inlineMarkKey(run: InlineRun) {
  return JSON.stringify({ bold: run.bold, italic: run.italic, underline: run.underline, strike: run.strike, color: run.color, backgroundColor: run.backgroundColor, fontSize: run.fontSize, fontFamily: run.fontFamily });
}

function compactInlineRuns(runs: InlineRun[]) {
  const compacted: InlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = compacted.at(-1);
    if (previous && inlineMarkKey(previous) === inlineMarkKey(run)) previous.text += run.text;
    else compacted.push({ ...run });
  }
  if (compacted.length <= 2000) return compacted;
  const kept = compacted.slice(0, 1999);
  kept.push({ text: compacted.slice(1999).map((run) => run.text).join("") });
  return kept;
}

function normalizedColor(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "transparent") return undefined;
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) return `#${trimmed.slice(1).split("").map((part) => part + part).join("")}`;
  const rgba = trimmed.match(/^rgba\(\s*(\d+)\D+(\d+)\D+(\d+)\D+([\d.]+)\s*\)$/);
  if (rgba && Number(rgba[4]) === 0) return undefined;
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);
  if (!rgb) return undefined;
  return `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
}

function inlineFontSize(value: string | null): InlineRun["fontSize"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const numeric = Number.parseFloat(normalized);
  if (normalized === "1" || normalized === "2" || normalized.includes("small") || (Number.isFinite(numeric) && numeric <= 13)) return "small";
  if (normalized === "5" || normalized.includes("large") || (Number.isFinite(numeric) && numeric >= 18 && numeric < 22)) return "large";
  if (["6", "7"].includes(normalized) || normalized.includes("x-large") || (Number.isFinite(numeric) && numeric >= 22)) return "xlarge";
  return "normal";
}

function inlineFontFamily(value: string): InlineRun["fontFamily"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("mono") || normalized.includes("consolas") || normalized.includes("cascadia")) return "mono";
  if (normalized.includes("georgia") || normalized.includes("serif")) return "serif";
  return value ? "sans" : undefined;
}

function readInlineRuns(root: HTMLElement) {
  const runs: InlineRun[] = [];
  const append = (text: string, marks: InlineMarks) => { if (text) runs.push({ text: text.replaceAll("\u00a0", " "), ...marks }); };
  const visit = (node: Node, inherited: InlineMarks) => {
    if (node.nodeType === Node.TEXT_NODE) { append(node.textContent ?? "", inherited); return; }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { append("\n", inherited); return; }
    const marks: InlineMarks = { ...inherited };
    const tag = node.tagName;
    if (tag === "B" || tag === "STRONG" || node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600) marks.bold = true;
    if (tag === "I" || tag === "EM" || node.style.fontStyle === "italic") marks.italic = true;
    const decoration = node.style.textDecoration || node.style.textDecorationLine;
    if (tag === "U" || decoration.includes("underline")) marks.underline = true;
    if (tag === "S" || tag === "STRIKE" || decoration.includes("line-through")) marks.strike = true;
    const color = normalizedColor(node.style.color || node.getAttribute("color") || "");
    const backgroundColor = normalizedColor(node.style.backgroundColor || "");
    if (color) marks.color = color;
    if (backgroundColor) marks.backgroundColor = backgroundColor;
    const size = inlineFontSize(node.style.fontSize || node.getAttribute("size"));
    if (size) marks.fontSize = size;
    const family = inlineFontFamily(node.style.fontFamily || node.getAttribute("face") || "");
    if (family) marks.fontFamily = family;
    const startsAt = runs.length;
    node.childNodes.forEach((child) => visit(child, marks));
    if ((tag === "DIV" || tag === "P") && runs.length > startsAt && !runs.at(-1)?.text.endsWith("\n")) append("\n", marks);
  };
  root.childNodes.forEach((node) => visit(node, {}));
  const compacted = compactInlineRuns(runs);
  const text = compacted.map((run) => run.text).join("").replace(/\n$/, "");
  const trimmedRuns = text.length === compacted.map((run) => run.text).join("").length ? compacted : compacted.map((run, index) => index === compacted.length - 1 ? { ...run, text: run.text.replace(/\n$/, "") } : run).filter((run) => run.text);
  return { text, runs: compactInlineRuns(trimmedRuns) };
}

function richFingerprint(text: string, runs?: InlineRun[]) {
  return JSON.stringify([text, runs ?? null]);
}

function writeInlineRuns(element: HTMLElement, text: string, runs?: InlineRun[]) {
  element.replaceChildren();
  const source = runs?.length ? runs : text ? [{ text }] : [];
  source.forEach((run) => {
    const segments = run.text.split("\n");
    segments.forEach((segment, index) => {
      if (segment) {
        const span = document.createElement("span");
        span.textContent = segment;
        if (run.bold) span.style.fontWeight = "700";
        if (run.italic) span.style.fontStyle = "italic";
        if (run.underline || run.strike) span.style.textDecoration = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean).join(" ");
        if (run.color) span.style.color = run.color;
        if (run.backgroundColor) span.style.backgroundColor = run.backgroundColor;
        if (run.fontSize) span.style.fontSize = `${fontSizePixels[run.fontSize]}px`;
        if (run.fontFamily) span.style.fontFamily = fontFamilies[run.fontFamily];
        element.append(span);
      }
      if (index < segments.length - 1) element.append(document.createElement("br"));
    });
  });
  element.dataset.richKey = richFingerprint(text, runs);
}

function normalizedPastedText(value: string) {
  return value.replace(/\r\n?/g, "\n").replaceAll("\u00a0", " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function sanitizedRichPaste(html: string) {
  const source = new DOMParser().parseFromString(html, "text/html");
  const output = document.createElement("div");
  const appendBreak = (target: Node) => {
    if (target.lastChild instanceof HTMLBRElement) return;
    target.appendChild(document.createElement("br"));
  };
  const append = (node: Node, target: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode((node.textContent ?? "").replaceAll("\u00a0", " "))); return; }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") { appendBreak(target); return; }
    if (tag === "UL" || tag === "OL") {
      Array.from(node.children).forEach((child, index) => {
        if (child.tagName !== "LI") { append(child, target); return; }
        target.appendChild(document.createTextNode(tag === "OL" ? `${index + 1}. ` : "• "));
        child.childNodes.forEach((entry) => {
          if (entry instanceof HTMLElement && ["P", "DIV"].includes(entry.tagName)) entry.childNodes.forEach((nested) => append(nested, target));
          else { if (entry instanceof HTMLElement && ["UL", "OL"].includes(entry.tagName)) appendBreak(target); append(entry, target); }
        });
        appendBreak(target);
      });
      return;
    }
    if (["TABLE", "TBODY", "THEAD", "TFOOT"].includes(tag)) { node.childNodes.forEach((child) => append(child, target)); return; }
    if (tag === "TR") {
      Array.from(node.children).forEach((cell, index) => { if (index) target.appendChild(document.createTextNode("\t")); append(cell, target); });
      appendBreak(target);
      return;
    }
    if (tag === "TD" || tag === "TH") { node.childNodes.forEach((child) => append(child, target)); return; }
    if (tag === "HR") { appendBreak(target); target.appendChild(document.createTextNode("——")); appendBreak(target); return; }
    if (tag === "PRE") {
      const code = document.createElement("span");
      code.style.fontFamily = "Consolas";
      const lines = normalizedPastedText(node.textContent ?? "").split("\n");
      lines.forEach((line, index) => { code.appendChild(document.createTextNode(line)); if (index < lines.length - 1) code.appendChild(document.createElement("br")); });
      target.appendChild(code);
      appendBreak(target);
      return;
    }
    const inlineTags: Record<string, string> = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u", S: "s", STRIKE: "s" };
    if (inlineTags[tag]) {
      const clean = document.createElement(inlineTags[tag]);
      node.childNodes.forEach((child) => append(child, clean));
      target.appendChild(clean);
      return;
    }
    if (tag === "CODE") {
      const clean = document.createElement("span");
      clean.style.fontFamily = "Consolas";
      node.childNodes.forEach((child) => append(child, clean));
      target.appendChild(clean);
      return;
    }
    const isHeading = /^H[1-6]$/.test(tag);
    const isBlock = ["P", "DIV", "SECTION", "ARTICLE", "BLOCKQUOTE"].includes(tag) || isHeading;
    if (isBlock && target.childNodes.length) appendBreak(target);
    if (tag === "BLOCKQUOTE") target.appendChild(document.createTextNode("│ "));
    const contentTarget = isHeading ? document.createElement("strong") : target;
    node.childNodes.forEach((child) => append(child, contentTarget));
    if (isHeading) target.appendChild(contentTarget);
    if (isBlock) appendBreak(target);
  };
  source.body.childNodes.forEach((node) => append(node, output));
  while (output.lastChild instanceof HTMLBRElement) output.lastChild.remove();
  return output.innerHTML;
}

function RichTextField({ block, placeholder, ariaLabel, multiline, onChange, onSelection }: { block: Block; placeholder: string; ariaLabel: string; multiline: boolean; onChange: (value: Pick<Block, "text" | "inlineRuns">) => void; onSelection: (selection: SavedInlineSelection | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fingerprint = richFingerprint(block.text ?? "", block.inlineRuns);
    if (element.dataset.richKey !== fingerprint && document.activeElement !== element) writeInlineRuns(element, block.text ?? "", block.inlineRuns);
  }, [block.text, block.inlineRuns]);
  const emit = () => {
    const element = ref.current;
    if (!element) return;
    const value = element.innerText ? readInlineRuns(element) : { text: "", runs: [] };
    const hasFormatting = value.runs.some((run) => Object.keys(run).some((key) => key !== "text"));
    const inlineRuns = hasFormatting ? value.runs : undefined;
    element.dataset.richKey = richFingerprint(value.text, inlineRuns);
    onChange({ text: value.text, inlineRuns });
  };
  const capture = () => {
    const element = ref.current;
    const selection = window.getSelection();
    if (!element || !selection || selection.rangeCount === 0 || selection.isCollapsed) { onSelection(null); return; }
    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    if (!ancestor || !element.contains(ancestor)) { onSelection(null); return; }
    onSelection({ blockId: block.id, element, range: range.cloneRange() });
  };
  return <div
    ref={ref}
    className="richTextField"
    contentEditable
    role="textbox"
    data-block-id={block.id}
    aria-label={ariaLabel}
    aria-multiline={multiline}
    data-placeholder={placeholder}
    style={textStyle(block)}
    suppressContentEditableWarning
    onInput={() => { emit(); capture(); }}
    onMouseUp={capture}
    onKeyUp={capture}
    onTouchEnd={capture}
    onBlur={emit}
    onKeyDown={(event) => { if (!multiline && event.key === "Enter") event.preventDefault(); }}
    onPaste={(event) => {
      event.preventDefault();
      const plain = normalizedPastedText(event.clipboardData.getData("text/plain"));
      const html = event.clipboardData.getData("text/html");
      if (multiline && html) document.execCommand("insertHTML", false, sanitizedRichPaste(html));
      else document.execCommand("insertText", false, multiline ? plain : plain.replace(/\s*\n\s*/g, " "));
      emit();
    }}
  />;
}

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileProxyUrl(asset: { url?: string; fileName?: string }, download = false) {
  if (!asset.url) return "";
  const params = new URLSearchParams({ url: asset.url, name: asset.fileName ?? "attachment" });
  if (download) params.set("download", "1");
  return `/api/files?${params}`;
}

function BlockEditor({ blocks, onChange, showToc = true, access }: { blocks: Block[]; onChange: (blocks: Block[]) => void; showToc?: boolean; access: EditorAccess }) {
  const [selectedId, setSelectedId] = useState(() => blocks.find((block) => formatBlockTypes.has(block.type))?.id ?? "");
  const [selectionLabel, setSelectionLabel] = useState("");
  const [floatingToolbar, setFloatingToolbar] = useState<FloatingInlineToolbar | null>(null);
  const [inlineColor, setInlineColor] = useState("#6f6259");
  const [highlightColor, setHighlightColor] = useState("#f1e5d7");
  const [activeInlineColor, setActiveInlineColor] = useState("");
  const [activeHighlightColor, setActiveHighlightColor] = useState("");
  const [colorPanel, setColorPanel] = useState<"text" | "highlight" | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [editorNotice, setEditorNotice] = useState("");
  const [draggingEditor, setDraggingEditor] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState("");
  const [blockDropIndex, setBlockDropIndex] = useState<number | null>(null);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const blocksRef = useRef(blocks);
  const editorRef = useRef<HTMLDivElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<SavedInlineSelection | null>(null);
  const selectingPointerRef = useRef(false);
  const draggingBlockRef = useRef("");
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => {
    if (!blocks.some((block) => block.id === selectedId && formatBlockTypes.has(block.type))) setSelectedId(blocks.find((block) => formatBlockTypes.has(block.type))?.id ?? "");
  }, [blocks, selectedId]);
  const emitBlocks = (next: Block[]) => { blocksRef.current = next; onChange(next); };
  const selected = blocks.find((block) => block.id === selectedId && formatBlockTypes.has(block.type));
  const add = (type: BlockType, options: { headingLevel?: 1 | 2 | 3; at?: number } = {}) => {
    const headingLevel = options.headingLevel ?? 1;
    const block: Block = type === "table" ? { id: uid(), type, rows: [["项目", "内容"], ["", ""]] } : type === "file" ? { id: uid(), type } : { id: uid(), type, text: type === "heading" ? (headingLevel === 1 ? "新标题" : "新次级标题") : type === "checklist" ? "待办事项" : "", ...(type === "heading" ? { headingLevel } : {}) };
    const at = Math.max(0, Math.min(options.at ?? blocksRef.current.length, blocksRef.current.length));
    const next = [...blocksRef.current];
    next.splice(at, 0, block);
    emitBlocks(next);
    setInsertAt(null);
    if (formatBlockTypes.has(type)) setSelectedId(block.id);
    return block;
  };
  const patch = (id: string, value: Partial<Block>) => emitBlocks(blocksRef.current.map((block) => block.id === id ? { ...block, ...value } : block));
  const closeInlineToolbar = useCallback(() => {
    selectionRef.current = null;
    setSelectionLabel("");
    setFloatingToolbar(null);
    setColorPanel(null);
  }, []);
  const moveBlockTo = (blockId: string, insertionIndex: number) => {
    const current = blocksRef.current;
    const fromIndex = current.findIndex((block) => block.id === blockId);
    if (fromIndex < 0) return;
    const moving = current[fromIndex];
    const next = current.filter((block) => block.id !== blockId);
    const adjustedIndex = Math.max(0, Math.min(insertionIndex - (fromIndex < insertionIndex ? 1 : 0), next.length));
    if (adjustedIndex === fromIndex) return;
    next.splice(adjustedIndex, 0, moving);
    emitBlocks(next);
    setSelectedId(moving.id);
    setInsertAt(null);
    closeInlineToolbar();
  };
  const moveBlockBy = (blockId: string, offset: -1 | 1) => {
    const current = blocksRef.current;
    const fromIndex = current.findIndex((block) => block.id === blockId);
    const targetIndex = fromIndex + offset;
    if (fromIndex < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const next = [...current];
    [next[fromIndex], next[targetIndex]] = [next[targetIndex], next[fromIndex]];
    emitBlocks(next);
    setSelectedId(blockId);
    setInsertAt(null);
    closeInlineToolbar();
  };
  const removeBlock = (blockId: string) => {
    const current = blocksRef.current;
    const index = current.findIndex((block) => block.id === blockId);
    if (index < 0) return;
    setDeletedItems((history) => [...history.slice(-19), { kind: "block", block: current[index], index, beforeId: current[index - 1]?.id, afterId: current[index + 1]?.id }]);
    emitBlocks(current.filter((block) => block.id !== blockId));
    if (selectedId === blockId) setSelectedId("");
    closeInlineToolbar();
  };
  const removeEmbeddedImage = (blockId: string, imageId: string) => {
    const block = blocksRef.current.find((entry) => entry.id === blockId);
    const index = block?.embeddedImages?.findIndex((image) => image.id === imageId) ?? -1;
    if (!block || index < 0 || !block.embeddedImages) return;
    setDeletedItems((history) => [...history.slice(-19), { kind: "embeddedImage", blockId, image: block.embeddedImages![index], index }]);
    patch(blockId, { embeddedImages: block.embeddedImages.filter((image) => image.id !== imageId) });
  };
  const removeEmbeddedFile = (blockId: string, fileId: string) => {
    const block = blocksRef.current.find((entry) => entry.id === blockId);
    const index = block?.embeddedFiles?.findIndex((file) => file.id === fileId) ?? -1;
    if (!block || index < 0 || !block.embeddedFiles) return;
    setDeletedItems((history) => [...history.slice(-19), { kind: "embeddedFile", blockId, file: block.embeddedFiles![index], index }]);
    patch(blockId, { embeddedFiles: block.embeddedFiles.filter((file) => file.id !== fileId) });
  };
  const undoDelete = () => {
    const deleted = deletedItems.at(-1);
    if (!deleted) return;
    if (deleted.kind === "embeddedImage") {
      const block = blocksRef.current.find((entry) => entry.id === deleted.blockId);
      if (!block || block.embeddedImages?.some((image) => image.id === deleted.image.id)) return;
      const images = [...(block.embeddedImages ?? [])];
      images.splice(Math.min(deleted.index, images.length), 0, deleted.image);
      patch(block.id, { embeddedImages: images });
      setDeletedItems((history) => history.slice(0, -1));
      return;
    }
    if (deleted.kind === "embeddedFile") {
      const block = blocksRef.current.find((entry) => entry.id === deleted.blockId);
      if (!block || block.embeddedFiles?.some((file) => file.id === deleted.file.id)) return;
      const files = [...(block.embeddedFiles ?? [])];
      files.splice(Math.min(deleted.index, files.length), 0, deleted.file);
      patch(block.id, { embeddedFiles: files });
      setDeletedItems((history) => history.slice(0, -1));
      return;
    }
    if (blocksRef.current.some((block) => block.id === deleted.block.id)) return;
    const next = [...blocksRef.current];
    const afterIndex = deleted.afterId ? next.findIndex((block) => block.id === deleted.afterId) : -1;
    const beforeIndex = deleted.beforeId ? next.findIndex((block) => block.id === deleted.beforeId) : -1;
    const restoreAt = afterIndex >= 0 ? afterIndex : beforeIndex >= 0 ? beforeIndex + 1 : Math.min(deleted.index, next.length);
    next.splice(restoreAt, 0, deleted.block);
    emitBlocks(next);
    setDeletedItems((history) => history.slice(0, -1));
    if (formatBlockTypes.has(deleted.block.type)) setSelectedId(deleted.block.id);
  };
  const startBlockDrag = (event: React.DragEvent, blockId: string) => {
    draggingBlockRef.current = blockId;
    setDraggingBlockId(blockId);
    setInsertAt(null);
    closeInlineToolbar();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-xuliu-block", blockId);
  };
  const markBlockDrop = (event: React.DragEvent, index: number) => {
    if (!draggingBlockRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setBlockDropIndex(index);
  };
  const dropBlockAt = (event: React.DragEvent, index: number) => {
    if (!draggingBlockRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    moveBlockTo(draggingBlockRef.current, index);
    draggingBlockRef.current = "";
    setDraggingBlockId("");
    setBlockDropIndex(null);
  };
  const finishBlockDrag = () => {
    draggingBlockRef.current = "";
    setDraggingBlockId("");
    setBlockDropIndex(null);
  };
  const rememberSelection = useCallback((selection: SavedInlineSelection | null) => {
    const selectedText = selection?.range.toString().trim() ?? "";
    if (!selection || !selectedText || !document.contains(selection.element)) { closeInlineToolbar(); return; }
    const rangeRect = selection.range.getBoundingClientRect();
    const fallbackRect = selection.element.getBoundingClientRect();
    const rect = rangeRect.width || rangeRect.height ? rangeRect : fallbackRect;
    const toolbarWidth = Math.min(560, Math.max(280, window.innerWidth - 24));
    const halfWidth = toolbarWidth / 2;
    const left = Math.min(window.innerWidth - halfWidth - 12, Math.max(halfWidth + 12, rect.left + rect.width / 2));
    const placement = rect.top > 150 ? "above" : "below";
    const startElement = selection.range.startContainer.nodeType === Node.TEXT_NODE ? selection.range.startContainer.parentElement : selection.range.startContainer;
    const selectedStyle = getComputedStyle(startElement instanceof HTMLElement ? startElement : selection.element);
    const detectedInlineColor = normalizedColor(selectedStyle.color);
    const detectedHighlightColor = normalizedColor(selectedStyle.backgroundColor);
    selectionRef.current = selection;
    setSelectionLabel(selectedText.slice(0, 36));
    setFloatingToolbar({ left, top: placement === "above" ? rect.top - 10 : rect.bottom + 10, placement });
    setActiveInlineColor(detectedInlineColor ?? "");
    setActiveHighlightColor(detectedHighlightColor ?? "");
    if (detectedInlineColor) setInlineColor(detectedInlineColor);
    if (detectedHighlightColor) setHighlightColor(detectedHighlightColor);
    setSelectedId(selection.blockId);
  }, [closeInlineToolbar]);
  useEffect(() => {
    const captureCurrentSelection = () => {
      if (selectingPointerRef.current) return;
      const current = window.getSelection();
      if (!current || current.rangeCount === 0 || current.isCollapsed) return;
      const range = current.getRangeAt(0);
      const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
      const element = ancestor instanceof HTMLElement ? (ancestor.matches(".richTextField") ? ancestor : ancestor.closest<HTMLElement>(".richTextField")) : null;
      const blockId = element?.dataset.blockId;
      if (!element || !blockId || !editorRef.current?.contains(element) || !element.contains(range.startContainer) || !element.contains(range.endContainer)) return;
      rememberSelection({ blockId, element, range: range.cloneRange() });
    };
    let captureFrame = 0;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const targetElement = target instanceof Element ? target : target.parentElement;
      const richTextField = targetElement?.closest<HTMLElement>(".richTextField");
      if (richTextField && editorRef.current?.contains(richTextField)) {
        selectingPointerRef.current = true;
        setFloatingToolbar(null);
        setColorPanel(null);
        return;
      }
      selectingPointerRef.current = false;
      if (floatingToolbarRef.current?.contains(target) || selectionRef.current?.element.contains(target)) return;
      closeInlineToolbar();
    };
    const finishPointerSelection = () => {
      if (!selectingPointerRef.current) return;
      selectingPointerRef.current = false;
      window.cancelAnimationFrame(captureFrame);
      captureFrame = window.requestAnimationFrame(captureCurrentSelection);
    };
    const cancelPointerSelection = () => {
      selectingPointerRef.current = false;
      closeInlineToolbar();
    };
    const closeOnViewportChange = () => closeInlineToolbar();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeInlineToolbar(); };
    document.addEventListener("selectionchange", captureCurrentSelection);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", finishPointerSelection);
    document.addEventListener("pointercancel", cancelPointerSelection);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("selectionchange", captureCurrentSelection);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", finishPointerSelection);
      document.removeEventListener("pointercancel", cancelPointerSelection);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.cancelAnimationFrame(captureFrame);
    };
  }, [closeInlineToolbar, rememberSelection]);
  const applyInline = (command: string, value?: string) => {
    const saved = selectionRef.current;
    if (!saved || !document.contains(saved.element)) return;
    saved.element.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(saved.range);
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    const parsed = readInlineRuns(saved.element);
    const hasFormatting = parsed.runs.some((run) => Object.keys(run).some((key) => key !== "text"));
    const inlineRuns = hasFormatting ? parsed.runs : undefined;
    saved.element.dataset.richKey = richFingerprint(parsed.text, inlineRuns);
    patch(saved.blockId, { text: parsed.text, inlineRuns });
    if (selection?.rangeCount) selectionRef.current = { ...saved, range: selection.getRangeAt(0).cloneRange() };
  };
  const insertSelectedSymbol = (symbol: "→" | "•") => {
    applyInline("insertText", symbol);
    closeInlineToolbar();
  };
  const uploadFile = async (id: string, file: File, kind: "image" | "file") => {
    setEditorNotice("");
    if (access.readOnly) { setEditorNotice("只读空间不能上传资料。"); return; }
    if (access.preview) { setEditorNotice("本地预览不连接云端资料库，请在正式网站上传。"); return; }
    if (kind === "image" && !file.type.startsWith("image/")) { setUploads((current) => ({ ...current, [id]: { progress: 0, error: "这里需要拖入图片文件。" } })); return; }
    if (file.size > 50 * 1024 * 1024) { setUploads((current) => ({ ...current, [id]: { progress: 0, error: "单个文件不能超过 50 MB。" } })); return; }
    setUploads((current) => ({ ...current, [id]: { progress: 1 } }));
    try {
      const safeName = file.name.replace(/[\\/?%*:|"<>]/g, "-").slice(0, 220) || "attachment";
      const result = await uploadBlob(`attachments/${access.ownerId}/${id}/${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/files",
        clientPayload: JSON.stringify({ blockId: id }),
        multipart: file.size > 5 * 1024 * 1024,
        contentType: file.type || "application/octet-stream",
        onUploadProgress: ({ percentage }) => setUploads((current) => ({ ...current, [id]: { progress: Math.max(1, Math.round(percentage)) } })),
      });
      patch(id, { url: result.url, fileName: file.name.slice(0, 300), fileSize: file.size, mimeType: file.type || "application/octet-stream", uploadedAt: new Date().toISOString() });
      setUploads((current) => ({ ...current, [id]: { progress: 100 } }));
    } catch (error) {
      setUploads((current) => ({ ...current, [id]: { progress: 0, error: error instanceof Error ? error.message : "上传失败，请稍后重试。" } }));
    }
  };
  const uploadEmbeddedImage = async (blockId: string, file: File) => {
    const uploadKey = `embedded:${blockId}`;
    setEditorNotice("");
    if (access.readOnly) { setEditorNotice("只读空间不能插入图片。"); return; }
    if (access.preview) { setEditorNotice("本地预览不连接云端图片库，请在正式网站插入。"); return; }
    if (!file.type.startsWith("image/")) { setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: "文字框内只能插入图片文件。" } })); return; }
    if (file.size > 50 * 1024 * 1024) { setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: "单张图片不能超过 50 MB。" } })); return; }
    const currentBlock = blocksRef.current.find((block) => block.id === blockId);
    if ((currentBlock?.embeddedImages?.length ?? 0) + (currentBlock?.embeddedFiles?.length ?? 0) >= 50) { setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: "一个文字框最多插入 50 个图片或文件。" } })); return; }
    const imageId = uid();
    setUploads((current) => ({ ...current, [uploadKey]: { progress: 1 } }));
    try {
      const safeName = file.name.replace(/[\\/?%*:|"<>]/g, "-").slice(0, 220) || "image";
      const result = await uploadBlob(`attachments/${access.ownerId}/${blockId}/embedded-${imageId}/${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/files",
        clientPayload: JSON.stringify({ blockId }),
        multipart: file.size > 5 * 1024 * 1024,
        contentType: file.type,
        onUploadProgress: ({ percentage }) => setUploads((current) => ({ ...current, [uploadKey]: { progress: Math.max(1, Math.round(percentage)) } })),
      });
      const target = blocksRef.current.find((block) => block.id === blockId);
      if (!target) return;
      const embeddedImage: EmbeddedImage = { id: imageId, url: result.url, fileName: file.name.slice(0, 300), fileSize: file.size, mimeType: file.type, uploadedAt: new Date().toISOString(), caption: "" };
      patch(blockId, { embeddedImages: [...(target.embeddedImages ?? []), embeddedImage] });
      setUploads((current) => ({ ...current, [uploadKey]: { progress: 100 } }));
    } catch (error) {
      setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: error instanceof Error ? error.message : "图片上传失败，请稍后重试。" } }));
    }
  };
  const uploadEmbeddedFile = async (blockId: string, file: File) => {
    const uploadKey = `embedded:${blockId}`;
    setEditorNotice("");
    if (access.readOnly) { setEditorNotice("只读空间不能插入文件。"); return; }
    if (access.preview) { setEditorNotice("本地预览不连接云端资料库，请在正式网站插入。"); return; }
    if (file.size > 50 * 1024 * 1024) { setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: "单个文件不能超过 50 MB。" } })); return; }
    const currentBlock = blocksRef.current.find((block) => block.id === blockId);
    if ((currentBlock?.embeddedImages?.length ?? 0) + (currentBlock?.embeddedFiles?.length ?? 0) >= 50) { setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: "一个文字框最多插入 50 个图片或文件。" } })); return; }
    const fileId = uid();
    setUploads((current) => ({ ...current, [uploadKey]: { progress: 1 } }));
    try {
      const safeName = file.name.replace(/[\\/?%*:|"<>]/g, "-").slice(0, 220) || "attachment";
      const result = await uploadBlob(`attachments/${access.ownerId}/${blockId}/embedded-file-${fileId}/${safeName}`, file, {
        access: "private", handleUploadUrl: "/api/files", clientPayload: JSON.stringify({ blockId }),
        multipart: file.size > 5 * 1024 * 1024, contentType: file.type || "application/octet-stream",
        onUploadProgress: ({ percentage }) => setUploads((current) => ({ ...current, [uploadKey]: { progress: Math.max(1, Math.round(percentage)) } })),
      });
      const target = blocksRef.current.find((block) => block.id === blockId);
      if (!target) return;
      const embeddedFile: StoredAttachment = { id: fileId, url: result.url, fileName: file.name.slice(0, 300), fileSize: file.size, mimeType: file.type || "application/octet-stream", uploadedAt: new Date().toISOString() };
      patch(blockId, { embeddedFiles: [...(target.embeddedFiles ?? []), embeddedFile] });
      setUploads((current) => ({ ...current, [uploadKey]: { progress: 100 } }));
    } catch (error) {
      setUploads((current) => ({ ...current, [uploadKey]: { progress: 0, error: error instanceof Error ? error.message : "文件上传失败，请稍后重试。" } }));
    }
  };
  const uploadEmbeddedAssets = async (blockId: string, files: File[]) => {
    for (const file of files.slice(0, 8)) {
      if (file.type.startsWith("image/")) await uploadEmbeddedImage(blockId, file);
      else await uploadEmbeddedFile(blockId, file);
    }
  };
  const uploadDrop = (event: React.DragEvent, id: string, kind: "image" | "file") => {
    event.preventDefault(); event.stopPropagation();
    setUploads((current) => ({ ...current, [id]: { ...(current[id] ?? { progress: 0 }), dragging: false } }));
    const file = event.dataTransfer.files[0];
    if (file) void uploadFile(id, file, kind);
  };
  const addDroppedFiles = (files: File[]) => {
    if (access.readOnly || access.preview) { setEditorNotice(access.readOnly ? "只读空间不能上传资料。" : "请在正式网站上传资料。"); return; }
    const created = files.slice(0, 8).map((file) => ({ id: uid(), type: file.type.startsWith("image/") ? "image" as const : "file" as const, text: "" }));
    emitBlocks([...blocksRef.current, ...created]);
    created.forEach((block, index) => { void uploadFile(block.id, files[index], block.type); });
  };
  const attachmentCount = blocks.reduce((count, block) => count + (block.type === "file" || block.type === "image" ? 1 : 0) + (block.embeddedImages?.length ?? 0) + (block.embeddedFiles?.length ?? 0), 0);
  const characterCount = blocks.reduce((sum, block) => sum + (block.text?.length ?? 0), 0);
  const lastDeleted = deletedItems.at(-1);
  const deletedLabel = lastDeleted ? (lastDeleted.kind === "embeddedImage" ? (lastDeleted.image.caption?.trim() || lastDeleted.image.fileName || "内嵌图片") : lastDeleted.kind === "embeddedFile" ? lastDeleted.file.fileName : (lastDeleted.block.text?.trim() || lastDeleted.block.fileName || (lastDeleted.block.type === "image" ? "图片" : lastDeleted.block.type === "file" ? "附件" : "内容块"))).slice(0, 36) : "";
  return <div ref={editorRef} className={`blockEditor ${draggingEditor ? "dragging" : ""}`}>
    <div className="editorSummary"><div><strong>自由笔记与资料库</strong><span>{characterCount} 字 · {blocks.length} 个内容块 · {attachmentCount} 份资料</span></div><small>文件独立云端存储 · 单个最大 50 MB</small></div>
    <div className="blockToolbar"><span>末尾插入</span><button onClick={() => add("heading", { headingLevel: 1 })}>标题</button><button onClick={() => add("heading", { headingLevel: 2 })}>次级标题</button><button onClick={() => add("text")}>正文</button><button onClick={() => add("checklist")}>清单</button><button onClick={() => add("link")}>链接</button><button onClick={() => add("table")}>表格</button><button onClick={() => add("image")}>图片</button><button onClick={() => add("file")}>附件</button><small>指定位置请点内容块之间的＋</small></div>
    {lastDeleted && <div className="undoDeleteBar" role="status" aria-live="polite"><span>已删除“{deletedLabel}{deletedLabel.length >= 36 ? "…" : ""}”{deletedItems.length > 1 ? ` · 还可撤回 ${deletedItems.length} 项` : ""}</span><button type="button" onClick={undoDelete}>撤回删除</button></div>}
    {floatingToolbar && selectionLabel && <div
      ref={floatingToolbarRef}
      className={`floatingInlineToolbar ${floatingToolbar.placement}`}
      style={{ top: floatingToolbar.top, left: floatingToolbar.left }}
      role="toolbar"
      aria-label={`设置所选文字格式：${selectionLabel}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="floatingSelectionLabel" title={selectionLabel}>“{selectionLabel}{selectionLabel.length >= 36 ? "…" : ""}”</span>
      <div className="floatingFormatButtons">
        <button aria-label="所选文字加粗" title="加粗" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInline("bold")}><b>B</b></button>
        <button aria-label="所选文字斜体" title="斜体" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInline("italic")}><i>I</i></button>
        <button aria-label="所选文字下划线" title="下划线" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInline("underline")}><u>U</u></button>
        <button aria-label="所选文字删除线" title="删除线" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInline("strikeThrough")}><s>S</s></button>
      </div>
      <div className="floatingFormatButtons floatingSymbolButtons" aria-label="快捷符号">
        <button aria-label="用右箭头替换所选文字" title="插入 →" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSelectedSymbol("→")}>→</button>
        <button aria-label="用项目圆点替换所选文字" title="插入 •" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSelectedSymbol("•")}>•</button>
      </div>
      <label>字体<select defaultValue="" aria-label="所选文字字体" onChange={(event) => { if (event.target.value) applyInline("fontName", event.target.value); event.target.value = ""; }}><option value="">选择</option><option value="Arial">默认</option><option value="Georgia">衬线</option><option value="Consolas">等宽</option></select></label>
      <label>字号<select defaultValue="" aria-label="所选文字字号" onChange={(event) => { if (event.target.value) applyInline("fontSize", event.target.value); event.target.value = ""; }}><option value="">选择</option><option value="2">小</option><option value="3">标准</option><option value="5">大</option><option value="6">特大</option></select></label>
      <button className={`floatingColorTrigger ${colorPanel === "text" ? "open" : ""}`} aria-label="选择所选文字的字色" aria-expanded={colorPanel === "text"} onMouseDown={(event) => event.preventDefault()} onClick={() => setColorPanel((current) => current === "text" ? null : "text")}><span>字色</span><i style={{ backgroundColor: activeInlineColor || "#28312c" }} /><b>⌄</b></button>
      <button className={`floatingColorTrigger ${colorPanel === "highlight" ? "open" : ""}`} aria-label="选择所选文字的标记颜色" aria-expanded={colorPanel === "highlight"} onMouseDown={(event) => event.preventDefault()} onClick={() => setColorPanel((current) => current === "highlight" ? null : "highlight")}><span>标记</span><i className={!activeHighlightColor ? "empty" : ""} style={activeHighlightColor ? { backgroundColor: activeHighlightColor } : undefined} /><b>⌄</b></button>
      <button className="floatingClearFormat" aria-label="清除所选文字格式" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInline("removeFormat")}>清除格式</button>
      {colorPanel && <div className="floatingColorPanel" aria-label={colorPanel === "text" ? "常用字色" : "常用标记颜色"}>
        <div className="floatingColorPanelHead"><strong>{colorPanel === "text" ? "选择字色" : "选择标记颜色"}</strong><span>{colorPanel === "text" ? "只改变所选文字" : "给所选文字添加底色"}</span></div>
        <div className="floatingColorGroups">{(["standard", "muted"] as const).map((group) => <div className="floatingColorGroup" key={group}><span>{group === "standard" ? "常用色" : "柔和色"}</span><div className="floatingColorSwatches">{(colorPanel === "text" ? inlineTextColorOptions : inlineHighlightOptions).filter((option) => option.group === group).map((option) => <button key={option.value} type="button" className={(colorPanel === "text" ? activeInlineColor : activeHighlightColor) === option.value ? "active" : ""} aria-label={option.label} title={option.label} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (colorPanel === "text") { setInlineColor(option.value); setActiveInlineColor(option.value); applyInline("foreColor", option.value); } else { setHighlightColor(option.value); setActiveHighlightColor(option.value); applyInline("hiliteColor", option.value); } setColorPanel(null); }}><i style={{ backgroundColor: option.value }} /></button>)}</div></div>)}</div>
        <div className="floatingColorPanelActions">
          {colorPanel === "text" ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setInlineColor("#28312c"); setActiveInlineColor("#28312c"); applyInline("foreColor", "#28312c"); setColorPanel(null); }}>恢复默认字色</button> : <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setActiveHighlightColor(""); applyInline("hiliteColor", "transparent"); setColorPanel(null); }}>取消标记</button>}
          <label className="customColorControl">更多颜色…<input aria-label={colorPanel === "text" ? "打开详细字色调色盘" : "打开详细标记色调色盘"} type="color" value={colorPanel === "text" ? inlineColor : highlightColor} onChange={(event) => { const value = event.target.value; if (colorPanel === "text") { setInlineColor(value); setActiveInlineColor(value); applyInline("foreColor", value); } else { setHighlightColor(value); setActiveHighlightColor(value); applyInline("hiliteColor", value); } setColorPanel(null); }} /></label>
        </div>
      </div>}
    </div>}
    <details className="wholeBlockTools"><summary>整段样式（作用于整个内容块）</summary><div className="formatToolbar" aria-label="整段文字格式">
      <span>{selected ? `当前：${selected.type === "heading" ? "标题" : selected.type === "text" ? "正文" : selected.type === "checklist" ? "清单" : selected.type === "link" ? "链接名称" : "图片说明"}` : "先点选一个文字块"}</span>
      {selected && <>
        {selected.type === "heading" && <label>级别<select aria-label="标题级别" value={selected.headingLevel ?? 1} onChange={(event) => patch(selected.id, { headingLevel: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">一级</option><option value="2">二级</option><option value="3">三级</option></select></label>}
        <label>字体<select aria-label="整段字体" value={selected.fontFamily ?? "sans"} onChange={(event) => patch(selected.id, { fontFamily: event.target.value as Block["fontFamily"] })}><option value="sans">默认</option><option value="serif">衬线</option><option value="mono">等宽</option></select></label>
        <label>字号<select aria-label="整段字号" value={selected.fontSize ?? (selected.type === "heading" ? "" : "normal")} onChange={(event) => patch(selected.id, { fontSize: (event.target.value || undefined) as Block["fontSize"] })}>{selected.type === "heading" && <option value="">跟随标题</option>}<option value="small">小</option><option value="normal">标准</option><option value="large">大</option><option value="xlarge">特大</option></select></label>
        <button aria-label="整段粗体" aria-pressed={selected.fontWeight === "bold"} onClick={() => patch(selected.id, { fontWeight: selected.fontWeight === "bold" ? "normal" : "bold" })}><b>B</b></button>
        <button aria-label="整段斜体" aria-pressed={selected.fontStyle === "italic"} onClick={() => patch(selected.id, { fontStyle: selected.fontStyle === "italic" ? "normal" : "italic" })}><i>I</i></button>
        <button aria-label="整段下划线" aria-pressed={selected.textDecoration === "underline"} onClick={() => patch(selected.id, { textDecoration: selected.textDecoration === "underline" ? "none" : "underline" })}><u>U</u></button>
        <button aria-label="整段删除线" aria-pressed={selected.textDecoration === "line-through"} onClick={() => patch(selected.id, { textDecoration: selected.textDecoration === "line-through" ? "none" : "line-through" })}><s>S</s></button>
        <div className="formatAlign" aria-label="文字对齐"><button aria-label="左对齐" aria-pressed={(selected.textAlign ?? "left") === "left"} onClick={() => patch(selected.id, { textAlign: "left" })}>≡</button><button aria-label="居中对齐" aria-pressed={selected.textAlign === "center"} onClick={() => patch(selected.id, { textAlign: "center" })}>≣</button><button aria-label="右对齐" aria-pressed={selected.textAlign === "right"} onClick={() => patch(selected.id, { textAlign: "right" })}>≡</button></div>
        <label className="colorControl">字色<input aria-label="整段文字颜色" type="color" value={selected.color ?? "#28312c"} onChange={(event) => patch(selected.id, { color: event.target.value })} /></label>
        <label className="colorControl">底色<input aria-label="整段文字底色" type="color" value={selected.backgroundColor ?? "#ffffff"} onChange={(event) => patch(selected.id, { backgroundColor: event.target.value })} /></label>
        <button aria-label="清除整段格式" onClick={() => patch(selected.id, { color: undefined, backgroundColor: undefined, fontSize: undefined, fontWeight: undefined, fontStyle: undefined, textDecoration: undefined, textAlign: undefined, fontFamily: undefined })}>清除整段格式</button>
      </>}
    </div></details>
    {editorNotice && <p className="editorNotice">{editorNotice}</p>}
    {showToc && <BlockToc blocks={blocks} compact />}
    <div className="blocks" onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) setDraggingEditor(true); }} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingEditor(false); }} onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDraggingEditor(false); addDroppedFiles(Array.from(event.dataTransfer.files)); }}>
      {draggingEditor && <div className="editorDropOverlay">松开即可加入图片或附件</div>}
      {!blocks.length && <div className="editorEmpty"><strong>从这里开始记录</strong><span>点下方＋选择内容，或把图片、PDF、Word、Excel 等资料拖到这里</span></div>}
      {blocks.map((block, index) => <Fragment key={block.id}>
        <BlockInsertPoint index={index} open={insertAt === index} dropActive={blockDropIndex === index} onToggle={() => setInsertAt((current) => current === index ? null : index)} onInsert={(type, headingLevel) => add(type, { headingLevel, at: index })} onDragOver={(event) => markBlockDrop(event, index)} onDrop={(event) => dropBlockAt(event, index)} />
        <div
          id={`content-block-${block.id}`}
          className={`editorBlock ${block.type} ${selectedId === block.id ? "selected" : ""} ${draggingBlockId === block.id ? "reordering" : ""}`}
          onFocusCapture={() => { if (formatBlockTypes.has(block.type)) setSelectedId(block.id); }}
          onDragOver={(event) => { if (!draggingBlockRef.current) return; const rect = event.currentTarget.getBoundingClientRect(); markBlockDrop(event, index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0)); }}
          onDrop={(event) => { if (!draggingBlockRef.current) return; const rect = event.currentTarget.getBoundingClientRect(); dropBlockAt(event, index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0)); }}
        >
          <button type="button" className="dragMark" draggable aria-label="拖动调整内容块顺序" title="按住拖动调整顺序；Alt＋方向键也可移动" onDragStart={(event) => startBlockDrag(event, block.id)} onDragEnd={finishBlockDrag} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); moveBlockBy(block.id, -1); } if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); moveBlockBy(block.id, 1); } }}>⋮⋮</button>
          {block.type === "heading" && <RichTextField block={block} placeholder="标题" ariaLabel={`标题：${block.text || "未命名"}`} multiline={false} onChange={(value) => patch(block.id, value)} onSelection={rememberSelection} />}
          {block.type === "text" && <div className={`richTextBlock ${uploads[`embedded:${block.id}`]?.dragging ? "draggingImage" : ""}`} onDragEnter={(event) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.stopPropagation(); setDraggingEditor(false); setUploads((current) => ({ ...current, [`embedded:${block.id}`]: { ...(current[`embedded:${block.id}`] ?? { progress: 0 }), dragging: true } })); }} onDragOver={(event) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setUploads((current) => ({ ...current, [`embedded:${block.id}`]: { ...(current[`embedded:${block.id}`] ?? { progress: 0 }), dragging: true } })); }} onDragLeave={(event) => { if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; setUploads((current) => ({ ...current, [`embedded:${block.id}`]: { ...(current[`embedded:${block.id}`] ?? { progress: 0 }), dragging: false } })); }} onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); const files = Array.from(event.dataTransfer.files); setDraggingEditor(false); setUploads((current) => ({ ...current, [`embedded:${block.id}`]: { ...(current[`embedded:${block.id}`] ?? { progress: 0 }), dragging: false, error: undefined } })); void uploadEmbeddedAssets(block.id, files); }}>
            <RichTextField block={block} placeholder="输入正文…" ariaLabel="正文内容" multiline onChange={(value) => patch(block.id, value)} onSelection={rememberSelection} />
            {block.embeddedImages?.length ? <div className="embeddedImageGrid">{block.embeddedImages.map((image) => <figure key={image.id}>
              <Image src={fileProxyUrl(image)} alt={image.caption || image.fileName || "内嵌图片"} width={900} height={560} unoptimized />
              <figcaption><input value={image.caption ?? ""} placeholder="添加图片说明" aria-label={`图片说明：${image.fileName}`} onChange={(event) => patch(block.id, { embeddedImages: block.embeddedImages?.map((entry) => entry.id === image.id ? { ...entry, caption: event.target.value } : entry) })} /><a href={fileProxyUrl(image, true)}>下载</a><button type="button" aria-label={`移除内嵌图片：${image.fileName}`} onClick={() => removeEmbeddedImage(block.id, image.id)}>×</button></figcaption>
            </figure>)}</div> : null}
            <AttachmentFileList files={block.embeddedFiles ?? []} onRemove={(fileId) => removeEmbeddedFile(block.id, fileId)} />
            <div className="embeddedImageTools"><label><input type="file" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadEmbeddedAssets(block.id, files); }} />＋ 在这个文字框里插入图片或文件</label><span>也可以直接把图片、PDF、Word、Excel 等资料拖进这个文字框</span></div>
            {uploads[`embedded:${block.id}`]?.progress > 0 && uploads[`embedded:${block.id}`]?.progress < 100 && <div className="uploadProgress"><i style={{ width: `${uploads[`embedded:${block.id}`].progress}%` }} /><span>正在插入资料 {uploads[`embedded:${block.id}`].progress}%</span></div>}
            {uploads[`embedded:${block.id}`]?.error && <p className="uploadError">{uploads[`embedded:${block.id}`].error}</p>}
          </div>}
          {block.type === "checklist" && <><button className={"habitCheck " + (block.checked ? "done" : "")} onClick={() => patch(block.id, { checked: !block.checked })}>{block.checked ? "✓" : ""}</button><RichTextField block={block} placeholder="清单项" ariaLabel="清单内容" multiline={false} onChange={(value) => patch(block.id, value)} onSelection={rememberSelection} /></>}
          {block.type === "link" && <><RichTextField block={block} placeholder="链接名称" ariaLabel="链接名称" multiline={false} onChange={(value) => patch(block.id, value)} onSelection={rememberSelection} /><input value={block.url ?? ""} placeholder="https://" aria-label="链接地址" onChange={(event) => patch(block.id, { url: event.target.value })} /></>}
          {block.type === "image" && <div className="imageBlock">{block.url ? <><Image src={block.url.startsWith("data:") ? block.url : fileProxyUrl(block)} alt={block.text || block.fileName || "内容图片"} width={900} height={520} unoptimized /><div className="assetActions"><span>{block.fileName ? `${block.fileName} · ${formatBytes(block.fileSize)}` : "已保存图片"}</span><a href={block.url.startsWith("data:") ? block.url : fileProxyUrl(block, true)} download={block.fileName}>下载</a><label><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(block.id, file, "image"); }} />替换</label></div></> : <label className={uploads[block.id]?.dragging ? "assetDrop dragging" : "assetDrop"} onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); setUploads((current) => ({ ...current, [block.id]: { ...(current[block.id] ?? { progress: 0 }), dragging: true } })); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); setUploads((current) => ({ ...current, [block.id]: { ...(current[block.id] ?? { progress: 0 }), dragging: false } })); }} onDrop={(event) => uploadDrop(event, block.id, "image")}><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(block.id, file, "image"); }} /><strong>拖入图片，或点击选择</strong><small>独立云端存储 · 单个最大 50 MB</small></label>}{uploads[block.id]?.progress > 0 && uploads[block.id]?.progress < 100 && <div className="uploadProgress"><i style={{ width: `${uploads[block.id].progress}%` }} /><span>正在上传 {uploads[block.id].progress}%</span></div>}{uploads[block.id]?.error && <p className="uploadError">{uploads[block.id].error}</p>}<RichTextField block={block} placeholder="图片说明" ariaLabel="图片说明" multiline={false} onChange={(value) => patch(block.id, value)} onSelection={rememberSelection} /></div>}
          {block.type === "file" && <div className="fileBlock">{block.url ? <><span className="fileIcon">{(block.fileName?.split(".").pop() || "资料").slice(0, 4).toUpperCase()}</span><div className="fileMeta"><strong>{block.fileName || "未命名资料"}</strong><span>{formatBytes(block.fileSize)} · {block.mimeType || "文件"}{block.uploadedAt ? ` · ${new Date(block.uploadedAt).toLocaleDateString("zh-CN")}` : ""}</span></div><div className="fileActions"><a href={fileProxyUrl(block)} target="_blank" rel="noreferrer">打开</a><a href={fileProxyUrl(block, true)}>下载</a><label><input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(block.id, file, "file"); }} />替换</label></div></> : <label className={uploads[block.id]?.dragging ? "assetDrop dragging" : "assetDrop"} onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); setUploads((current) => ({ ...current, [block.id]: { ...(current[block.id] ?? { progress: 0 }), dragging: true } })); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); setUploads((current) => ({ ...current, [block.id]: { ...(current[block.id] ?? { progress: 0 }), dragging: false } })); }} onDrop={(event) => uploadDrop(event, block.id, "file")}><input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(block.id, file, "file"); }} /><strong>拖入资料，或点击选择</strong><small>PDF、文档、表格、压缩包等 · 单个最大 50 MB</small></label>}{uploads[block.id]?.progress > 0 && uploads[block.id]?.progress < 100 && <div className="uploadProgress"><i style={{ width: `${uploads[block.id].progress}%` }} /><span>正在上传 {uploads[block.id].progress}%</span></div>}{uploads[block.id]?.error && <p className="uploadError">{uploads[block.id].error}</p>}</div>}
          {block.type === "table" && <TableBlock rows={block.rows ?? [["项目", "内容"]]} onChange={(rows) => patch(block.id, { rows })} />}
          <div className="blockOrderActions" aria-label="调整内容块顺序"><button type="button" disabled={index === 0} aria-label="上移内容块" onClick={() => moveBlockBy(block.id, -1)}>↑</button><button type="button" disabled={index === blocks.length - 1} aria-label="下移内容块" onClick={() => moveBlockBy(block.id, 1)}>↓</button></div>
          <button type="button" className="blockRemove" aria-label="移除内容块" onClick={() => removeBlock(block.id)}>×</button>
        </div>
      </Fragment>)}
      <BlockInsertPoint index={blocks.length} open={insertAt === blocks.length} dropActive={blockDropIndex === blocks.length} onToggle={() => setInsertAt((current) => current === blocks.length ? null : blocks.length)} onInsert={(type, headingLevel) => add(type, { headingLevel, at: blocks.length })} onDragOver={(event) => markBlockDrop(event, blocks.length)} onDrop={(event) => dropBlockAt(event, blocks.length)} />
    </div>
  </div>;
}

function TableBlock({ rows, onChange }: { rows: string[][]; onChange: (rows: string[][]) => void }) {
  const setCell = (r: number, c: number, value: string) => onChange(rows.map((row, rowIndex) => rowIndex === r ? row.map((cell, cellIndex) => cellIndex === c ? value : cell) : row));
  return <div className="tableBlock">{rows.map((row, r) => <div className="tableBlockRow" key={r}>{row.map((cell, c) => <input key={c} value={cell} onChange={(event) => setCell(r, c, event.target.value)} />)}</div>)}<button onClick={() => onChange([...rows, Array(rows[0]?.length || 2).fill("")])}>＋ 添加一行</button></div>;
}

function DetailLayout({ eyebrow, title, subtitle, back, children }: { eyebrow: string; title: string; subtitle: string; back: () => void; children: React.ReactNode }) { return <div className="page detailPage"><button className="backButton" onClick={back}>← 返回列表</button><PageHead eyebrow={eyebrow} title={title} subtitle={subtitle} />{children}</div>; }
function EditableField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="editField"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }

function FormDialog({ config, onClose }: { config: DialogConfig; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { setValues(Object.fromEntries(config?.fields.map((field) => [field.name, field.value ?? field.options?.[0] ?? ""]) ?? [])); }, [config]);
  if (!config) return null;
  return <div className="dialogScrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="appDialog" onSubmit={(event) => { event.preventDefault(); config.onSubmit(values); onClose(); }}><div className="dialogHead"><div><span>序流</span><h2>{config.title}</h2>{config.description && <p>{config.description}</p>}</div><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>{config.fields.length > 0 && <div className="dialogFields">{config.fields.map((field) => <label key={field.name}><span>{field.label}</span>{field.type === "textarea" ? <textarea value={values[field.name] ?? ""} placeholder={field.placeholder} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /> : field.type === "select" ? <select value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input type={field.type ?? "text"} value={values[field.name] ?? ""} placeholder={field.placeholder} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />}</label>)}</div>}<div className="dialogActions"><button type="button" className="softButton" onClick={onClose}>取消</button><button type="submit" className={config.danger ? "dangerButton" : "primaryButton"}>{config.submitLabel ?? "保存"}</button></div></form></div>;
}

function PagePopup({ popup, onClose, onSnooze }: { popup: PopupState; onClose: () => void; onSnooze: () => void }) {
  if (!popup) return null;
  return <aside className="pagePopup" role="status"><button className="popupClose" aria-label="关闭提醒" onClick={onClose}>×</button><span>{popup.eyebrow}</span><h2>{popup.title}</h2><p>{popup.body}</p><div><button className="primaryButton" onClick={onClose}>完成</button>{popup.reminderId && <button className="softButton" onClick={onSnooze}>5 分钟后</button>}</div></aside>;
}
