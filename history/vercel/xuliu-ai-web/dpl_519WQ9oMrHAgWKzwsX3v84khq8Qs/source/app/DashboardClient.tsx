"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import AiAssistant from "./AiAssistant";
import { aiDisabledReasonForSync, type WorkspaceSyncState } from "@/lib/ai-availability";
import FinanceView from "./FinanceView";
import { ReminderScheduler } from "@/lib/reminder-scheduler";
import { createInitialFinanceState, createPreviewFinanceState, normalizeFinanceState, type FinanceState } from "@/lib/finance";

type NavId = "today" | "timetable" | "tasks" | "calendar" | "review" | "finance" | "school" | "learning" | "thoughts" | "work" | "ideas" | "tools" | "life" | "free";
type Area = "课内" | "课外" | "工作" | "生活" | "思考";
type BlockType = "heading" | "text" | "checklist" | "image" | "table" | "link";
type Block = { id: string; type: BlockType; text?: string; checked?: boolean; url?: string; rows?: string[][] };
type Milestone = { id: string; courseId?: string; title: string; date: string; time: string; location: string; requirements: string; area: Area; done: boolean };
type PageNode = { id: string; space: "thoughts" | "free"; parentId: string | null; title: string; kind: "folder" | "page"; blocks: Block[] };
type CourseSlot = { id: string; weekday: number; start: string; end: string; location: string; weeks?: string; source?: "manual" | "pku" | "bit" | "ics" };
type Course = { id: string; title: string; term: string; teacher: string; location: string; progress: number; requirements: string; schedule: CourseSlot[]; blocks: Block[] };
type AcademicImportPreset = "pku" | "bit";
type ImportedCourse = {
  key: string;
  title: string;
  teacher: string;
  location: string;
  weeks: string;
  schedule: Omit<CourseSlot, "id">[];
};
type LearningArea = { id: string; title: string; category: string; progress: number; goal: string; resources: { id: string; title: string; type: string; url: string; progress: number }[]; blocks: Block[] };
type ResearchPage = { id: string; title: string; blocks: Block[] };
type ResearchProject = { id: string; title: string; status: string; summary: string; objective: string; next: string; progress: number; pages: ResearchPage[]; question?: string; assumption?: string; blocks?: Block[] };
type ToolVersion = { id: string; label: string; url: string; note: string; createdAt: string };
type ToolItem = { id: string; title: string; status: string; description: string; url: string; version: string; currentVersionId?: string; versions?: ToolVersion[]; blocks: Block[] };
type Reminder = { id: string; title: string; type: "exercise" | "break" | "sleep" | "custom"; times: string[]; time?: string; intervalMinutes?: number; enabled: boolean; lastFired?: string; snoozedUntil?: number };
type Habit = { id: string; title: string; streak: number; today: boolean; schedule: string; lastCompletedDate?: string };
type AppState = {
  version: 5;
  tasks: { id: string; title: string; area: Area; source: string; due?: string; done: boolean; today: boolean; elapsed: number }[];
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
  timeEntries: { id: string; taskId: string; minutes: number; date: string; mode: string }[];
  finance: FinanceState;
  themes: Record<string, string>;
};

type DetailTarget = { type: "course" | "learning" | "research" | "tool" | "media" | "recipe"; id: string } | null;
type DialogField = { name: string; label: string; type?: "text" | "textarea" | "date" | "time" | "number" | "select"; value?: string; placeholder?: string; options?: string[] };
type DialogConfig = { title: string; description?: string; submitLabel?: string; fields: DialogField[]; danger?: boolean; onSubmit: (values: Record<string, string>) => void } | null;
type PopupState = { eyebrow: string; title: string; body: string; reminderId?: string } | null;
export type WorkspaceAccount = { id: "owner" | "partner" | "lxs" | "raychen"; username: string; displayName: string };

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
const starterBlocks = (title: string): Block[] => [
  { id: uid(), type: "heading", text: title },
  { id: uid(), type: "text", text: "从这里开始记录。你可以继续加入标题、清单、链接、表格或图片。" },
];
const starterResearchPages = (blocks?: Block[]): ResearchPage[] => [
  { id: uid(), title: "研究总览", blocks: blocks?.length ? blocks : starterBlocks("研究总览") },
  { id: uid(), title: "资料与线索", blocks: starterBlocks("资料与线索") },
  { id: uid(), title: "阶段结论", blocks: starterBlocks("阶段结论") },
];

const importWeekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const weekdayPattern = /(?:星期|周)\s*([一二三四五六日天1-7])/;
const timePattern = /(\d{1,2})[:：](\d{2})\s*(?:-|—|–|~|～|至)\s*(\d{1,2})[:：](\d{2})/;
const headerAliases = {
  title: ["课程名称", "课程名", "教学班名称", "课程", "subject", "summary"],
  teacher: ["任课教师", "授课教师", "教师", "老师", "teacher"],
  weekday: ["星期", "周几", "上课星期", "上课日期", "day", "weekday"],
  time: ["上课时间", "时间", "节次", "上课节次", "课程时间", "time"],
  location: ["上课地点", "上课教室", "教室", "地点", "校区地点", "location"],
  weeks: ["上课周次", "周次", "教学周", "weeks"],
};

const presetPeriodTimes: Record<AcademicImportPreset, Record<number, [string, string]>> = {
  pku: {
    1: ["08:00", "08:50"], 2: ["09:00", "09:50"], 3: ["10:10", "11:00"], 4: ["11:10", "12:00"],
    5: ["13:00", "13:50"], 6: ["14:00", "14:50"], 7: ["15:10", "16:00"], 8: ["16:10", "17:00"],
    9: ["17:10", "18:00"], 10: ["18:40", "19:30"], 11: ["19:40", "20:30"], 12: ["20:40", "21:30"],
  },
  bit: {
    1: ["08:00", "08:45"], 2: ["08:50", "09:35"], 3: ["09:55", "10:40"], 4: ["10:45", "11:30"],
    5: ["11:35", "12:20"], 6: ["13:20", "14:05"], 7: ["14:10", "14:55"], 8: ["15:15", "16:00"],
    9: ["16:05", "16:50"], 10: ["16:55", "17:40"], 11: ["18:30", "19:15"], 12: ["19:20", "20:05"],
    13: ["20:10", "20:55"],
  },
};

const cleanImportCell = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();

function importWeekday(value: string) {
  const match = cleanImportCell(value).match(weekdayPattern);
  if (!match) return 0;
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return map[match[1]] ?? Number(match[1]) ?? 0;
}

function importTimeRange(value: string, preset: AcademicImportPreset): [string, string] | null {
  const normalized = cleanImportCell(value);
  const explicit = normalized.match(timePattern);
  if (explicit) {
    return [`${explicit[1].padStart(2, "0")}:${explicit[2]}`, `${explicit[3].padStart(2, "0")}:${explicit[4]}`];
  }
  const period = normalized.match(/(?:第\s*)?(\d{1,2})\s*(?:-|—|–|~|～|至|,|，)?\s*(\d{1,2})?\s*节/);
  if (!period) return null;
  const first = Number(period[1]);
  const last = Number(period[2] || period[1]);
  const start = presetPeriodTimes[preset][first]?.[0];
  const end = presetPeriodTimes[preset][last]?.[1];
  return start && end ? [start, end] : null;
}

function importColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.some((alias) => header.toLowerCase() === alias.toLowerCase() || header.includes(alias)));
}

function courseCellParts(value: string) {
  const lines = value.split(/\r?\n|\s{2,}|\|/).map(cleanImportCell).filter(Boolean);
  const title = lines.find((line) => !/(教师|老师|地点|教室|校区|周次|教学周|星期|第\s*\d+\s*节)/.test(line)) ?? lines[0] ?? "";
  const teacher = lines.find((line) => /(教师|老师|任课)/.test(line))?.replace(/^.*?(?:教师|老师|任课)[:：]?\s*/, "") ?? "";
  const location = lines.find((line) => /(地点|教室|校区|楼|室)/.test(line) && line !== title)?.replace(/^.*?(?:地点|教室)[:：]?\s*/, "") ?? "";
  const weeks = lines.find((line) => /(?:周次|教学周|\d+\s*[-—~至]\s*\d+\s*周)/.test(line))?.replace(/^.*?(?:周次|教学周)[:：]?\s*/, "") ?? "";
  return { title, teacher, location, weeks };
}

function groupImportedCourses(rows: Array<Omit<ImportedCourse, "key" | "schedule"> & { slot: Omit<CourseSlot, "id"> }>) {
  const grouped = new Map<string, ImportedCourse>();
  for (const row of rows) {
    const title = cleanImportCell(row.title);
    if (!title) continue;
    const key = `${title.toLowerCase()}::${cleanImportCell(row.teacher).toLowerCase()}`;
    const current = grouped.get(key) ?? { key, title, teacher: row.teacher, location: row.location, weeks: row.weeks, schedule: [] };
    if (!current.teacher && row.teacher) current.teacher = row.teacher;
    if (!current.location && row.location) current.location = row.location;
    if (!current.weeks && row.weeks) current.weeks = row.weeks;
    const duplicate = current.schedule.some((slot) => slot.weekday === row.slot.weekday && slot.start === row.slot.start && slot.end === row.slot.end && slot.location === row.slot.location);
    if (!duplicate) current.schedule.push(row.slot);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function parseAcademicRows(rawRows: unknown[][], preset: AcademicImportPreset) {
  const rows = rawRows.map((row) => row.map(cleanImportCell));
  const weekdayHeaderIndex = rows.findIndex((row) => row.filter((cell) => importWeekday(cell) > 0).length >= 2);
  const importedRows: Array<Omit<ImportedCourse, "key" | "schedule"> & { slot: Omit<CourseSlot, "id"> }> = [];

  if (weekdayHeaderIndex >= 0) {
    const header = rows[weekdayHeaderIndex];
    const dayColumns = header.map((cell, index) => ({ index, weekday: importWeekday(cell) })).filter((item) => item.weekday > 0);
    for (const row of rows.slice(weekdayHeaderIndex + 1)) {
      const rowLabel = row.slice(0, Math.max(1, dayColumns[0]?.index ?? 1)).join(" ");
      const rowTime = importTimeRange(rowLabel, preset);
      if (!rowTime) continue;
      for (const day of dayColumns) {
        const cell = cleanImportCell(row[day.index]);
        if (!cell || /^(无|暂无|--|-)$/.test(cell)) continue;
        const parts = courseCellParts(cell);
        if (!parts.title) continue;
        importedRows.push({
          ...parts,
          slot: { weekday: day.weekday, start: rowTime[0], end: rowTime[1], location: parts.location, weeks: parts.weeks, source: preset },
        });
      }
    }
  }

  const headerIndex = rows.findIndex((row) => row.some((cell) => headerAliases.title.some((alias) => cell.includes(alias))) && row.some((cell) => [...headerAliases.weekday, ...headerAliases.time].some((alias) => cell.includes(alias))));
  if (headerIndex >= 0) {
    const headers = rows[headerIndex];
    const indexes = {
      title: importColumn(headers, headerAliases.title), teacher: importColumn(headers, headerAliases.teacher),
      weekday: importColumn(headers, headerAliases.weekday), time: importColumn(headers, headerAliases.time),
      location: importColumn(headers, headerAliases.location), weeks: importColumn(headers, headerAliases.weeks),
    };
    for (const row of rows.slice(headerIndex + 1)) {
      const title = cleanImportCell(row[indexes.title]);
      if (!title) continue;
      const teacher = indexes.teacher >= 0 ? cleanImportCell(row[indexes.teacher]) : "";
      const location = indexes.location >= 0 ? cleanImportCell(row[indexes.location]) : "";
      const weeks = indexes.weeks >= 0 ? cleanImportCell(row[indexes.weeks]) : "";
      const scheduleText = [indexes.weekday >= 0 ? row[indexes.weekday] : "", indexes.time >= 0 ? row[indexes.time] : "", ...row].join(" ");
      const weekdayMatches = [...scheduleText.matchAll(new RegExp(weekdayPattern.source, "g"))];
      const scheduleParts = weekdayMatches.length ? weekdayMatches.map((match, index) => scheduleText.slice(match.index, weekdayMatches[index + 1]?.index ?? scheduleText.length)) : [scheduleText];
      for (const part of scheduleParts) {
        const weekday = importWeekday(part);
        const range = importTimeRange(part, preset);
        if (!weekday || !range) continue;
        importedRows.push({ title, teacher, location, weeks, slot: { weekday, start: range[0], end: range[1], location, weeks, source: preset } });
      }
    }
  }
  return groupImportedCourses(importedRows);
}

function decodeIcsValue(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function parseAcademicIcs(text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.split("BEGIN:VEVENT").slice(1).map((chunk) => chunk.split("END:VEVENT")[0]);
  const rows: Array<Omit<ImportedCourse, "key" | "schedule"> & { slot: Omit<CourseSlot, "id"> }> = [];
  for (const event of events) {
    const value = (name: string) => decodeIcsValue(event.match(new RegExp(`(?:^|\\n)${name}(?:;[^:]*)?:(.*)`, "i"))?.[1] ?? "");
    const title = value("SUMMARY");
    const location = value("LOCATION");
    const description = value("DESCRIPTION");
    const startText = event.match(/(?:^|\n)DTSTART(?:;[^:]*)?:(\d{8})T(\d{2})(\d{2})/i);
    const endText = event.match(/(?:^|\n)DTEND(?:;[^:]*)?:(\d{8})T(\d{2})(\d{2})/i);
    if (!title || !startText || !endText) continue;
    const rruleDay = event.match(/BYDAY=(MO|TU|WE|TH|FR|SA|SU)/i)?.[1]?.toUpperCase();
    const dayMap: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
    const date = new Date(`${startText[1].slice(0, 4)}-${startText[1].slice(4, 6)}-${startText[1].slice(6, 8)}T12:00:00`);
    const nativeDay = date.getDay();
    const weekday = rruleDay ? dayMap[rruleDay] : nativeDay === 0 ? 7 : nativeDay;
    const teacher = description.match(/(?:教师|老师|任课教师)[:：]\s*([^,;，；]+)/)?.[1]?.trim() ?? "";
    const weeks = description.match(/(?:周次|教学周)[:：]\s*([^,;，；]+)/)?.[1]?.trim() ?? "";
    rows.push({
      title, teacher, location, weeks,
      slot: { weekday, start: `${startText[2]}:${startText[3]}`, end: `${endText[2]}:${endText[3]}`, location, weeks, source: "ics" },
    });
  }
  return groupImportedCourses(rows);
}

async function parseAcademicFile(file: File, preset: AcademicImportPreset) {
  if (/\.ics$/i.test(file.name) || file.type === "text/calendar") return parseAcademicIcs(await file.text());
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
  const flattened = parsed.flatMap((course) => course.schedule.map((slot) => ({ title: course.title, teacher: course.teacher, location: course.location, weeks: course.weeks, slot })));
  return groupImportedCourses(flattened);
}

function parseDelimitedRows(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", "\t", ";"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const initialState: AppState = {
  version: 5,
  tasks: [],
  milestones: [],
  courses: [],
  learning: [],
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
  themes: { today: "#718c7c", timetable: "#6d8291", tasks: "#7b846d", calendar: "#6f8295", review: "#8c7a91", finance: "#6f7f72", school: "#657f91", learning: "#80769a", thoughts: "#668476", work: "#8b7658", ideas: "#8a6f7d", tools: "#617f78", life: "#8b706d", free: "#738287" },
};

const navItems: { id: NavId; icon: string; label: string }[] = [
  { id: "today", icon: "今", label: "今日" }, { id: "timetable", icon: "课", label: "课程表" }, { id: "tasks", icon: "览", label: "任务总览" }, { id: "calendar", icon: "历", label: "日历" }, { id: "review", icon: "复", label: "每日复盘" },
  { id: "finance", icon: "账", label: "个人记账" }, { id: "school", icon: "课", label: "课内学习" }, { id: "learning", icon: "学", label: "课外学习" }, { id: "thoughts", icon: "思", label: "思考集" },
  { id: "work", icon: "研", label: "工作研究" }, { id: "ideas", icon: "灵", label: "灵感" }, { id: "tools", icon: "具", label: "工具集" },
  { id: "life", icon: "生", label: "生活管理" }, { id: "free", icon: "＋", label: "自由空间" },
];
const areaClass: Record<Area, string> = { 课内: "study", 课外: "outside", 工作: "work", 生活: "life", 思考: "thought" };
const toneChoices = ["#718c7c", "#657f91", "#80769a", "#8b7658", "#8a6f7d", "#738287"];
const formatMinutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function hydrateState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") return initialState;
  const saved = raw as Partial<AppState> & { resources?: { id: string; title: string; type: string; progress: number; url?: string; note?: string }[] };
  const courses = Array.isArray(saved.courses) ? saved.courses.map((item) => ({
    id: item.id ?? uid(), title: item.title ?? "", term: item.term ?? "", teacher: item.teacher ?? "", location: item.location ?? "",
    progress: item.progress ?? 0, requirements: item.requirements ?? "", schedule: item.schedule ?? [], blocks: item.blocks ?? starterBlocks("课程资料与笔记"),
  })) : [];
  const learning = Array.isArray(saved.learning) ? saved.learning.map((item) => ({ ...item, resources: item.resources ?? [], blocks: item.blocks ?? starterBlocks("学习路线与笔记") })) : saved.resources?.map((item) => ({ id: item.id, title: item.title, category: item.type, progress: item.progress, goal: item.note ?? "", resources: [{ id: uid(), title: item.title, type: item.type, url: item.url ?? "", progress: item.progress }], blocks: starterBlocks("学习路线与笔记") })) ?? [];
  return {
    ...initialState, ...saved, version: 5, courses, learning,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    milestones: Array.isArray(saved.milestones) ? saved.milestones : [],
    research: Array.isArray(saved.research) ? saved.research.map((item) => ({
      id: item.id ?? uid(), title: item.title ?? "", status: item.status ?? "收集箱", summary: item.summary ?? "",
      objective: item.objective ?? item.question ?? "", next: item.next ?? "", progress: item.progress ?? 0,
      pages: item.pages?.length ? item.pages : starterResearchPages(item.blocks), blocks: undefined,
    })) : [],
    ideas: Array.isArray(saved.ideas) ? saved.ideas : [],
    tools: Array.isArray(saved.tools) ? saved.tools.map((item) => ({
      id: item.id ?? uid(), title: item.title ?? "", status: item.status ?? "想法", description: item.description ?? "",
      url: item.url ?? "", version: item.version ?? "构思", currentVersionId: item.currentVersionId,
      versions: item.versions, blocks: item.blocks ?? starterBlocks("产品说明与迭代记录"),
    })) : [],
    habits: Array.isArray(saved.habits) ? saved.habits.map((item) => normalizedHabit(item)) : [],
    routines: Array.isArray(saved.routines) ? saved.routines : [],
    reminders: Array.isArray(saved.reminders) ? saved.reminders.map((item) => normalizedReminder({ ...item, times: Array.isArray(item.times) ? item.times : [] })) : [],
    media: Array.isArray(saved.media) ? saved.media.map((item) => ({ ...item, status: item.status ?? "正在看", kind: item.kind ?? "书籍", blocks: item.blocks ?? starterBlocks("记录") })) : [],
    recipes: Array.isArray(saved.recipes) ? saved.recipes.map((item) => ({ ...item, blocks: item.blocks ?? starterBlocks("步骤与调整") })) : [],
    pages: Array.isArray(saved.pages) ? saved.pages.map((item) => ({ ...item, space: item.space ?? (item.id.startsWith("f2") || item.id.startsWith("p2") ? "free" : "thoughts"), blocks: item.blocks ?? [] })) : [],
    daily: saved.daily && typeof saved.daily === "object" ? saved.daily : {},
    timeEntries: Array.isArray(saved.timeEntries) ? saved.timeEntries : [],
    finance: normalizeFinanceState(saved.finance),
    themes: { ...initialState.themes, ...(saved.themes ?? {}) },
  };
}

function clientNormalizationChanged(raw: unknown, hydrated: AppState) {
  if (!raw || typeof raw !== "object") return false;
  const saved = raw as Partial<AppState>;
  return JSON.stringify(Array.isArray(saved.habits) ? saved.habits : []) !== JSON.stringify(hydrated.habits)
    || JSON.stringify(Array.isArray(saved.reminders) ? saved.reminders : []) !== JSON.stringify(hydrated.reminders);
}

export default function DashboardClient({ account, visibleAccounts, onLogout, deploymentVersion, preview = false }: { account: WorkspaceAccount; visibleAccounts: WorkspaceAccount[]; onLogout: () => void; deploymentVersion: string; preview?: boolean }) {
  const [active, setActive] = useState<NavId>(preview ? "finance" : "today");
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [workspaceOwner, setWorkspaceOwner] = useState(account.id);
  const [data, setStoredData] = useState<AppState>(() => preview ? { ...initialState, finance: createPreviewFinanceState() } : initialState);
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
  const [timer, setTimer] = useState({ mode: "pomodoro" as "pomodoro" | "stopwatch", seconds: 1500, running: false, targetId: "" });
  const reminderSchedulerRef = useRef(new ReminderScheduler());
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
      setStoredData({ ...initialState, finance: createPreviewFinanceState() });
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
  }, [workspaceOwner, account.id, onLogout, preview]);
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
    if (!timer.running) return;
    const handle = window.setInterval(() => setTimer((current) => {
      const next = current.mode === "pomodoro" ? current.seconds - 1 : current.seconds + 1;
      if (current.mode === "pomodoro" && next <= 0) return { ...current, seconds: 0, running: false };
      return { ...current, seconds: next };
    }), 1000);
    return () => window.clearInterval(handle);
  }, [timer.running]);
  useEffect(() => {
    if (timer.mode === "pomodoro" && timer.seconds === 0 && !timer.running) {
      setPopup((current) => current ?? { eyebrow: "专注完成", title: "这一轮已经完成", body: "先给自己一点正向反馈，再决定继续还是休息。" });
    }
  }, [timer.mode, timer.seconds, timer.running]);
  useEffect(() => {
    const scheduler = reminderSchedulerRef.current;
    if (!loaded || readOnly || loadedWorkspaceRef.current !== account.id) { scheduler.reset(); return; }
    const check = () => {
      const now = Date.now();
      scheduler.check(data.reminders, now);
      if (popup?.reminderId && !data.reminders.some((item) => item.id === popup.reminderId && item.enabled)) {
        setPopup(null);
      }
      if (document.visibilityState === "hidden" || popupRef.current || dialog) return;
      const due = scheduler.takeNext(data.reminders, now);
      const reminder = due && data.reminders.find((item) => item.id === due.id);
      if (!due || !reminder) return;
      setPopup({
        reminderId: reminder.id,
        eyebrow: reminder.type === "break" ? "休息提醒" : reminder.type === "sleep" ? "睡眠提醒" : reminder.type === "exercise" ? "运动提醒" : "生活提醒",
        title: reminder.title,
        body: due.reason === "interval"
          ? `已经过了 ${reminder.intervalMinutes ?? 20} 分钟，看看远处、活动一下吧。完成或关闭后会重新计时，也可以延迟 5 分钟。`
          : "这是页面内提醒，不会发出闹钟声。你可以完成、延迟 5 分钟或直接关闭。",
      });
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
  }, [account.id, data.reminders, loaded, readOnly, workspaceOwner, popup, dialog, setData, setPopup]);
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

  const navigate = (id: NavId) => { setActive(id); setDetail(null); setMobileNav(false); };
  const theme = data.themes[active] ?? toneChoices[0];
  const daily = data.daily[today] ?? { note: "", gain: "", problem: "", feeling: "", tomorrow: "" };
  const todayTasks = data.tasks.filter((task) => task.due === today || (!task.due && task.today));
  const updateDaily = (field: keyof typeof daily, value: string) => setData((current) => ({ ...current, daily: { ...current.daily, [today]: { ...(current.daily[today] ?? daily), [field]: value } } }));
  const deleteDialog = (title: string, onDelete: () => void) => setDialog({ title: `移除“${title}”？`, description: "内容会从当前账号的云端空间中移除。", submitLabel: "确认移除", danger: true, fields: [], onSubmit: onDelete });
  const finishFocus = () => { const seconds = timer.mode === "pomodoro" ? 1500 - timer.seconds : timer.seconds; const minutes = Math.max(1, Math.round(seconds / 60)); setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === timer.targetId ? { ...task, elapsed: task.elapsed + minutes } : task), timeEntries: [...current.timeEntries, { id: uid(), taskId: timer.targetId, minutes, date: today, mode: timer.mode }] })); setTimer((current) => ({ ...current, running: false, seconds: current.mode === "pomodoro" ? 1500 : 0 })); };
  const addManualTime = () => setDialog({ title: "补记专注时间", description: "记录到当前选择的任务。", submitLabel: "记入时间", fields: [{ name: "minutes", label: "分钟数", type: "number", value: "30" }], onSubmit: ({ minutes }) => { const value = Math.max(1, Math.round(Number(minutes) || 0)); setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === timer.targetId ? { ...task, elapsed: task.elapsed + value } : task), timeEntries: [...current.timeEntries, { id: uid(), taskId: timer.targetId, minutes: value, date: today, mode: "manual" }] })); } });
  const exportData = () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `序流备份-${today}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const reloadForUpdate = () => {
    if (sync === "saving") return;
    if (sync === "error" && !window.confirm("云端同步异常，刷新可能丢失尚未保存的编辑。建议先导出数据备份。仍要刷新吗？")) return;
    window.location.reload();
  };

  return <div className="shell" style={{ "--accent": theme } as React.CSSProperties}>
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}><button className="brand" onClick={() => navigate("today")}><span className="brandMark">序</span><span>序流</span></button><div className="workspaceSwitcher"><span>当前空间</span><button className={!readOnly ? "active" : ""} onClick={() => { setWorkspaceOwner(account.id); setDetail(null); }}><i>{account.displayName.slice(0, 1)}</i><b>{account.displayName}</b><small>我的</small></button>{visibleAccounts.map((visible) => <button key={visible.id} className={workspaceOwner === visible.id ? "active" : ""} onClick={() => { setWorkspaceOwner(visible.id); setDetail(null); }}><i>{visible.displayName.slice(0, 1)}</i><b>{visible.displayName}</b><small>只读</small></button>)}</div><div className="navGroup">{navItems.slice(0, 5).map((item) => <NavButton key={item.id} {...item} active={active} onClick={navigate} />)}</div><div className="navCaption">我的空间</div><div className="navGroup">{navItems.slice(5).map((item) => <NavButton key={item.id} {...item} active={active} onClick={navigate} />)}</div><button className="exportButton" onClick={exportData}>导出数据备份</button><a className="changelogLink" href="/changelog" target="_blank" rel="noreferrer">更新日志 ↗</a>{!preview && <button className="logoutButton" onClick={onLogout}>退出登录</button>}<div className="sidebarFoot"><span className={`syncDot ${sync}`} />{sync === "saving" ? "正在保存" : sync === "readonly" ? "正在查看只读空间" : sync === "error" ? "云端连接异常" : sync === "preview" ? "本地预览 · 不会写入云端" : "已保存到云端"}</div></aside>
    <main className="main"><header className="mobileHeader"><button className="iconButton" onClick={() => setMobileNav(true)}>☰</button><strong>序流</strong><span className={`syncDot ${sync}`} /></header>{updateAvailable && <div className="updateBanner"><span>网站已有新版本，为避免继续使用旧页面，请先刷新。</span><button disabled={sync === "saving"} onClick={reloadForUpdate}>{sync === "saving" ? "等待保存" : "立即刷新"}</button></div>}{readOnly && <div className="readOnlyBanner">正在查看 <strong>{visibleAccount.displayName}</strong> 的空间 · 只读</div>}{!loaded ? <div className="workspaceLoading">正在载入空间…</div> : <>{!detail && <ThemePicker color={theme} onChange={(color) => setData((current) => ({ ...current, themes: { ...current.themes, [active]: color } }))} />}{detail ? <DetailRouter target={detail} data={data} setData={setData} back={() => setDetail(null)} setDialog={setDialog} deleteDialog={deleteDialog} /> : <>
      {active === "today" && <TodayView data={data} setData={setData} tasks={todayTasks} milestones={data.milestones.filter((item) => item.date === today)} totalMinutes={data.timeEntries.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.minutes, 0)} daily={daily} updateDaily={updateDaily} timer={timer} setTimer={setTimer} finishFocus={finishFocus} addManualTime={addManualTime} setPopup={setPopup} />}
      {active === "timetable" && <TimetableViewV2 data={data} setData={setData} setDialog={setDialog} openCourse={(id) => setDetail({ type: "course", id })} deleteDialog={deleteDialog} />}
      {active === "tasks" && <TaskOverviewView data={data} setData={setData} setDialog={setDialog} />}
      {active === "calendar" && <CalendarView data={data} setData={setData} setDialog={setDialog} />}
      {active === "review" && <ReviewView data={data} setData={setData} />}
      {active === "finance" && <FinanceView finance={data.finance} readOnly={readOnly} projectOptions={[...data.courses.map((item) => item.title), ...data.learning.map((item) => item.title), ...data.research.map((item) => item.title), ...data.tools.map((item) => item.title)]} onChange={(updater) => setData((current) => ({ ...current, finance: updater(current.finance) }))} />}
      {active === "school" && <SchoolView data={data} setData={setData} openDetail={(id) => setDetail({ type: "course", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "learning" && <LearningView data={data} setData={setData} openDetail={(id) => setDetail({ type: "learning", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {(active === "thoughts" || active === "free") && <NotesView space={active} data={data} setData={setData} selectedPage={selectedPage} setSelectedPage={setSelectedPage} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "work" && <WorkView data={data} setData={setData} openDetail={(id) => setDetail({ type: "research", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "ideas" && <IdeasView data={data} setData={setData} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "tools" && <ToolsView data={data} setData={setData} openDetail={(id) => setDetail({ type: "tool", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "life" && <LifeViewV2 data={data} setData={setData} openDetail={setDetail} setDialog={setDialog} deleteDialog={deleteDialog} setPopup={setPopup} />}
    </>}</>}</main>
    <AiAssistant accountName={account.displayName} activeWorkspaceOwner={workspaceOwner} activeWorkspaceName={visibleAccount.displayName} disabledReason={updateAvailable ? "网站已有新版本，请刷新页面后再使用 AI。" : aiDisabledReasonForSync(preview, sync)} onApplied={refreshAfterAi} />
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

function TodayView({ data, setData, tasks, milestones, totalMinutes, daily, updateDaily, timer, setTimer, finishFocus, addManualTime, setPopup }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; tasks: AppState["tasks"]; milestones: Milestone[]; totalMinutes: number; daily: AppState["daily"][string]; updateDaily: (field: keyof AppState["daily"][string], value: string) => void; timer: { mode: "pomodoro" | "stopwatch"; seconds: number; running: boolean; targetId: string }; setTimer: React.Dispatch<React.SetStateAction<{ mode: "pomodoro" | "stopwatch"; seconds: number; running: boolean; targetId: string }>>; finishFocus: () => void; addManualTime: () => void; setPopup: (value: PopupState) => void }) {
  const [quick, setQuick] = useState(""); const addTask = () => { if (!quick.trim()) return; setData((current) => ({ ...current, tasks: [...current.tasks, { id: uid(), title: quick.trim(), area: "思考", source: "临时任务", due: today, done: false, today: true, elapsed: 0 }] })); setQuick(""); }; const switchMode = (mode: "pomodoro" | "stopwatch") => setTimer((current) => ({ ...current, mode, running: false, seconds: mode === "pomodoro" ? 1500 : 0 }));
  useEffect(() => {
    if (tasks.some((task) => task.id === timer.targetId)) return;
    setTimer((current) => ({ ...current, targetId: tasks[0]?.id ?? "", running: tasks.length ? current.running : false }));
  }, [setTimer, tasks, timer.targetId]);
  return <div className="page"><PageHead eyebrow={`${new Date().getMonth() + 1}月${new Date().getDate()}日 · ${new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())}`} title="今天，把重要的事接起来。" subtitle={`${tasks.filter((task) => !task.done).length} 项待完成 · 今日已专注 ${formatMinutes(totalMinutes)}`} action={<SyncChip />} /><div className="todayGrid"><div className="stack"><section className="panel taskPanel"><PanelTitle title="今日任务" subtitle="从任务总览中自动筛选截止到今天的事项" meta={`${tasks.filter((task) => task.done).length} / ${tasks.length}`} /><div className="taskList">{tasks.map((task) => <div key={task.id} className={`taskRow ${task.done ? "done" : ""}`}><button className="checkButton" aria-label={task.done ? "标记未完成" : "标记完成"} onClick={() => setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) }))}>{task.done ? "✓" : ""}</button><div className="taskBody"><strong>{task.title}</strong><span>{task.source} · 已投入 {task.elapsed} 分钟</span></div><span className={`areaTag ${areaClass[task.area]}`}>{task.area}</span></div>)}{!tasks.length && <div className="emptyState compact"><h2>今天还没有任务</h2><p>去任务总览设置日期，或在下面临时添加。</p></div>}</div><div className="quickAdd"><input value={quick} placeholder="添加一个临时任务…" onChange={(event) => setQuick(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTask(); }} /><button onClick={addTask}>添加</button></div></section><section className="panel notePanel"><PanelTitle title="今日随记" subtitle="收获、问题或突然出现的想法" meta="自动保存" /><textarea value={daily.note} onChange={(event) => updateDaily("note", event.target.value)} placeholder="此刻有什么值得记下来？" /></section></div><div className="stack"><section className="panel focusPanel"><div className="modeSwitch"><button className={timer.mode === "pomodoro" ? "active" : ""} onClick={() => switchMode("pomodoro")}>番茄钟</button><button className={timer.mode === "stopwatch" ? "active" : ""} onClick={() => switchMode("stopwatch")}>正向计时</button></div><div className="timerValue">{formatClock(timer.seconds)}</div><select value={timer.targetId} disabled={!tasks.length} onChange={(event) => setTimer((current) => ({ ...current, targetId: event.target.value }))}>{!tasks.length && <option value="">请先添加今日任务</option>}{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><div className="timerActions"><button className="primaryButton" disabled={!timer.targetId} onClick={() => setTimer((current) => ({ ...current, running: !current.running }))}>{timer.running ? "暂停" : "开始专注"}</button><button className="softButton" disabled={!timer.targetId} onClick={finishFocus}>完成</button><button className="softButton" disabled={!timer.targetId} onClick={addManualTime}>补记</button></div><button className="notificationLink" onClick={() => setPopup({ eyebrow: "休息提醒", title: "自动休息提醒", body: "在生活 → 习惯提醒中启用“休息（间隔提醒）”后，打开网页就会自动计时，不需要开始专注。" })}>预览休息提醒</button></section><div className="miniStats"><div><strong>{formatMinutes(totalMinutes)}</strong><span>今日专注</span></div><div><strong>{tasks.filter((task) => task.done).length}</strong><span>完成任务</span></div><div><strong>{Math.round(data.habits.filter((habit) => habit.today).length / Math.max(1, data.habits.length) * 100)}%</strong><span>习惯完成</span></div></div><section className="panel reminderPanel"><PanelTitle title="生活提醒" subtitle="一个项目可设置多个时间" /><div className="reminderList">{data.reminders.map((reminder) => <div className="reminderRow" key={reminder.id}><span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : reminder.type === "exercise" ? "动" : "提"}</span><div><strong>{reminder.title}</strong><span>{[...(reminder.type === "break" ? [`每 ${reminder.intervalMinutes ?? 20} 分钟 · 自动计时`] : []), ...reminder.times].join(" / ")} · {reminder.enabled ? "等待提醒" : "已关闭"}</span></div><button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: "你可以完成、延迟 5 分钟或关闭这条页面提示。" })}>预览</button></div>)}</div></section></div></div></div>;
}

function TimetableViewV2({ data, setData, setDialog, openCourse, deleteDialog }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; openCourse: (id: string) => void; deleteDialog: (title: string, onDelete: () => void) => void }) {
  const [importOpen, setImportOpen] = useState(false);
  const [preset, setPreset] = useState<AcademicImportPreset>("pku");
  const [imported, setImported] = useState<ImportedCourse[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const term = `${new Date().getFullYear()} ${new Date().getMonth() >= 7 ? "秋季" : "春季"}`;
  const weekdays = importWeekdays;

  const addSlot = () => setDialog({
    title: "添加课程时间",
    description: "同一门课程可以添加多个上课时间。",
    submitLabel: "加入课程表",
    fields: [
      { name: "course", label: "课程", type: "select", options: data.courses.map((course) => course.title) },
      { name: "weekday", label: "星期", type: "select", options: weekdays },
      { name: "start", label: "开始时间", type: "time", value: "08:00" },
      { name: "end", label: "结束时间", type: "time", value: "09:40" },
      { name: "location", label: "地点" },
    ],
    onSubmit: (values) => setData((current) => ({
      ...current,
      courses: current.courses.map((course) => course.title === values.course ? {
        ...course,
        schedule: [...course.schedule, { id: uid(), weekday: Math.max(1, weekdays.indexOf(values.weekday) + 1), start: values.start, end: values.end, location: values.location || course.location, source: "manual" }],
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
    if (!imported.length) return;
    setData((current) => {
      const courses = [...current.courses];
      for (const draft of imported) {
        const existingIndex = courses.findIndex((course) => course.title.trim().toLowerCase() === draft.title.trim().toLowerCase());
        const slots = draft.schedule.map((slot) => ({ ...slot, id: uid() }));
        if (existingIndex < 0) {
          courses.push({
            id: uid(), title: draft.title || "未命名课程", term, teacher: draft.teacher, location: draft.location,
            progress: 0, requirements: draft.weeks ? `上课周次：${draft.weeks}` : "", schedule: slots, blocks: starterBlocks("课程资料与笔记"),
          });
          continue;
        }
        const existing = courses[existingIndex];
        const mergedSlots = [...existing.schedule];
        for (const slot of slots) {
          if (!mergedSlots.some((item) => item.weekday === slot.weekday && item.start === slot.start && item.end === slot.end && item.location === slot.location)) mergedSlots.push(slot);
        }
        courses[existingIndex] = {
          ...existing,
          teacher: existing.teacher || draft.teacher,
          location: existing.location || draft.location,
          requirements: existing.requirements || (draft.weeks ? `上课周次：${draft.weeks}` : ""),
          schedule: mergedSlots,
        };
      }
      return { ...current, courses };
    });
    setImportMessage(`已安全合并 ${imported.length} 门课程；重复的课程与时间没有再次添加。`);
    setImported([]);
  };

  return <div className="page timetablePage">
    <PageHead
      eyebrow="本学期 · 每周节奏"
      title="课程表"
      subtitle="支持北京大学、北京理工大学教务课表导入；考试、作业与重要节点仍进入日历和任务总览"
      action={<div className="pageHeadActions"><button className="softButton" onClick={() => setImportOpen((value) => !value)}>{importOpen ? "收起教务导入" : "⇧ 教务导入"}</button><button className="primaryButton" disabled={!data.courses.length} title={data.courses.length ? "添加课程时间" : "请先在课内学习中新建课程，或通过教务导入创建课程"} onClick={addSlot}>＋ 添加课程时间</button></div>}
    />

    {importOpen ? <section className="panel academicImportPanel" aria-label="教务课表导入">
      <div className="academicImportHead">
        <div><span className="cardKicker">ACADEMIC IMPORT</span><h2>从教务系统导入</h2><p>文件只在当前浏览器中解析，确认前不会写入课程表。</p></div>
        <div className="schoolPreset" role="group" aria-label="选择学校">
          <button className={preset === "pku" ? "active" : ""} onClick={() => { setPreset("pku"); setImported([]); setImportMessage(""); }}>北京大学</button>
          <button className={preset === "bit" ? "active" : ""} onClick={() => { setPreset("bit"); setImported([]); setImportMessage(""); }}>北京理工大学</button>
        </div>
      </div>
      <div className="academicImportGuide">
        <div><strong>{preset === "pku" ? "北大校内门户" : "北理工教务系统"}</strong><span>{preset === "pku" ? "进入“我的课表”，下载或导出课表原文件" : "进入“课表查询”，使用导出功能下载原文件"}</span></div>
        <div><strong>支持格式</strong><span>Excel（.xlsx）、CSV、ICS 日历文件</span></div>
        <div><strong>导入方式</strong><span>自动识别 → 手动核对 → 安全合并，不覆盖已有笔记</span></div>
      </div>
      <div className="academicFileRow">
        <label className={`academicFileButton ${importing ? "disabled" : ""}`} htmlFor="academic-course-file">{importing ? "正在识别…" : "选择教务课表文件"}</label>
        <input id="academic-course-file" className="visuallyHidden" type="file" accept=".xlsx,.csv,.ics,text/csv,text/calendar,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importing} onChange={handleAcademicFile} />
        <span>{importFileName || "尚未选择文件"}</span>
      </div>
      {importMessage ? <p className={`academicImportMessage ${imported.length ? "success" : ""}`}>{importMessage}</p> : null}
      {imported.length ? <div className="academicPreview">
        <div className="academicPreviewHead"><div><strong>导入预览</strong><span>{imported.length} 门课程 · 可在合并前修正</span></div><button className="primaryButton" onClick={mergeImported}>确认合并到课程表</button></div>
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

    <section className="timetableGrid">{weekdays.map((day, index) => {
      const slots = data.courses.flatMap((course) => course.schedule.filter((slot) => slot.weekday === index + 1).map((slot) => ({ course, slot }))).sort((a, b) => a.slot.start.localeCompare(b.slot.start));
      return <div className="timetableDay" key={day}><div className="timetableDayHead"><strong>{day}</strong><span>{slots.length} 节</span></div>{slots.length ? slots.map(({ course, slot }) => <article className="timetableCard" key={slot.id}><button className="timetableOpen" onClick={() => openCourse(course.id)}><span>{slot.start}—{slot.end}</span><strong>{course.title}</strong><small>{slot.location || course.location}{slot.weeks ? ` · ${slot.weeks}` : ""}</small></button><button className="miniRemove" aria-label={`移除 ${course.title} 的课程时间`} onClick={() => deleteDialog(`${course.title} ${day} ${slot.start}`, () => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, schedule: item.schedule.filter((entry) => entry.id !== slot.id) } : item) })))}>×</button></article>) : <p className="timetableEmpty">没有课程</p>}</div>;
    })}</section>
  </div>;
}

function TimetableView({ data, setData, setDialog, openCourse, deleteDialog }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; openCourse: (id: string) => void; deleteDialog: (title: string, onDelete: () => void) => void }) {
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const addSlot = () => setDialog({ title: "添加课程时间", description: "同一门课程可以添加多个上课时间。", submitLabel: "加入课程表", fields: [{ name: "course", label: "课程", type: "select", options: data.courses.map((course) => course.title) }, { name: "weekday", label: "星期", type: "select", options: weekdays }, { name: "start", label: "开始时间", type: "time", value: "08:00" }, { name: "end", label: "结束时间", type: "time", value: "09:40" }, { name: "location", label: "地点" }], onSubmit: (values) => setData((current) => ({ ...current, courses: current.courses.map((course) => course.title === values.course ? { ...course, schedule: [...course.schedule, { id: uid(), weekday: Math.max(1, weekdays.indexOf(values.weekday) + 1), start: values.start, end: values.end, location: values.location || course.location }] } : course) })) });
  return <div className="page timetablePage"><PageHead eyebrow="本学期 · 每周节奏" title="课程表" subtitle="课程表只管理固定上课时间；考试、作业与重要节点仍进入日历和任务总览" action={<button className="primaryButton" disabled={!data.courses.length} title={data.courses.length ? "添加课程时间" : "请先新建课程"} onClick={addSlot}>＋ 添加课程时间</button>} /><section className="timetableGrid">{weekdays.map((day, index) => { const slots = data.courses.flatMap((course) => course.schedule.filter((slot) => slot.weekday === index + 1).map((slot) => ({ course, slot }))).sort((a, b) => a.slot.start.localeCompare(b.slot.start)); return <div className="timetableDay" key={day}><div className="timetableDayHead"><strong>{day}</strong><span>{slots.length} 节</span></div>{slots.length ? slots.map(({ course, slot }) => <article className="timetableCard" key={slot.id}><button className="timetableOpen" onClick={() => openCourse(course.id)}><span>{slot.start}—{slot.end}</span><strong>{course.title}</strong><small>{slot.location || course.location}</small></button><button className="miniRemove" aria-label={`移除 ${course.title} 的课程时间`} onClick={() => deleteDialog(`${course.title} ${day} ${slot.start}`, () => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, schedule: item.schedule.filter((entry) => entry.id !== slot.id) } : item) })))}>×</button></article>) : <p className="timetableEmpty">没有课程</p>}</div>; })}</section></div>;
}

function TaskOverviewView({ data, setData, setDialog }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void }) {
  const [scope, setScope] = useState<"semester" | "week" | "done">("semester");
  const end = new Date(); end.setDate(end.getDate() + 7); const weekEnd = dateKey(end);
  const items = [
    ...data.tasks.map((task) => ({ id: task.id, kind: "task" as const, title: task.title, area: task.area, source: task.source, due: task.due ?? "", done: task.done })),
    ...data.milestones.map((item) => ({ id: item.id, kind: "milestone" as const, title: item.title, area: item.area, source: data.courses.find((course) => course.id === item.courseId)?.title ?? item.location, due: item.date, done: item.done })),
  ].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const visible = items.filter((item) => scope === "done" ? item.done : scope === "week" ? !item.done && !!item.due && item.due >= today && item.due <= weekEnd : !item.done);
  const completed = items.filter((item) => item.done).length;
  const addTask = () => setDialog({ title: "新增任务", description: "任务会同时出现在总览；日期为今天时也会进入今日。", submitLabel: "创建任务", fields: [{ name: "title", label: "任务名称" }, { name: "area", label: "所属领域", type: "select", options: ["课内", "课外", "工作", "生活", "思考"] }, { name: "source", label: "来自哪里", placeholder: "课程 / 项目 / 习惯" }, { name: "due", label: "截止日期", type: "date", value: today }], onSubmit: (values) => setData((current) => ({ ...current, tasks: [...current.tasks, { id: uid(), title: values.title || "未命名任务", area: (values.area || "思考") as Area, source: values.source || "任务总览", due: values.due, done: false, today: values.due === today, elapsed: 0 }] })) });
  const toggle = (item: (typeof items)[number]) => setData((current) => item.kind === "task" ? { ...current, tasks: current.tasks.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) } : { ...current, milestones: current.milestones.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) });
  const progress = Math.round(completed / Math.max(1, items.length) * 100);
  return <div className="page taskOverviewPage"><PageHead eyebrow="全局任务系统" title="任务总览" subtitle="课程节点、学期任务与今日行动使用同一份完成状态" action={<button className="primaryButton" onClick={addTask}>＋ 新增任务</button>} /><div className="overviewStats"><div><span>全部事项</span><strong>{items.length}</strong></div><div><span>本周待办</span><strong>{items.filter((item) => !item.done && !!item.due && item.due >= today && item.due <= weekEnd).length}</strong></div><div><span>总体完成</span><strong>{progress}%</strong><i><b style={{ width: `${progress}%` }} /></i></div></div><section className="panel overviewPanel"><div className="scopeTabs"><button className={scope === "semester" ? "active" : ""} onClick={() => setScope("semester")}>本学期</button><button className={scope === "week" ? "active" : ""} onClick={() => setScope("week")}>本周</button><button className={scope === "done" ? "active" : ""} onClick={() => setScope("done")}>已完成</button></div><div className="overviewList">{visible.map((item) => <div className={`overviewRow ${item.done ? "done" : ""}`} key={`${item.kind}-${item.id}`}><button className="checkButton" onClick={() => toggle(item)}>{item.done ? "✓" : ""}</button><div><strong>{item.title}</strong><span>{item.source || "未分类"}</span></div><span className={`areaTag ${areaClass[item.area]}`}>{item.area}</span><time>{item.due || "未设日期"}</time></div>)}{!visible.length && <div className="emptyState"><h2>这一栏已经清空</h2><p>新任务可以直接从右上角创建。</p></div>}</div></section></div>;
}

function CalendarView({ data, setData, setDialog }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void }) {
  const start = new Date(); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 35 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const addNode = () => setDialog({ title: "新建日历事项", description: "课程节点也会自动出现在这里。", submitLabel: "创建事项", fields: [{ name: "title", label: "事项名称", placeholder: "例如：阶段测验" }, { name: "date", label: "日期", type: "date", value: today }, { name: "time", label: "时间", type: "time", value: "09:00" }, { name: "location", label: "地点" }, { name: "requirements", label: "要求", type: "textarea" }, { name: "area", label: "所属领域", type: "select", options: ["课内", "课外", "工作", "生活", "思考"] }], onSubmit: (values) => setData((current) => ({ ...current, milestones: [...current.milestones, { id: uid(), title: values.title || "未命名事项", date: values.date, time: values.time, location: values.location, requirements: values.requirements, area: (values.area || "思考") as Area, done: false }] })) });
  return <div className="page"><PageHead eyebrow="全局时间线" title="日历" subtitle="查看课程节点、研究计划与生活事项" action={<button className="primaryButton" onClick={addNode}>＋ 新建事项</button>} /><section className="panel calendarPanel"><div className="weekHead">{"日一二三四五六".split("").map((day) => <span key={day}>周{day}</span>)}</div><div className="calendarGrid">{days.map((date) => { const key = dateKey(date); const events = data.milestones.filter((item) => item.date === key); return <div className={`calendarCell ${key === today ? "today" : ""}`} key={key}><strong>{date.getDate()}</strong><div>{events.map((event) => <span key={event.id} className={`calendarEvent ${areaClass[event.area]}`} title={`${event.time} ${event.location} ${event.requirements}`}>{event.time} {event.title}</span>)}</div></div>; })}</div></section></div>;
}

function ReviewView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const empty = { note: "", gain: "", problem: "", feeling: "", tomorrow: "" };
  const daily = data.daily[selectedDate] ?? empty;
  const updateDaily = (field: keyof typeof daily, value: string) => setData((current) => ({ ...current, daily: { ...current.daily, [selectedDate]: { ...(current.daily[selectedDate] ?? empty), [field]: value } } }));
  const dayTasks = data.tasks.filter((task) => task.due === selectedDate); const doneCount = dayTasks.filter((task) => task.done).length;
  const totalMinutes = data.timeEntries.filter((entry) => entry.date === selectedDate).reduce((sum, entry) => sum + entry.minutes, 0);
  const history = Object.keys(data.daily).sort((a, b) => b.localeCompare(a));
  const fields: { key: keyof typeof daily; title: string; placeholder: string }[] = [{ key: "gain", title: "今天有什么收获？", placeholder: "写下具体学会或推进的内容…" }, { key: "problem", title: "哪里卡住了？", placeholder: "问题、阻力和未解决事项…" }, { key: "feeling", title: "精力与状态", placeholder: "今天的节奏是否合适？" }, { key: "tomorrow", title: "明天最重要的一步", placeholder: "只写一个清晰的下一步…" }];
  return <div className="page reviewHistoryPage"><PageHead eyebrow="每日复盘" title={selectedDate === today ? "把今天收好，再开始明天。" : `${selectedDate} 的记录`} subtitle="选择任意日期查看或继续补充，不会每天覆盖成初始示例" action={<label className="datePicker"><span>选择日期</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>} /><div className="reviewLayout"><aside className="panel historyPanel"><h2>过往记录</h2><button className={selectedDate === today ? "active" : ""} onClick={() => setSelectedDate(today)}>今天 <span>{today}</span></button>{history.filter((date) => date !== today).map((date) => <button key={date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)}>{date}<span>{data.daily[date]?.gain || data.daily[date]?.note ? "有记录" : "空白"}</span></button>)}</aside><div><div className="reviewSummary"><div><span>完成任务</span><strong>{doneCount} / {dayTasks.length}</strong></div><div><span>专注时长</span><strong>{formatMinutes(totalMinutes)}</strong></div><div><span>记录日期</span><strong>{selectedDate.slice(5)}</strong></div></div><section className="panel reviewForm"><label><span>当天随记</span><textarea value={daily.note} placeholder="当天发生了什么？" onChange={(event) => updateDaily("note", event.target.value)} /></label>{fields.map((field) => <label key={field.key}><span>{field.title}</span><textarea value={daily[field.key]} placeholder={field.placeholder} onChange={(event) => updateDaily(field.key, event.target.value)} /></label>)}</section></div></div></div>;
}

type CollectionProps = { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; setDialog: (value: DialogConfig) => void; deleteDialog: (title: string, onDelete: () => void) => void };

function SchoolView({ data, setData, openDetail, setDialog, deleteDialog }: CollectionProps & { openDetail: (id: string) => void }) {
  const add = () => setDialog({ title: "新增课程", description: "创建后即可进入课程详情，继续补充要求、资料和节点。", submitLabel: "创建课程", fields: [{ name: "title", label: "课程名称", placeholder: "例如：审计学" }, { name: "term", label: "学期", value: "2026 秋季" }, { name: "teacher", label: "教师或说明" }, { name: "location", label: "上课地点" }], onSubmit: (values) => setData((current) => ({ ...current, courses: [...current.courses, { id: uid(), title: values.title || "未命名课程", term: values.term, teacher: values.teacher, location: values.location, progress: 0, requirements: "", schedule: [], blocks: starterBlocks("课程资料与笔记") }] })) });
  return <CollectionPage eyebrow="课内学习 · 本学期" title="课程总览" subtitle="每门课程都有独立详情、课程节点与自由笔记空间" addLabel="新增课程" onAdd={add}><div className="cardGrid">{data.courses.map((course) => <article className="panel entityCard" key={course.id}><button className="cardOpen" onClick={() => openDetail(course.id)}><span className="cardKicker">{course.term}</span><h2>{course.title}</h2><p>{course.teacher || "课程详情"}</p><div className="progressLine"><span style={{ width: `${course.progress}%` }} /></div><div className="cardFoot"><span>{course.progress}%</span><strong>进入课程详情 →</strong></div></button><button className="cardRemove" aria-label={`移除 ${course.title}`} onClick={() => deleteDialog(course.title, () => setData((current) => ({ ...current, courses: current.courses.filter((item) => item.id !== course.id) })))}>×</button></article>)}</div></CollectionPage>;
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

function ToolsView({ data, setData, openDetail, setDialog, deleteDialog }: CollectionProps & { openDetail: (id: string) => void }) {
  const add = () => setDialog({ title: "加入工具", description: "网站、软件、程序和正在开发的小工具都可以放在这里。", submitLabel: "加入工具集", fields: [{ name: "title", label: "工具名称" }, { name: "status", label: "状态", type: "select", options: ["想法", "开发中", "迭代中", "已完成", "已归档"] }, { name: "description", label: "用途说明", type: "textarea" }, { name: "url", label: "访问链接" }], onSubmit: (values) => setData((current) => ({ ...current, tools: [...current.tools, { id: uid(), title: values.title || "未命名工具", status: values.status || "想法", description: values.description, url: values.url, version: "0.1", blocks: starterBlocks("产品说明与迭代记录") }] })) });
  return <CollectionPage eyebrow="作品与生产力" title="工具集" subtitle="集中管理你用 Codex 制作的网站、软件、程序和工具" addLabel="加入工具" onAdd={add}><div className="cardGrid">{data.tools.map((tool) => <article className="panel entityCard toolCard" key={tool.id}><button className="cardOpen" onClick={() => openDetail(tool.id)}><div className="toolMark">{tool.title.slice(0, 1)}</div><span className="statusPill">{tool.status}</span><h2>{tool.title}</h2><p>{tool.description}</p><div className="cardFoot"><span>版本 {tool.version}</span><strong>查看详情 →</strong></div></button><button className="cardRemove" aria-label={`移除 ${tool.title}`} onClick={() => deleteDialog(tool.title, () => setData((current) => ({ ...current, tools: current.tools.filter((item) => item.id !== tool.id) })))}>×</button></article>)}</div></CollectionPage>;
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

function LifeViewV2({ data, setData, openDetail, setDialog, deleteDialog, setPopup }: CollectionProps & { openDetail: (target: DetailTarget) => void; setPopup: (value: PopupState) => void }) {
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

function NotesView({ space, data, setData, selectedPage, setSelectedPage, setDialog, deleteDialog }: CollectionProps & { space: "thoughts" | "free"; selectedPage: string; setSelectedPage: (id: string) => void }) {
  const nodes = data.pages.filter((item) => item.space === space); const selected = nodes.find((item) => item.id === selectedPage) ?? nodes.find((item) => item.kind === "page") ?? nodes[0];
  useEffect(() => { if (selected && selected.id !== selectedPage) setSelectedPage(selected.id); }, [selected, selectedPage, setSelectedPage]);
  const addNode = (kind: "folder" | "page", parentId: string | null = selected?.kind === "folder" ? selected.id : selected?.parentId ?? null) => setDialog({ title: kind === "folder" ? "新建文件夹" : "新建页面", description: parentId ? "将创建在当前层级中。" : "将创建在根目录。", submitLabel: "创建", fields: [{ name: "title", label: "名称", placeholder: kind === "folder" ? "文件夹名称" : "页面标题" }], onSubmit: (values) => { const id = uid(); setData((current) => ({ ...current, pages: [...current.pages, { id, space, parentId, title: values.title || (kind === "folder" ? "未命名文件夹" : "未命名页面"), kind, blocks: kind === "page" ? starterBlocks("开始记录") : [] }] })); setSelectedPage(id); } });
  const removeNode = (id: string) => setData((current) => { const removedIds = pageTreeIds(current.pages, id); return { ...current, pages: current.pages.filter((item) => !removedIds.has(item.id)) }; });
  const children = (parentId: string | null) => nodes.filter((item) => item.parentId === parentId);
  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => children(parentId).map((node) => <div className="treeBranch" key={node.id} style={{ "--depth": depth } as React.CSSProperties}><button className={`treeNode ${selected?.id === node.id ? "active" : ""}`} onClick={() => setSelectedPage(node.id)}><span className="treeGlyph">{node.kind === "folder" ? "▾" : "·"}</span><span>{node.title}</span></button>{node.kind === "folder" && <div className="treeChildren">{renderTree(node.id, depth + 1)}</div>}</div>);
  return <div className="page notesPage"><PageHead eyebrow={space === "thoughts" ? "思考集" : "自由空间"} title={space === "thoughts" ? "让想法长成结构" : "按你的方式继续扩展"} subtitle="支持多级文件夹，以及标题、清单、图片、表格和链接" /><section className="notesShell"><aside className="treePanel"><div className="treeActions"><button onClick={() => addNode("folder", null)}>＋ 根文件夹</button><button onClick={() => addNode("page")}>＋ 页面</button></div><div className="treeRootLabel">{space === "thoughts" ? "思考集根目录" : "自由空间根目录"}</div><div className="treeList">{renderTree(null)}</div></aside><div className="editorArea">{selected ? selected.kind === "page" ? <><div className="editorTop"><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item) }))} /><button className="textButton dangerText" onClick={() => deleteDialog(selected.title, () => removeNode(selected.id))}>移除页面</button></div><BlockEditor blocks={selected.blocks} onChange={(blocks) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, blocks } : item) }))} /></> : <div className="folderLanding"><span className="largeFolder">▰</span><p className="eyebrow">文件夹</p><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item) }))} /><p>此文件夹包含 {children(selected.id).length} 项内容。你可以继续创建任意层级。</p><div className="folderActions"><button className="primaryButton" onClick={() => addNode("page", selected.id)}>＋ 新建页面</button><button className="softButton" onClick={() => addNode("folder", selected.id)}>＋ 子文件夹</button><button className="textButton dangerText" onClick={() => deleteDialog(selected.title, () => removeNode(selected.id))}>移除文件夹</button></div></div> : <div className="emptyState"><h2>这里还是空的</h2><p>先创建一个根文件夹或页面。</p></div>}</div></section></div>;
}

function CollectionPage({ eyebrow, title, subtitle, addLabel, onAdd, children }: { eyebrow: string; title: string; subtitle: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) { return <div className="page"><PageHead eyebrow={eyebrow} title={title} subtitle={subtitle} action={<button className="primaryButton" onClick={onAdd}>＋ {addLabel}</button>} />{children}</div>; }

function DetailRouter({ target, data, setData, back, setDialog, deleteDialog }: { target: NonNullable<DetailTarget>; data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void; deleteDialog: (title: string, onDelete: () => void) => void }) {
  if (target.type === "course") { const item = data.courses.find((entry) => entry.id === target.id); return item ? <CourseDetail course={item} data={data} setData={setData} back={back} setDialog={setDialog} deleteDialog={deleteDialog} /> : null; }
  if (target.type === "learning") { const item = data.learning.find((entry) => entry.id === target.id); return item ? <LearningDetail item={item} setData={setData} back={back} setDialog={setDialog} /> : null; }
  if (target.type === "research") { const item = data.research.find((entry) => entry.id === target.id); return item ? <ResearchDetail item={item} setData={setData} back={back} setDialog={setDialog} /> : null; }
  if (target.type === "tool") { const item = data.tools.find((entry) => entry.id === target.id); return item ? <ToolDetailV2 item={item} setData={setData} back={back} /> : null; }
  if (target.type === "media") { const item = data.media.find((entry) => entry.id === target.id); return item ? <SimpleDetail title={item.title} eyebrow={`${item.kind} · ${item.status}`} description="观看或阅读详情" fields={[{ label: "进度", value: item.progress, onChange: (value) => setData((current) => ({ ...current, media: current.media.map((entry) => entry.id === item.id ? { ...entry, progress: value } : entry) })) }]} blocks={item.blocks} setBlocks={(blocks) => setData((current) => ({ ...current, media: current.media.map((entry) => entry.id === item.id ? { ...entry, blocks } : entry) }))} back={back} /> : null; }
  const item = data.recipes.find((entry) => entry.id === target.id); return item ? <SimpleDetail title={item.title} eyebrow="菜谱记录" description={item.note} fields={[{ label: "食材", value: item.ingredients, onChange: (value) => setData((current) => ({ ...current, recipes: current.recipes.map((entry) => entry.id === item.id ? { ...entry, ingredients: value } : entry) })) }, { label: "备注", value: item.note, onChange: (value) => setData((current) => ({ ...current, recipes: current.recipes.map((entry) => entry.id === item.id ? { ...entry, note: value } : entry) })) }]} blocks={item.blocks} setBlocks={(blocks) => setData((current) => ({ ...current, recipes: current.recipes.map((entry) => entry.id === item.id ? { ...entry, blocks } : entry) }))} back={back} /> : null;
}

function CourseDetail({ course, data, setData, back, setDialog, deleteDialog }: { course: Course; data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void; deleteDialog: (title: string, onDelete: () => void) => void }) {
  const nodes = data.milestones.filter((item) => item.courseId === course.id);
  const patchCourse = (patch: Partial<Course>) => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, ...patch } : item) }));
  const addNode = () => setDialog({ title: "新增课程节点", description: "填写后会自动创建到全局日历。", submitLabel: "创建并加入日历", fields: [{ name: "title", label: "什么事情", placeholder: "考试 / 作业 / 汇报" }, { name: "date", label: "什么时候", type: "date", value: today }, { name: "time", label: "具体时间", type: "time", value: "09:00" }, { name: "location", label: "什么地点", value: course.location }, { name: "requirements", label: "具体要求", type: "textarea" }], onSubmit: (values) => setData((current) => ({ ...current, milestones: [...current.milestones, { id: uid(), courseId: course.id, title: values.title || "未命名课程节点", date: values.date, time: values.time, location: values.location, requirements: values.requirements, area: "课内", done: false }] })) });
  return <DetailLayout eyebrow={`${course.term} · 课内课程`} title={course.title} subtitle="课程要求、近期任务、资料与自由笔记" back={back}><div className="detailGrid"><div className="detailMain"><section className="panel detailSection"><SectionHead title="课程基本要求" subtitle="可直接修改" /><div className="fieldGrid"><EditableField label="教师或说明" value={course.teacher} onChange={(value) => patchCourse({ teacher: value })} /><EditableField label="上课地点" value={course.location} onChange={(value) => patchCourse({ location: value })} /><EditableField label="当前进度" value={String(course.progress)} type="number" onChange={(value) => patchCourse({ progress: Math.min(100, Number(value) || 0) })} /><label className="editField wide"><span>课程要求</span><textarea value={course.requirements} onChange={(event) => patchCourse({ requirements: event.target.value })} /></label></div></section><section className="panel detailSection"><SectionHead title="课程节点" subtitle="系统模板：事情、时间、地点、要求；自动同步到日历" action={<button className="primaryButton" onClick={addNode}>＋ 新增节点</button>} /><div className="nodeTable"><div className="nodeTableHead"><span>事项</span><span>时间</span><span>地点</span><span>要求</span><span>完成</span></div>{nodes.map((node) => <div className={`nodeRow ${node.done ? "done" : ""}`} key={node.id}><strong>{node.title}</strong><span>{node.date}<small>{node.time}</small></span><span>{node.location}</span><span>{node.requirements}</span><button className={`habitCheck ${node.done ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, milestones: current.milestones.map((item) => item.id === node.id ? { ...item, done: !item.done } : item) }))}>{node.done ? "✓" : ""}</button><button className="miniRemove" onClick={() => deleteDialog(node.title, () => setData((current) => ({ ...current, milestones: current.milestones.filter((item) => item.id !== node.id) })))}>×</button></div>)}</div></section><section className="panel editorSection"><SectionHead title="资料、笔记与自由内容" subtitle="像文档一样继续添加内容块" /><BlockEditor blocks={course.blocks} onChange={(blocks) => patchCourse({ blocks })} /></section></div><aside className="detailAside"><div className="progressCard"><span>课程进度</span><strong>{course.progress}%</strong><div className="progressLine"><i style={{ width: `${course.progress}%` }} /></div></div><div className="tipCard"><strong>课程详情模板</strong><p>基本要求</p><p>近期任务与考试</p><p>课程资料</p><p>章节笔记</p><p>自由内容块</p></div></aside></div></DetailLayout>;
}

function LearningDetail({ item, setData, back, setDialog }: { item: LearningArea; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void }) {
  const patch = (value: Partial<LearningArea>) => setData((current) => ({ ...current, learning: current.learning.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));
  const addResource = () => setDialog({ title: `为“${item.title}”添加资源`, submitLabel: "添加资源", fields: [{ name: "title", label: "资源名称" }, { name: "type", label: "类型", type: "select", options: ["B站课程", "书籍", "软件", "网站", "线下课程", "其他"] }, { name: "url", label: "链接" }, { name: "progress", label: "进度（0—100）", type: "number", value: "0" }], onSubmit: (values) => patch({ resources: [...item.resources, { id: uid(), title: values.title || "未命名资源", type: values.type, url: values.url, progress: Number(values.progress) || 0 }] }) });
  return <DetailLayout eyebrow={`${item.category} · 课外学习`} title={item.title} subtitle="进度、资源、路线与笔记" back={back}><div className="detailGrid"><div className="detailMain"><section className="panel detailSection"><SectionHead title="学习目标与进度" subtitle="这个大文件夹的整体状态" /><label className="editField wide"><span>阶段目标</span><textarea value={item.goal} onChange={(event) => patch({ goal: event.target.value })} /></label><div className="rangeField"><span>整体进度</span><input type="range" min="0" max="100" value={item.progress} onChange={(event) => patch({ progress: Number(event.target.value) })} /><strong>{item.progress}%</strong></div></section><section className="panel detailSection"><SectionHead title="学习资源" subtitle="课程、书籍、网站和软件" action={<button className="primaryButton" onClick={addResource}>＋ 添加资源</button>} /><div className="resourceTable">{item.resources.map((resource) => <div className="resourceRow" key={resource.id}><span className="resourceMark">{resource.type.slice(0, 1)}</span><div><strong>{resource.title}</strong><span>{resource.type}</span></div><input type="range" min="0" max="100" value={resource.progress} onChange={(event) => patch({ resources: item.resources.map((entry) => entry.id === resource.id ? { ...entry, progress: Number(event.target.value) } : entry) })} /><b>{resource.progress}%</b>{resource.url ? <a href={resource.url} target="_blank" rel="noreferrer">打开</a> : <span>无链接</span>}<button className="miniRemove" onClick={() => patch({ resources: item.resources.filter((entry) => entry.id !== resource.id) })}>×</button></div>)}</div></section><section className="panel editorSection"><SectionHead title="学习笔记" subtitle="自由添加标题、清单、图片、表格和链接" /><BlockEditor blocks={item.blocks} onChange={(blocks) => patch({ blocks })} /></section></div><aside className="detailAside"><div className="progressCard"><span>整体进度</span><strong>{item.progress}%</strong><div className="progressLine"><i style={{ width: `${item.progress}%` }} /></div></div><div className="tipCard"><strong>建议结构</strong><p>学习目标</p><p>路线与阶段</p><p>资源库</p><p>练习作品</p><p>问题与复盘</p></div></aside></div></DetailLayout>;
}

function ResearchDetail({ item, setData, back, setDialog }: { item: ResearchProject; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void; setDialog: (value: DialogConfig) => void }) {
  const [selectedPageId, setSelectedPageId] = useState(item.pages[0]?.id ?? "");
  const selectedPage = item.pages.find((page) => page.id === selectedPageId) ?? item.pages[0];
  useEffect(() => { if (selectedPage && selectedPage.id !== selectedPageId) setSelectedPageId(selectedPage.id); }, [selectedPage, selectedPageId]);
  const patch = (value: Partial<ResearchProject>) => setData((current) => ({ ...current, research: current.research.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));
  const addPage = () => setDialog({ title: "新增研究页面", description: "页面没有固定格式，可以继续插入标题、清单、表格、链接和图片。", submitLabel: "创建页面", fields: [{ name: "title", label: "页面标题", placeholder: "例如：竞品拆解 / 用户访谈" }], onSubmit: (values) => { const page = { id: uid(), title: values.title || "未命名页面", blocks: starterBlocks(values.title || "研究记录") }; patch({ pages: [...item.pages, page] }); setSelectedPageId(page.id); } });
  const patchPage = (pageId: string, value: Partial<ResearchPage>) => patch({ pages: item.pages.map((page) => page.id === pageId ? { ...page, ...value } : page) });
  return <DetailLayout eyebrow={`${item.status} · 工作研究`} title={item.title} subtitle="自由页面式项目笔记：资料、实验、机会判断和结论可以按你的方式组织" back={back}><section className="panel researchOverview"><div><label><span>项目状态</span><select value={item.status} onChange={(event) => patch({ status: event.target.value })}><option>收集箱</option><option>研究中</option><option>验证中</option><option>已归档</option></select></label><label><span>当前关注</span><textarea value={item.summary} onChange={(event) => patch({ summary: event.target.value })} /></label><label><span>希望得到的结果</span><textarea value={item.objective} onChange={(event) => patch({ objective: event.target.value })} /></label><label><span>下一步行动</span><textarea value={item.next} onChange={(event) => patch({ next: event.target.value })} /></label></div><div className="researchProgress"><span>自己定义的推进度</span><strong>{item.progress}%</strong><input type="range" min="0" max="100" value={item.progress} onChange={(event) => patch({ progress: Number(event.target.value) })} /></div></section><section className="researchNotebook"><aside className="researchPages"><div><strong>项目页面</strong><button onClick={addPage}>＋</button></div>{item.pages.map((page) => <button key={page.id} className={selectedPage?.id === page.id ? "active" : ""} onClick={() => setSelectedPageId(page.id)}><span>·</span>{page.title}</button>)}</aside><div className="panel researchPageEditor">{selectedPage ? <><div className="editorTop"><input className="pageTitleInput" value={selectedPage.title} onChange={(event) => patchPage(selectedPage.id, { title: event.target.value })} />{item.pages.length > 1 && <button className="textButton dangerText" onClick={() => patch({ pages: item.pages.filter((page) => page.id !== selectedPage.id) })}>移除页面</button>}</div><BlockEditor blocks={selectedPage.blocks} onChange={(blocks) => patchPage(selectedPage.id, { blocks })} /></> : <div className="emptyState"><h2>创建第一个研究页面</h2><button className="primaryButton" onClick={addPage}>＋ 新增页面</button></div>}</div></section></DetailLayout>;
}

function ToolDetailV2({ item, setData, back }: { item: ToolItem; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void }) {
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

      <section className="panel editorSection"><SectionHead title="产品详情与迭代记录" subtitle="需求、功能、问题和版本记录都可以自由添加" /><BlockEditor blocks={item.blocks} onChange={(blocks) => patch({ blocks })} /></section>
    </div><aside className="detailAside"><div className="toolHero"><span>{item.title.slice(0, 1)}</span><strong>{item.title}</strong><small>版本 {currentVersionLabel || "未设置"}</small></div><div className="tipCard"><strong>版本管理建议</strong><p>保留可用的旧网址</p><p>记录本版核心变化</p><p>指定默认打开版本</p><p>注明测试版或稳定版</p><p>保留回退入口</p></div></aside></div>
  </DetailLayout>;
}

function ToolDetail({ item, setData, back }: { item: ToolItem; setData: React.Dispatch<React.SetStateAction<AppState>>; back: () => void }) {
  const patch = (value: Partial<ToolItem>) => setData((current) => ({ ...current, tools: current.tools.map((entry) => entry.id === item.id ? { ...entry, ...value } : entry) }));
  return <DetailLayout eyebrow={`${item.status} · 工具集`} title={item.title} subtitle="用途、访问地址、版本与迭代记录" back={back}><div className="detailGrid"><div className="detailMain"><section className="panel detailSection"><SectionHead title="工具信息" subtitle="可以随时修改" /><div className="fieldGrid"><EditableField label="当前状态" value={item.status} onChange={(value) => patch({ status: value })} /><EditableField label="版本" value={item.version} onChange={(value) => patch({ version: value })} /><EditableField label="访问链接" value={item.url} onChange={(value) => patch({ url: value })} /><label className="editField wide"><span>用途说明</span><textarea value={item.description} onChange={(event) => patch({ description: event.target.value })} /></label></div>{item.url && <a className="launchButton" href={item.url} target="_blank" rel="noreferrer">打开工具 ↗</a>}</section><section className="panel editorSection"><SectionHead title="产品详情与迭代记录" subtitle="需求、功能、问题、版本记录都可以自由添加" /><BlockEditor blocks={item.blocks} onChange={(blocks) => patch({ blocks })} /></section></div><aside className="detailAside"><div className="toolHero"><span>{item.title.slice(0, 1)}</span><strong>{item.title}</strong><small>版本 {item.version}</small></div><div className="tipCard"><strong>工具档案建议</strong><p>解决的问题</p><p>目标用户</p><p>功能清单</p><p>访问与部署</p><p>迭代记录</p></div></aside></div></DetailLayout>;
}

function SimpleDetail({ title, eyebrow, description, fields, blocks, setBlocks, back }: { title: string; eyebrow: string; description: string; fields: { label: string; value: string; onChange: (value: string) => void }[]; blocks: Block[]; setBlocks: (blocks: Block[]) => void; back: () => void }) {
  return <DetailLayout eyebrow={eyebrow} title={title} subtitle={description || "详情记录"} back={back}><div className="detailGrid singleAside"><div className="detailMain"><section className="panel detailSection"><SectionHead title="基本记录" subtitle="可直接修改" /><div className="fieldGrid">{fields.map((field) => <EditableField key={field.label} label={field.label} value={field.value} onChange={field.onChange} />)}</div></section><section className="panel editorSection"><SectionHead title="详情内容" subtitle="继续自由添加内容块" /><BlockEditor blocks={blocks} onChange={setBlocks} /></section></div></div></DetailLayout>;
}

function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (blocks: Block[]) => void }) {
  const add = (type: BlockType) => { const block: Block = type === "table" ? { id: uid(), type, rows: [["项目", "内容"], ["", ""]] } : { id: uid(), type, text: type === "heading" ? "新标题" : type === "checklist" ? "待办事项" : "" }; onChange([...blocks, block]); };
  const patch = (id: string, value: Partial<Block>) => onChange(blocks.map((block) => block.id === id ? { ...block, ...value } : block));
  const upload = (id: string, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("请选择图片文件。");
      return;
    }
    if (file.size > 512 * 1024) {
      window.alert("图片不能超过 512 KB，请压缩后再上传。");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => window.alert("图片读取失败，请重新选择。");
    reader.onload = () => {
      if (typeof reader.result === "string") patch(id, { url: reader.result });
    };
    reader.readAsDataURL(file);
  };
  return <div className="blockEditor">
    <div className="blockToolbar"><span>插入</span><button onClick={() => add("heading")}>标题</button><button onClick={() => add("text")}>正文</button><button onClick={() => add("checklist")}>清单</button><button onClick={() => add("link")}>链接</button><button onClick={() => add("table")}>表格</button><button onClick={() => add("image")}>图片</button></div>
    <div className="blocks">{blocks.map((block) => <div className={"editorBlock " + block.type} key={block.id}>
      <span className="dragMark">⋮⋮</span>
      {block.type === "heading" && <input value={block.text ?? ""} placeholder="标题" onChange={(event) => patch(block.id, { text: event.target.value })} />}
      {block.type === "text" && <textarea value={block.text ?? ""} placeholder="输入正文…" onChange={(event) => patch(block.id, { text: event.target.value })} />}
      {block.type === "checklist" && <><button className={"habitCheck " + (block.checked ? "done" : "")} onClick={() => patch(block.id, { checked: !block.checked })}>{block.checked ? "✓" : ""}</button><input value={block.text ?? ""} placeholder="清单项" onChange={(event) => patch(block.id, { text: event.target.value })} /></>}
      {block.type === "link" && <><input value={block.text ?? ""} placeholder="链接名称" onChange={(event) => patch(block.id, { text: event.target.value })} /><input value={block.url ?? ""} placeholder="https://" onChange={(event) => patch(block.id, { url: event.target.value })} /></>}
      {block.type === "image" && <div className="imageBlock">{block.url ? <Image src={block.url} alt={block.text || "内容图片"} width={900} height={520} unoptimized /> : <label><input type="file" accept="image/*" onChange={(event) => upload(block.id, event.target.files?.[0])} /><span>选择图片</span><small>随当前空间同步 · 最大 512 KB</small></label>}<input value={block.text ?? ""} placeholder="图片说明" onChange={(event) => patch(block.id, { text: event.target.value })} /></div>}
      {block.type === "table" && <TableBlock rows={block.rows ?? [["项目", "内容"]]} onChange={(rows) => patch(block.id, { rows })} />}
      <button className="blockRemove" aria-label="移除内容块" onClick={() => onChange(blocks.filter((entry) => entry.id !== block.id))}>×</button>
    </div>)}</div>
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
