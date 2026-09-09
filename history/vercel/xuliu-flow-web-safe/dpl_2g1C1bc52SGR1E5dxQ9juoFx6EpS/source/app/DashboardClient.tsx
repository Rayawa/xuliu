"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

type NavId = "today" | "timetable" | "tasks" | "calendar" | "review" | "school" | "learning" | "thoughts" | "work" | "ideas" | "tools" | "life" | "free";
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
type AppState = {
  version: 3;
  tasks: { id: string; title: string; area: Area; source: string; due?: string; done: boolean; today: boolean; elapsed: number }[];
  milestones: Milestone[];
  courses: Course[];
  learning: LearningArea[];
  research: ResearchProject[];
  ideas: { id: string; title: string; note: string; createdAt: string }[];
  tools: ToolItem[];
  habits: { id: string; title: string; streak: number; today: boolean; schedule: string }[];
  routines: { id: string; title: string; note: string }[];
  reminders: Reminder[];
  media: { id: string; title: string; kind: "书籍" | "动画" | "影视"; status: "正在看" | "想看" | "书单"; progress: string; blocks: Block[] }[];
  recipes: { id: string; title: string; ingredients: string; note: string; blocks: Block[] }[];
  pages: PageNode[];
  daily: Record<string, { note: string; gain: string; problem: string; feeling: string; tomorrow: string }>;
  timeEntries: { id: string; taskId: string; minutes: number; date: string; mode: string }[];
  themes: Record<string, string>;
};

type DetailTarget = { type: "course" | "learning" | "research" | "tool" | "media" | "recipe"; id: string } | null;
type DialogField = { name: string; label: string; type?: "text" | "textarea" | "date" | "time" | "number" | "select"; value?: string; placeholder?: string; options?: string[] };
type DialogConfig = { title: string; description?: string; submitLabel?: string; fields: DialogField[]; danger?: boolean; onSubmit: (values: Record<string, string>) => void } | null;
type PopupState = { eyebrow: string; title: string; body: string } | null;
export type WorkspaceAccount = { id: "owner" | "partner"; username: string; displayName: string };

const uid = () => Math.random().toString(36).slice(2, 10);
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = dateKey();
const dayAfter = (count: number) => { const date = new Date(); date.setDate(date.getDate() + count); return dateKey(date); };
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
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const parsed = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
    return parseAcademicRows(rows, preset);
  });
  const flattened = parsed.flatMap((course) => course.schedule.map((slot) => ({ title: course.title, teacher: course.teacher, location: course.location, weeks: course.weeks, slot })));
  return groupImportedCourses(flattened);
}

const initialState: AppState = {
  version: 4,
  tasks: [
    { id: "t1", title: "整理财务管理第三章笔记", area: "课内", source: "财务管理", due: today, done: false, today: true, elapsed: 24 },
    { id: "t2", title: "梳理 AI 工具变现方向的三个假设", area: "工作", source: "AI 工具研究", due: today, done: false, today: true, elapsed: 18 },
    { id: "t3", title: "完成 20 分钟力量训练", area: "生活", source: "运动", due: today, done: false, today: true, elapsed: 0 },
    { id: "t4", title: "复习中级财务会计错题", area: "课内", source: "中级财务会计", due: today, done: true, today: true, elapsed: 38 },
  ],
  milestones: [
    { id: "m1", courseId: "c1", title: "中级财务会计阶段测验", date: dayAfter(3), time: "14:00", location: "教学楼 302", requirements: "复习第三至第五章，携带计算器", area: "课内", done: false },
    { id: "m2", courseId: "c2", title: "财务管理课程作业", date: dayAfter(7), time: "23:00", location: "线上提交", requirements: "完成第三章习题并上传 PDF", area: "课内", done: false },
    { id: "m3", title: "AI 工具方向第一轮判断", date: dayAfter(9), time: "20:00", location: "个人工作台", requirements: "形成可行性结论与下一轮验证清单", area: "工作", done: false },
  ],
  courses: [
    { id: "c1", title: "中级财务会计", term: "2026 秋季", teacher: "专业核心课", location: "教学楼 302", progress: 62, requirements: "掌握核心准则，按周整理错题并在测验前完成章节复习。", schedule: [{ id: "cs1", weekday: 1, start: "08:00", end: "09:40", location: "教学楼 302" }, { id: "cs2", weekday: 4, start: "10:00", end: "11:40", location: "教学楼 302" }], blocks: starterBlocks("课程资料与笔记") },
    { id: "c2", title: "财务管理", term: "2026 秋季", teacher: "本学期课程", location: "教学楼 208", progress: 48, requirements: "完成章节作业，建立公式卡片和案例笔记。", schedule: [{ id: "cs3", weekday: 2, start: "14:00", end: "15:40", location: "教学楼 208" }], blocks: starterBlocks("第三章：资金时间价值") },
    { id: "c3", title: "成本会计", term: "2026 秋季", teacher: "课程进行中", location: "教学楼 405", progress: 35, requirements: "每周完成一次成本核算练习。", schedule: [{ id: "cs4", weekday: 5, start: "10:00", end: "11:40", location: "教学楼 405" }], blocks: starterBlocks("本周学习重点") },
  ],
  learning: [
    { id: "l1", title: "日语", category: "语言", progress: 44, goal: "完成初级课程，建立日常输入和复习系统。", resources: [{ id: "lr1", title: "日语入门系统课", type: "B站课程", url: "https://www.bilibili.com", progress: 44 }], blocks: starterBlocks("学习路线与笔记") },
    { id: "l2", title: "摄影", category: "兴趣", progress: 28, goal: "理解构图、用光并持续完成主题拍摄。", resources: [{ id: "lr2", title: "摄影构图与用光", type: "书籍", url: "", progress: 28 }], blocks: starterBlocks("作品练习与复盘") },
    { id: "l3", title: "深度学习", category: "技术", progress: 16, goal: "完成基础理论和一个可展示的小项目。", resources: [{ id: "lr3", title: "深度学习基础", type: "在线课程", url: "", progress: 16 }], blocks: starterBlocks("概念、实验与问题") },
  ],
  research: [
    { id: "w1", title: "面向学生的 AI 学习工具", status: "研究中", summary: "验证低频但刚需的小型工具形态。", objective: "弄清学生真正愿意长期使用、愿意付费的学习管理能力。", next: "访谈 5 个真实使用者", progress: 45, pages: starterResearchPages(starterBlocks("研究记录")) },
    { id: "w2", title: "小型自动化工具变现", status: "收集箱", summary: "研究个人开发者可持续的小产品模式。", objective: "找到需求明确、交付轻、可以快速验证的小工具方向。", next: "拆解 3 个同类产品", progress: 25, pages: starterResearchPages(starterBlocks("市场、案例与证据")) },
  ],
  ideas: [
    { id: "i1", title: "把课程节点自动转成复习任务", note: "根据考试日倒排并分配复习量。", createdAt: today },
    { id: "i2", title: "工具集记录每次迭代原因", note: "不只展示链接，也保留产品演进过程。", createdAt: today },
  ],
  tools: [
    { id: "tool1", title: "序流", status: "迭代中", description: "个人工作、学习与生活流管理系统", url: "https://xuliu-flow-web-v2.vercel.app", version: "0.3", blocks: starterBlocks("产品说明与迭代记录") },
    { id: "tool2", title: "课程资料整理器", status: "想法", description: "把零散文件整理成课程资源目录", url: "", version: "构思", blocks: starterBlocks("需求与功能草案") },
  ],
  habits: [
    { id: "h1", title: "23:00 前准备睡觉", streak: 5, today: false, schedule: "每天" },
    { id: "h2", title: "力量训练 20 分钟", streak: 2, today: false, schedule: "周一、三、六" },
    { id: "h3", title: "专注间隔起身休息", streak: 8, today: true, schedule: "每 20 分钟" },
  ],
  routines: [
    { id: "routine1", title: "晨间启动", note: "喝水、确认今日任务、开始第一段学习" },
    { id: "routine2", title: "晚间收尾", note: "整理桌面、完成复盘、放下屏幕" },
  ],
  reminders: [
    { id: "exercise", title: "完成今天的运动", type: "exercise", times: ["10:30", "17:30"], enabled: true },
    { id: "break", title: "起身活动，看看远处", type: "break", times: [], intervalMinutes: 20, enabled: true },
    { id: "sleep", title: "准备结束今天，放下屏幕", type: "sleep", times: ["23:00"], enabled: true },
  ],
  media: [
    { id: "media1", title: "摄影的艺术", kind: "书籍", status: "正在看", progress: "38%", blocks: starterBlocks("阅读摘记") },
    { id: "media2", title: "葬送的芙莉莲", kind: "动画", status: "正在看", progress: "第 7 集", blocks: starterBlocks("观看记录") },
    { id: "media3", title: "财务自由之路", kind: "书籍", status: "想看", progress: "未开始", blocks: starterBlocks("阅读期待") },
  ],
  recipes: [{ id: "recipe1", title: "番茄牛肉意面", ingredients: "牛肉、番茄、意面、洋葱", note: "下次增加一点罗勒", blocks: starterBlocks("步骤与调整") }],
  pages: [
    { id: "tf1", space: "thoughts", parentId: null, title: "学习方法", kind: "folder", blocks: [] },
    { id: "tf2", space: "thoughts", parentId: "tf1", title: "系统化学习", kind: "folder", blocks: [] },
    { id: "tp1", space: "thoughts", parentId: "tf2", title: "学习系统如何真正运转", kind: "page", blocks: starterBlocks("从节点到每天行动") },
    { id: "tp2", space: "thoughts", parentId: "tf1", title: "复习与反馈", kind: "page", blocks: starterBlocks("复习不是重复阅读") },
    { id: "ff1", space: "free", parentId: null, title: "个人档案", kind: "folder", blocks: [] },
    { id: "fp1", space: "free", parentId: "ff1", title: "摄影器材记录", kind: "page", blocks: starterBlocks("现有设备与使用感受") },
  ],
  daily: { [today]: { note: "", gain: "", problem: "", feeling: "", tomorrow: "" } },
  timeEntries: [],
  themes: { today: "#718c7c", timetable: "#6d8291", tasks: "#7b846d", calendar: "#6f8295", review: "#8c7a91", school: "#657f91", learning: "#80769a", thoughts: "#668476", work: "#8b7658", ideas: "#8a6f7d", tools: "#617f78", life: "#8b706d", free: "#738287" },
};

const navItems: { id: NavId; icon: string; label: string }[] = [
  { id: "today", icon: "今", label: "今日" }, { id: "timetable", icon: "课", label: "课程表" }, { id: "tasks", icon: "览", label: "任务总览" }, { id: "calendar", icon: "历", label: "日历" }, { id: "review", icon: "复", label: "每日复盘" },
  { id: "school", icon: "课", label: "课内学习" }, { id: "learning", icon: "学", label: "课外学习" }, { id: "thoughts", icon: "思", label: "思考集" },
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
  const courses = Array.isArray(saved.courses) ? saved.courses.map((item) => ({ ...initialState.courses[0], ...item, schedule: item.schedule ?? [], blocks: item.blocks ?? starterBlocks("课程资料与笔记") })) : [];
  const learning = Array.isArray(saved.learning) ? saved.learning.map((item) => ({ ...item, resources: item.resources ?? [], blocks: item.blocks ?? starterBlocks("学习路线与笔记") })) : saved.resources?.map((item) => ({ id: item.id, title: item.title, category: item.type, progress: item.progress, goal: item.note ?? "", resources: [{ id: uid(), title: item.title, type: item.type, url: item.url ?? "", progress: item.progress }], blocks: starterBlocks("学习路线与笔记") })) ?? [];
  return {
    ...initialState, ...saved, version: 4, courses, learning,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    milestones: Array.isArray(saved.milestones) ? saved.milestones : [],
    research: Array.isArray(saved.research) ? saved.research.map((item) => ({ ...initialState.research[0], ...item, objective: item.objective ?? item.question ?? "", pages: item.pages?.length ? item.pages : starterResearchPages(item.blocks), blocks: undefined })) : [],
    ideas: Array.isArray(saved.ideas) ? saved.ideas : [],
    tools: Array.isArray(saved.tools) ? saved.tools.map((item) => ({ ...initialState.tools[0], ...item, blocks: item.blocks ?? starterBlocks("产品说明与迭代记录") })) : [],
    habits: Array.isArray(saved.habits) ? saved.habits : [],
    routines: Array.isArray(saved.routines) ? saved.routines : [],
    reminders: Array.isArray(saved.reminders) ? saved.reminders.map((item) => ({ ...item, times: item.times ?? ((item as Reminder & { time?: string }).time?.match(/^\d{2}:\d{2}$/) ? [(item as Reminder & { time?: string }).time as string] : []), intervalMinutes: item.intervalMinutes ?? (item.type === "break" ? 20 : undefined) })) : [],
    media: Array.isArray(saved.media) ? saved.media.map((item) => ({ ...item, status: item.status ?? "正在看", kind: item.kind ?? "书籍", blocks: item.blocks ?? starterBlocks("记录") })) : [],
    recipes: Array.isArray(saved.recipes) ? saved.recipes.map((item) => ({ ...item, blocks: item.blocks ?? starterBlocks("步骤与调整") })) : [],
    pages: Array.isArray(saved.pages) ? saved.pages.map((item) => ({ ...item, space: item.space ?? (item.id.startsWith("f2") || item.id.startsWith("p2") ? "free" : "thoughts"), blocks: item.blocks ?? [] })) : [],
    daily: saved.daily && typeof saved.daily === "object" ? saved.daily : {},
    timeEntries: Array.isArray(saved.timeEntries) ? saved.timeEntries : [],
    themes: { ...initialState.themes, ...(saved.themes ?? {}) },
  };
}

export default function DashboardClient({ account, otherAccount, onLogout }: { account: WorkspaceAccount; otherAccount: WorkspaceAccount; onLogout: () => void }) {
  const [active, setActive] = useState<NavId>("today");
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [workspaceOwner, setWorkspaceOwner] = useState(account.id);
  const [data, setStoredData] = useState<AppState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<"saving" | "cloud" | "readonly" | "error">("saving");
  const [dialog, setDialog] = useState<DialogConfig>(null);
  const [popup, setPopup] = useState<PopupState>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedPage, setSelectedPage] = useState("tp1");
  const [timer, setTimer] = useState({ mode: "pomodoro" as "pomodoro" | "stopwatch", seconds: 1500, running: false, targetId: "t1" });
  const breakRef = useRef(0);
  const dirtyRef = useRef(false);
  const editVersionRef = useRef(0);
  const cloudRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const readOnly = workspaceOwner !== account.id;
  const visibleAccount = readOnly ? otherAccount : account;
  const setData: React.Dispatch<React.SetStateAction<AppState>> = useCallback((action) => {
    if (readOnly) {
      setPopup({ eyebrow: "只读空间", title: "这是对方的空间", body: "你可以查看这里的内容，但只有空间主人可以修改。" });
      return;
    }
    dirtyRef.current = true;
    editVersionRef.current += 1;
    setStoredData(action);
  }, [readOnly]);

  useEffect(() => {
    let cancelled = false;
    dirtyRef.current = false;
    setLoaded(false);
    setSync("saving");
    fetch(`/api/state?owner=${workspaceOwner}`, { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { onLogout(); return null; }
      if (!response.ok) throw new Error("空间载入失败");
      return response.json();
    }).then((result) => {
      if (!result || cancelled) return;
      cloudRevisionRef.current = Number(result.revision ?? 0);
      if (result.data) setStoredData(hydrateState(result.data));
      else if (workspaceOwner === account.id && account.id === "owner") {
        const stored = window.localStorage.getItem(`xuliu-state-v3-${account.id}`) ?? window.localStorage.getItem("xuliu-state-v3") ?? window.localStorage.getItem("xuliu-state");
        try { setStoredData(stored ? hydrateState(JSON.parse(stored)) : initialState); } catch { setStoredData(initialState); }
      } else setStoredData(initialState);
      setLoaded(true);
      setSync(result.readOnly ? "readonly" : "cloud");
    }).catch(() => { if (!cancelled) { setLoaded(true); setSync("error"); } });
    return () => { cancelled = true; };
  }, [workspaceOwner, account.id, onLogout]);
  useEffect(() => {
    if (!loaded || readOnly || !dirtyRef.current) return;
    setSync("saving");
    const editVersion = editVersionRef.current;
    const payload = data;
    const handle = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          const response = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: payload, baseRevision: cloudRevisionRef.current }) });
          if (response.status === 401) { onLogout(); return; }
          if (response.status === 409) {
            setSync("error");
            setPopup({ eyebrow: "数据保护", title: "云端内容已在别处更新", body: "为了避免覆盖之前的内容，本次保存已停止。请刷新页面取得最新版后再继续。" });
            return;
          }
          if (!response.ok) throw new Error("保存失败");
          const result = await response.json();
          cloudRevisionRef.current = Number(result.revision ?? cloudRevisionRef.current + 1);
          window.localStorage.setItem(`xuliu-state-v3-${account.id}`, JSON.stringify(payload));
          if (editVersionRef.current === editVersion) {
            dirtyRef.current = false;
            setSync("cloud");
          }
        } catch { setSync("error"); }
      });
    }, 550);
    return () => window.clearTimeout(handle);
  }, [account.id, data, loaded, onLogout, readOnly]);
  useEffect(() => { if (!timer.running) return; const handle = window.setInterval(() => setTimer((current) => { const next = current.mode === "pomodoro" ? current.seconds - 1 : current.seconds + 1; const elapsed = current.mode === "pomodoro" ? 1500 - next : next; const breakReminder = data.reminders.find((item) => item.type === "break" && item.enabled && item.intervalMinutes); const interval = (breakReminder?.intervalMinutes ?? 20) * 60; if (breakReminder && elapsed > 0 && elapsed % interval === 0 && breakRef.current !== elapsed) { breakRef.current = elapsed; setPopup({ eyebrow: "休息提醒", title: breakReminder.title, body: "看看远处、活动肩颈。五分钟后再回来也不会耽误进度。" }); } if (current.mode === "pomodoro" && next <= 0) { setPopup({ eyebrow: "专注完成", title: "这一轮已经完成", body: "先给自己一点正向反馈，再决定继续还是休息。" }); return { ...current, seconds: 0, running: false }; } return { ...current, seconds: next }; }), 1000); return () => window.clearInterval(handle); }, [data.reminders, timer.running]);
  useEffect(() => { if (readOnly) return; const check = () => { const now = new Date(); const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; const firedKey = `${today}-${clock}`; const due = data.reminders.find((item) => item.enabled && ((item.snoozedUntil && item.snoozedUntil <= Date.now()) || (item.times.includes(clock) && item.lastFired !== firedKey))); if (!due) return; setPopup({ eyebrow: due.type === "sleep" ? "睡眠提醒" : due.type === "exercise" ? "运动提醒" : "生活提醒", title: due.title, body: "这是页面内提醒，不会发出闹钟声。你可以完成、延迟 5 分钟或直接关闭。" }); setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === due.id ? { ...item, lastFired: firedKey, snoozedUntil: undefined } : item) })); }; check(); const handle = window.setInterval(check, 30000); return () => window.clearInterval(handle); }, [data.reminders, readOnly, setData]);

  const navigate = (id: NavId) => { setActive(id); setDetail(null); setMobileNav(false); };
  const theme = data.themes[active] ?? toneChoices[0];
  const daily = data.daily[today] ?? { note: "", gain: "", problem: "", feeling: "", tomorrow: "" };
  const todayTasks = data.tasks.filter((task) => task.due === today || (!task.due && task.today));
  const updateDaily = (field: keyof typeof daily, value: string) => setData((current) => ({ ...current, daily: { ...current.daily, [today]: { ...(current.daily[today] ?? daily), [field]: value } } }));
  const deleteDialog = (title: string, onDelete: () => void) => setDialog({ title: `移除“${title}”？`, description: "内容会从当前账号的云端空间中移除。", submitLabel: "确认移除", danger: true, fields: [], onSubmit: onDelete });
  const finishFocus = () => { const seconds = timer.mode === "pomodoro" ? 1500 - timer.seconds : timer.seconds; const minutes = Math.max(1, Math.round(seconds / 60)); setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === timer.targetId ? { ...task, elapsed: task.elapsed + minutes } : task), timeEntries: [...current.timeEntries, { id: uid(), taskId: timer.targetId, minutes, date: today, mode: timer.mode }] })); setTimer((current) => ({ ...current, running: false, seconds: current.mode === "pomodoro" ? 1500 : 0 })); };
  const addManualTime = () => setDialog({ title: "补记专注时间", description: "记录到当前选择的任务。", submitLabel: "记入时间", fields: [{ name: "minutes", label: "分钟数", type: "number", value: "30" }], onSubmit: ({ minutes }) => { const value = Math.max(1, Math.round(Number(minutes) || 0)); setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === timer.targetId ? { ...task, elapsed: task.elapsed + value } : task), timeEntries: [...current.timeEntries, { id: uid(), taskId: timer.targetId, minutes: value, date: today, mode: "manual" }] })); } });
  const exportData = () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `序流备份-${today}.json`; link.click(); URL.revokeObjectURL(link.href); };

  return <div className="shell" style={{ "--accent": theme } as React.CSSProperties}>
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}><button className="brand" onClick={() => navigate("today")}><span className="brandMark">序</span><span>序流</span></button><div className="workspaceSwitcher"><span>当前空间</span><button className={!readOnly ? "active" : ""} onClick={() => { setWorkspaceOwner(account.id); setDetail(null); }}><i>{account.displayName.slice(0, 1)}</i><b>{account.displayName}</b><small>我的</small></button><button className={readOnly ? "active" : ""} onClick={() => { setWorkspaceOwner(otherAccount.id); setDetail(null); }}><i>{otherAccount.displayName.slice(0, 1)}</i><b>{otherAccount.displayName}</b><small>只读</small></button></div><div className="navGroup">{navItems.slice(0, 5).map((item) => <NavButton key={item.id} {...item} active={active} onClick={navigate} />)}</div><div className="navCaption">我的空间</div><div className="navGroup">{navItems.slice(5).map((item) => <NavButton key={item.id} {...item} active={active} onClick={navigate} />)}</div><button className="exportButton" onClick={exportData}>导出数据备份</button><button className="logoutButton" onClick={onLogout}>退出登录</button><div className="sidebarFoot"><span className={`syncDot ${sync}`} />{sync === "saving" ? "正在保存" : sync === "readonly" ? "正在查看只读空间" : sync === "error" ? "云端连接异常" : "已保存到云端"}</div></aside>
    <main className="main"><header className="mobileHeader"><button className="iconButton" onClick={() => setMobileNav(true)}>☰</button><strong>序流</strong><span className={`syncDot ${sync}`} /></header>{readOnly && <div className="readOnlyBanner">正在查看 <strong>{visibleAccount.displayName}</strong> 的空间 · 只读</div>}{!loaded ? <div className="workspaceLoading">正在载入空间…</div> : <>{!detail && <ThemePicker color={theme} onChange={(color) => setData((current) => ({ ...current, themes: { ...current.themes, [active]: color } }))} />}{detail ? <DetailRouter target={detail} data={data} setData={setData} back={() => setDetail(null)} setDialog={setDialog} deleteDialog={deleteDialog} /> : <>
      {active === "today" && <TodayView data={data} setData={setData} tasks={todayTasks} milestones={data.milestones.filter((item) => item.date === today)} totalMinutes={data.timeEntries.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.minutes, 0)} daily={daily} updateDaily={updateDaily} timer={timer} setTimer={setTimer} finishFocus={finishFocus} addManualTime={addManualTime} setPopup={setPopup} />}
      {active === "timetable" && <TimetableViewV2 data={data} setData={setData} setDialog={setDialog} openCourse={(id) => setDetail({ type: "course", id })} deleteDialog={deleteDialog} />}
      {active === "tasks" && <TaskOverviewView data={data} setData={setData} setDialog={setDialog} />}
      {active === "calendar" && <CalendarView data={data} setData={setData} setDialog={setDialog} />}
      {active === "review" && <ReviewView data={data} setData={setData} />}
      {active === "school" && <SchoolView data={data} setData={setData} openDetail={(id) => setDetail({ type: "course", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "learning" && <LearningView data={data} setData={setData} openDetail={(id) => setDetail({ type: "learning", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {(active === "thoughts" || active === "free") && <NotesView space={active} data={data} setData={setData} selectedPage={selectedPage} setSelectedPage={setSelectedPage} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "work" && <WorkView data={data} setData={setData} openDetail={(id) => setDetail({ type: "research", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "ideas" && <IdeasView data={data} setData={setData} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "tools" && <ToolsView data={data} setData={setData} openDetail={(id) => setDetail({ type: "tool", id })} setDialog={setDialog} deleteDialog={deleteDialog} />}
      {active === "life" && <LifeViewV2 data={data} setData={setData} openDetail={setDetail} setDialog={setDialog} deleteDialog={deleteDialog} setPopup={setPopup} />}
    </>}</>}</main>
    <nav className="mobileTabs">{navItems.slice(0, 3).map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.label}</button>)}<button onClick={() => setMobileNav(true)}><span>格</span>空间</button></nav>{mobileNav && <button className="navScrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}<FormDialog config={dialog} onClose={() => setDialog(null)} /><PagePopup popup={popup} onClose={() => setPopup(null)} onSnooze={() => { setPopup(null); setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.title === popup?.title ? { ...item, snoozedUntil: Date.now() + 300000 } : item) })); }} />
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
  return <div className="page"><PageHead eyebrow={`${new Date().getMonth() + 1}月${new Date().getDate()}日 · ${new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())}`} title="今天，把重要的事接起来。" subtitle={`${tasks.filter((task) => !task.done).length} 项待完成 · 今日已专注 ${formatMinutes(totalMinutes)}`} action={<SyncChip />} /><div className="todayGrid"><div className="stack"><section className="panel taskPanel"><PanelTitle title="今日任务" subtitle="从任务总览中自动筛选截止到今天的事项" meta={`${tasks.filter((task) => task.done).length} / ${tasks.length}`} /><div className="taskList">{tasks.map((task) => <div key={task.id} className={`taskRow ${task.done ? "done" : ""}`}><button className="checkButton" aria-label={task.done ? "标记未完成" : "标记完成"} onClick={() => setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) }))}>{task.done ? "✓" : ""}</button><div className="taskBody"><strong>{task.title}</strong><span>{task.source} · 已投入 {task.elapsed} 分钟</span></div><span className={`areaTag ${areaClass[task.area]}`}>{task.area}</span></div>)}{!tasks.length && <div className="emptyState compact"><h2>今天还没有任务</h2><p>去任务总览设置日期，或在下面临时添加。</p></div>}</div><div className="quickAdd"><input value={quick} placeholder="添加一个临时任务…" onChange={(event) => setQuick(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTask(); }} /><button onClick={addTask}>添加</button></div></section><section className="panel notePanel"><PanelTitle title="今日随记" subtitle="收获、问题或突然出现的想法" meta="自动保存" /><textarea value={daily.note} onChange={(event) => updateDaily("note", event.target.value)} placeholder="此刻有什么值得记下来？" /></section></div><div className="stack"><section className="panel focusPanel"><div className="modeSwitch"><button className={timer.mode === "pomodoro" ? "active" : ""} onClick={() => switchMode("pomodoro")}>番茄钟</button><button className={timer.mode === "stopwatch" ? "active" : ""} onClick={() => switchMode("stopwatch")}>正向计时</button></div><div className="timerValue">{formatClock(timer.seconds)}</div><select value={timer.targetId} onChange={(event) => setTimer((current) => ({ ...current, targetId: event.target.value }))}>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><div className="timerActions"><button className="primaryButton" onClick={() => setTimer((current) => ({ ...current, running: !current.running }))}>{timer.running ? "暂停" : "开始专注"}</button><button className="softButton" onClick={finishFocus}>完成</button><button className="softButton" onClick={addManualTime}>补记</button></div><button className="notificationLink" onClick={() => setPopup({ eyebrow: "休息提醒", title: "页面提醒已经开启", body: "专注达到设定间隔时，这里会弹出安静的页面提示，不会发出闹钟声。" })}>预览休息提醒</button></section><div className="miniStats"><div><strong>{formatMinutes(totalMinutes)}</strong><span>今日专注</span></div><div><strong>{tasks.filter((task) => task.done).length}</strong><span>完成任务</span></div><div><strong>{Math.round(data.habits.filter((habit) => habit.today).length / Math.max(1, data.habits.length) * 100)}%</strong><span>习惯完成</span></div></div><section className="panel reminderPanel"><PanelTitle title="生活提醒" subtitle="一个项目可设置多个时间" /><div className="reminderList">{data.reminders.map((reminder) => <div className="reminderRow" key={reminder.id}><span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : reminder.type === "exercise" ? "动" : "提"}</span><div><strong>{reminder.title}</strong><span>{reminder.times.length ? reminder.times.join(" / ") : `每 ${reminder.intervalMinutes ?? 20} 分钟`} · {reminder.enabled ? "等待提醒" : "已关闭"}</span></div><button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: "你可以完成、延迟 5 分钟或关闭这条页面提示。" })}>预览</button></div>)}</div></section></div></div></div>;
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
      action={<div className="pageHeadActions"><button className="softButton" onClick={() => setImportOpen((value) => !value)}>{importOpen ? "收起教务导入" : "⇧ 教务导入"}</button><button className="primaryButton" onClick={addSlot}>＋ 添加课程时间</button></div>}
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
        <div><strong>支持格式</strong><span>Excel（.xlsx / .xls）、CSV、ICS 日历文件</span></div>
        <div><strong>导入方式</strong><span>自动识别 → 手动核对 → 安全合并，不覆盖已有笔记</span></div>
      </div>
      <div className="academicFileRow">
        <label className={`academicFileButton ${importing ? "disabled" : ""}`} htmlFor="academic-course-file">{importing ? "正在识别…" : "选择教务课表文件"}</label>
        <input id="academic-course-file" className="visuallyHidden" type="file" accept=".xlsx,.xls,.csv,.ics,text/csv,text/calendar,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importing} onChange={handleAcademicFile} />
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
  return <div className="page timetablePage"><PageHead eyebrow="本学期 · 每周节奏" title="课程表" subtitle="课程表只管理固定上课时间；考试、作业与重要节点仍进入日历和任务总览" action={<button className="primaryButton" onClick={addSlot}>＋ 添加课程时间</button>} /><section className="timetableGrid">{weekdays.map((day, index) => { const slots = data.courses.flatMap((course) => course.schedule.filter((slot) => slot.weekday === index + 1).map((slot) => ({ course, slot }))).sort((a, b) => a.slot.start.localeCompare(b.slot.start)); return <div className="timetableDay" key={day}><div className="timetableDayHead"><strong>{day}</strong><span>{slots.length} 节</span></div>{slots.length ? slots.map(({ course, slot }) => <article className="timetableCard" key={slot.id}><button className="timetableOpen" onClick={() => openCourse(course.id)}><span>{slot.start}—{slot.end}</span><strong>{course.title}</strong><small>{slot.location || course.location}</small></button><button className="miniRemove" aria-label={`移除 ${course.title} 的课程时间`} onClick={() => deleteDialog(`${course.title} ${day} ${slot.start}`, () => setData((current) => ({ ...current, courses: current.courses.map((item) => item.id === course.id ? { ...item, schedule: item.schedule.filter((entry) => entry.id !== slot.id) } : item) })))}>×</button></article>) : <p className="timetableEmpty">没有课程</p>}</div>; })}</section></div>;
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
  return <div className="page lifePage"><PageHead eyebrow="生活管理" title="日常习惯和规律（总）" subtitle="把需要长期维持的节奏放在一个安静、可复盘的地方" /><section className="lifeSection"><SectionHead title="日常习惯和规律（总）" subtitle="习惯打卡与生活流程" action={<button className="softButton" onClick={addHabit}>＋ 添加</button>} /><div className="lifeGrid"><div className="panel lifePanel"><h3>今日习惯</h3>{data.habits.map((habit) => <div className="habitRow" key={habit.id}><button className={`habitCheck ${habit.today ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? { ...item, today: !item.today, streak: Math.max(0, item.streak + (item.today ? -1 : 1)) } : item) }))}>{habit.today ? "✓" : ""}</button><div><strong>{habit.title}</strong><span>{habit.schedule} · 连续 {habit.streak} 天</span></div><button className="miniRemove" onClick={() => deleteDialog(habit.title, () => setData((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habit.id) })))}>×</button></div>)}</div><div className="panel lifePanel"><h3>生活流程</h3>{data.routines.map((routine) => <div className="routineRow" key={routine.id}><span>{routine.title.slice(0, 1)}</span><div><strong>{routine.title}</strong><p>{routine.note}</p></div></div>)}</div></div></section><section className="lifeSection"><SectionHead title="习惯提醒" subtitle="运动、中间休息和睡觉 · 仅在页面内弹出" /><div className="panel reminderSettings">{data.reminders.map((reminder) => <div className="settingRow" key={reminder.id}><span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : "动"}</span><div><strong>{reminder.title}</strong><span>{reminder.type === "break" ? "专注满 20 分钟触发" : "到点后页面右下角提示"}</span></div>{reminder.type === "break" ? <span className="timeText">20 分钟</span> : <input type="time" value={reminder.time} onChange={(event) => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, time: event.target.value } : item) }))} />}<button className={`switch ${reminder.enabled ? "on" : ""}`} aria-label={reminder.enabled ? "关闭提醒" : "开启提醒"} onClick={() => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item) }))}><span /></button><button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: "这是一条安静的页面 popup。它不会调用系统提示，也不会发出闹钟声。" })}>预览</button></div>)}</div></section><section className="lifeSection"><SectionHead title="媒体与书籍" subtitle="分为正在看、想看和书单" action={<button className="softButton" onClick={addMedia}>＋ 添加</button>} /><div className="mediaColumns">{(["正在看", "想看", "书单"] as const).map((status) => <div className="mediaColumn" key={status}><div className="mediaColumnHead"><strong>{status}</strong><span>{data.media.filter((item) => item.status === status).length}</span></div>{data.media.filter((item) => item.status === status).map((item) => <article className="mediaCard" key={item.id}><button onClick={() => openDetail({ type: "media", id: item.id })}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.progress || "尚未记录进度"}</small></button><button className="miniRemove" onClick={() => deleteDialog(item.title, () => setData((current) => ({ ...current, media: current.media.filter((entry) => entry.id !== item.id) })))}>×</button></article>)}</div>)}</div></section><section className="lifeSection"><SectionHead title="菜谱记录" subtitle="保存食材、步骤和下次调整" action={<button className="softButton" onClick={addRecipe}>＋ 新增菜谱</button>} /><div className="recipeGrid">{data.recipes.map((recipe) => <article className="panel recipeCard" key={recipe.id}><button className="cardOpen" onClick={() => openDetail({ type: "recipe", id: recipe.id })}><span className="recipeMark">食</span><h3>{recipe.title}</h3><p>{recipe.ingredients}</p><strong>查看菜谱详情 →</strong></button><button className="cardRemove" onClick={() => deleteDialog(recipe.title, () => setData((current) => ({ ...current, recipes: current.recipes.filter((item) => item.id !== recipe.id) })))}>×</button></article>)}</div></section></div>;
}

function LifeViewV2({ data, setData, openDetail, setDialog, deleteDialog, setPopup }: CollectionProps & { openDetail: (target: DetailTarget) => void; setPopup: (value: PopupState) => void }) {
  const addHabit = () => setDialog({ title: "新增习惯或规律", submitLabel: "添加", fields: [{ name: "title", label: "名称" }, { name: "schedule", label: "频率", placeholder: "每天 / 每周三次" }], onSubmit: (values) => setData((current) => ({ ...current, habits: [...current.habits, { id: uid(), title: values.title || "未命名习惯", schedule: values.schedule, streak: 0, today: false }] })) });
  const addReminder = () => setDialog({ title: "新增提醒项目", description: "同一项目的多个时间请用逗号分隔，例如 10:30, 17:30。", submitLabel: "创建提醒", fields: [{ name: "title", label: "提醒名称", placeholder: "例如：运动 / 喝水 / 拉伸" }, { name: "type", label: "类型", type: "select", options: ["运动", "休息", "睡觉", "其他"] }, { name: "times", label: "提醒时间", placeholder: "10:30, 17:30" }, { name: "interval", label: "专注间隔（分钟，可不填）", type: "number" }], onSubmit: (values) => { const typeMap: Record<string, Reminder["type"]> = { 运动: "exercise", 休息: "break", 睡觉: "sleep", 其他: "custom" }; const times = values.times.split(/[，,\s]+/).filter((value) => /^\d{2}:\d{2}$/.test(value)); setData((current) => ({ ...current, reminders: [...current.reminders, { id: uid(), title: values.title || "未命名提醒", type: typeMap[values.type] ?? "custom", times, intervalMinutes: Number(values.interval) || undefined, enabled: true }] })); } });
  const addMedia = () => setDialog({ title: "加入媒体与书籍", submitLabel: "加入", fields: [{ name: "title", label: "名称" }, { name: "kind", label: "类型", type: "select", options: ["书籍", "动画", "影视"] }, { name: "status", label: "状态", type: "select", options: ["正在看", "想看", "书单"] }, { name: "progress", label: "进度", placeholder: "例如：38% / 第 7 集" }], onSubmit: (values) => setData((current) => ({ ...current, media: [...current.media, { id: uid(), title: values.title || "未命名", kind: (values.kind || "书籍") as "书籍" | "动画" | "影视", status: (values.status || "正在看") as "正在看" | "想看" | "书单", progress: values.progress, blocks: starterBlocks("记录") }] })) });
  const addRecipe = () => setDialog({ title: "新增菜谱", submitLabel: "保存菜谱", fields: [{ name: "title", label: "菜名" }, { name: "ingredients", label: "主要食材", type: "textarea" }, { name: "note", label: "备注", type: "textarea" }], onSubmit: (values) => setData((current) => ({ ...current, recipes: [...current.recipes, { id: uid(), title: values.title || "未命名菜谱", ingredients: values.ingredients, note: values.note, blocks: starterBlocks("步骤与调整") }] })) });
  const patchReminder = (id: string, patch: Partial<Reminder>) => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  return <div className="page lifePage">
    <PageHead eyebrow="生活管理" title="日常习惯和规律（总）" subtitle="习惯、提醒、媒体、书籍和菜谱集中在一个可复盘的地方" />
    <section className="lifeSection"><SectionHead title="日常习惯和规律（总）" subtitle="习惯打卡与生活流程" action={<button className="softButton" onClick={addHabit}>＋ 添加</button>} /><div className="lifeGrid"><div className="panel lifePanel"><h3>今日习惯</h3>{data.habits.map((habit) => <div className="habitRow" key={habit.id}><button className={`habitCheck ${habit.today ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? { ...item, today: !item.today, streak: Math.max(0, item.streak + (item.today ? -1 : 1)) } : item) }))}>{habit.today ? "✓" : ""}</button><div><strong>{habit.title}</strong><span>{habit.schedule} · 连续 {habit.streak} 天</span></div><button className="miniRemove" onClick={() => deleteDialog(habit.title, () => setData((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habit.id) })))}>×</button></div>)}</div><div className="panel lifePanel"><h3>生活流程</h3>{data.routines.map((routine) => <div className="routineRow" key={routine.id}><span>{routine.title.slice(0, 1)}</span><div><strong>{routine.title}</strong><p>{routine.note}</p></div></div>)}</div></div></section>
    <section className="lifeSection"><SectionHead title="习惯提醒" subtitle="项目可自由增减，同一项目支持多个提醒时间" action={<button className="softButton" onClick={addReminder}>＋ 新增提醒</button>} /><div className="panel reminderSettings">{data.reminders.map((reminder) => <div className="settingRow reminderProjectRow" key={reminder.id}><span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : reminder.type === "break" ? "息" : reminder.type === "exercise" ? "动" : "提"}</span><div className="reminderProjectBody"><strong>{reminder.title}</strong><div className="reminderTimes">{reminder.times.map((time, index) => <span key={`${reminder.id}-${index}`}><input type="time" value={time} onChange={(event) => patchReminder(reminder.id, { times: reminder.times.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry) })} /><button onClick={() => patchReminder(reminder.id, { times: reminder.times.filter((_, entryIndex) => entryIndex !== index) })}>×</button></span>)}<button className="addTimeButton" onClick={() => patchReminder(reminder.id, { times: [...reminder.times, "12:00"] })}>＋ 时间</button>{reminder.type === "break" && <label className="intervalField">每 <input type="number" min="5" value={reminder.intervalMinutes ?? 20} onChange={(event) => patchReminder(reminder.id, { intervalMinutes: Math.max(5, Number(event.target.value) || 20) })} /> 分钟</label>}</div></div><button className={`switch ${reminder.enabled ? "on" : ""}`} onClick={() => patchReminder(reminder.id, { enabled: !reminder.enabled })}><span /></button><button className="softButton" onClick={() => setPopup({ eyebrow: "提醒预览", title: reminder.title, body: "这是页面内 popup 提醒。可以完成、延迟 5 分钟或关闭，不会调用系统闹钟。" })}>预览</button><button className="miniRemove" onClick={() => deleteDialog(reminder.title, () => setData((current) => ({ ...current, reminders: current.reminders.filter((item) => item.id !== reminder.id) })))}>×</button></div>)}</div></section>
    <section className="lifeSection"><SectionHead title="媒体与书籍" subtitle="分为正在看、想看和书单" action={<button className="softButton" onClick={addMedia}>＋ 添加</button>} /><div className="mediaColumns">{(["正在看", "想看", "书单"] as const).map((status) => <div className="mediaColumn" key={status}><div className="mediaColumnHead"><strong>{status}</strong><span>{data.media.filter((item) => item.status === status).length}</span></div>{data.media.filter((item) => item.status === status).map((item) => <article className="mediaCard" key={item.id}><button onClick={() => openDetail({ type: "media", id: item.id })}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.progress || "尚未记录进度"}</small></button><button className="miniRemove" onClick={() => deleteDialog(item.title, () => setData((current) => ({ ...current, media: current.media.filter((entry) => entry.id !== item.id) })))}>×</button></article>)}</div>)}</div></section>
    <section className="lifeSection"><SectionHead title="菜谱记录" subtitle="保存食材、步骤和下次调整" action={<button className="softButton" onClick={addRecipe}>＋ 新增菜谱</button>} /><div className="recipeGrid">{data.recipes.map((recipe) => <article className="panel recipeCard" key={recipe.id}><button className="cardOpen" onClick={() => openDetail({ type: "recipe", id: recipe.id })}><span className="recipeMark">食</span><h3>{recipe.title}</h3><p>{recipe.ingredients}</p><strong>查看菜谱详情 →</strong></button><button className="cardRemove" onClick={() => deleteDialog(recipe.title, () => setData((current) => ({ ...current, recipes: current.recipes.filter((item) => item.id !== recipe.id) })))}>×</button></article>)}</div></section>
  </div>;
}

function NotesView({ space, data, setData, selectedPage, setSelectedPage, setDialog, deleteDialog }: CollectionProps & { space: "thoughts" | "free"; selectedPage: string; setSelectedPage: (id: string) => void }) {
  const nodes = data.pages.filter((item) => item.space === space); const selected = nodes.find((item) => item.id === selectedPage) ?? nodes.find((item) => item.kind === "page") ?? nodes[0];
  useEffect(() => { if (selected && selected.id !== selectedPage) setSelectedPage(selected.id); }, [selected, selectedPage, setSelectedPage]);
  const addNode = (kind: "folder" | "page", parentId: string | null = selected?.kind === "folder" ? selected.id : selected?.parentId ?? null) => setDialog({ title: kind === "folder" ? "新建文件夹" : "新建页面", description: parentId ? "将创建在当前层级中。" : "将创建在根目录。", submitLabel: "创建", fields: [{ name: "title", label: "名称", placeholder: kind === "folder" ? "文件夹名称" : "页面标题" }], onSubmit: (values) => { const id = uid(); setData((current) => ({ ...current, pages: [...current.pages, { id, space, parentId, title: values.title || (kind === "folder" ? "未命名文件夹" : "未命名页面"), kind, blocks: kind === "page" ? starterBlocks("开始记录") : [] }] })); setSelectedPage(id); } });
  const children = (parentId: string | null) => nodes.filter((item) => item.parentId === parentId);
  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => children(parentId).map((node) => <div className="treeBranch" key={node.id} style={{ "--depth": depth } as React.CSSProperties}><button className={`treeNode ${selected?.id === node.id ? "active" : ""}`} onClick={() => setSelectedPage(node.id)}><span className="treeGlyph">{node.kind === "folder" ? "▾" : "·"}</span><span>{node.title}</span></button>{node.kind === "folder" && <div className="treeChildren">{renderTree(node.id, depth + 1)}</div>}</div>);
  return <div className="page notesPage"><PageHead eyebrow={space === "thoughts" ? "思考集" : "自由空间"} title={space === "thoughts" ? "让想法长成结构" : "按你的方式继续扩展"} subtitle="支持多级文件夹，以及标题、清单、图片、表格和链接" /><section className="notesShell"><aside className="treePanel"><div className="treeActions"><button onClick={() => addNode("folder", null)}>＋ 根文件夹</button><button onClick={() => addNode("page")}>＋ 页面</button></div><div className="treeRootLabel">{space === "thoughts" ? "思考集根目录" : "自由空间根目录"}</div><div className="treeList">{renderTree(null)}</div></aside><div className="editorArea">{selected ? selected.kind === "page" ? <><div className="editorTop"><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item) }))} /><button className="textButton dangerText" onClick={() => deleteDialog(selected.title, () => setData((current) => ({ ...current, pages: current.pages.filter((item) => item.id !== selected.id) })))}>移除页面</button></div><BlockEditor blocks={selected.blocks} onChange={(blocks) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, blocks } : item) }))} /></> : <div className="folderLanding"><span className="largeFolder">▰</span><p className="eyebrow">文件夹</p><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((item) => item.id === selected.id ? { ...item, title: event.target.value } : item) }))} /><p>此文件夹包含 {children(selected.id).length} 项内容。你可以继续创建任意层级。</p><div className="folderActions"><button className="primaryButton" onClick={() => addNode("page", selected.id)}>＋ 新建页面</button><button className="softButton" onClick={() => addNode("folder", selected.id)}>＋ 子文件夹</button><button className="textButton dangerText" onClick={() => deleteDialog(selected.title, () => setData((current) => ({ ...current, pages: current.pages.filter((item) => item.id !== selected.id && item.parentId !== selected.id) })))}>移除文件夹</button></div></div> : <div className="emptyState"><h2>这里还是空的</h2><p>先创建一个根文件夹或页面。</p></div>}</div></section></div>;
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
  const versions = item.versions?.length ? item.versions : [fallbackVersion];
  const currentVersionId = item.currentVersionId ?? versions[0]?.id;
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
    patch({ versions: nextVersions, version: selected?.label ?? item.version, url: selected?.url ?? item.url });
  };

  return <DetailLayout eyebrow={`${item.status} · 工具集`} title={item.title} subtitle="用途、访问地址、多版本入口与迭代记录" back={back}>
    <div className="detailGrid"><div className="detailMain">
      <section className="panel detailSection">
        <SectionHead title="工具信息" subtitle="当前版本会作为工具集中的默认打开地址" />
        <div className="fieldGrid"><EditableField label="当前状态" value={item.status} onChange={(value) => patch({ status: value })} /><div className="currentVersionField"><span>当前版本</span><strong>{item.version || "未设置"}</strong><small>{item.url || "暂无访问链接"}</small></div><label className="editField wide"><span>用途说明</span><textarea value={item.description} onChange={(event) => patch({ description: event.target.value })} /></label></div>
        {item.url ? <a className="launchButton" href={item.url} target="_blank" rel="noreferrer">打开当前版本 ↗</a> : null}
      </section>

      <section className="panel detailSection versionManager">
        <SectionHead title="版本管理" subtitle={`保存每次部署的网址，需要时一键切换当前版本 · ${versions.length} 个版本`} />
        <div className="versionCreate">
          <label><span>版本名称</span><input value={newLabel} placeholder="例如：V5 / 1.2.0" onChange={(event) => setNewLabel(event.target.value)} /></label>
          <label><span>访问网址</span><input value={newUrl} placeholder="https://..." onChange={(event) => setNewUrl(event.target.value)} /></label>
          <label className="wide"><span>版本说明</span><textarea value={newNote} placeholder="这版新增了什么、保留原因或使用提示" onChange={(event) => setNewNote(event.target.value)} /></label>
          <button className="primaryButton" disabled={!newLabel.trim()} onClick={addVersion}>保存为新版本</button>
        </div>
        <div className="versionList">{versions.map((version) => {
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
    </div><aside className="detailAside"><div className="toolHero"><span>{item.title.slice(0, 1)}</span><strong>{item.title}</strong><small>版本 {item.version}</small></div><div className="tipCard"><strong>版本管理建议</strong><p>保留可用的旧网址</p><p>记录本版核心变化</p><p>指定默认打开版本</p><p>注明测试版或稳定版</p><p>保留回退入口</p></div></aside></div>
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
  const upload = (id: string, file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => patch(id, { url: String(reader.result) }); reader.readAsDataURL(file); };
  return <div className="blockEditor"><div className="blockToolbar"><span>插入</span><button onClick={() => add("heading")}>标题</button><button onClick={() => add("text")}>正文</button><button onClick={() => add("checklist")}>清单</button><button onClick={() => add("link")}>链接</button><button onClick={() => add("table")}>表格</button><button onClick={() => add("image")}>图片</button></div><div className="blocks">{blocks.map((block) => <div className={`editorBlock ${block.type}`} key={block.id}><span className="dragMark">⋮⋮</span>{block.type === "heading" && <input value={block.text ?? ""} placeholder="标题" onChange={(event) => patch(block.id, { text: event.target.value })} />}{block.type === "text" && <textarea value={block.text ?? ""} placeholder="输入正文…" onChange={(event) => patch(block.id, { text: event.target.value })} />}{block.type === "checklist" && <><button className={`habitCheck ${block.checked ? "done" : ""}`} onClick={() => patch(block.id, { checked: !block.checked })}>{block.checked ? "✓" : ""}</button><input value={block.text ?? ""} placeholder="清单项" onChange={(event) => patch(block.id, { text: event.target.value })} /></>}{block.type === "link" && <><input value={block.text ?? ""} placeholder="链接名称" onChange={(event) => patch(block.id, { text: event.target.value })} /><input value={block.url ?? ""} placeholder="https://" onChange={(event) => patch(block.id, { url: event.target.value })} /></>}{block.type === "image" && <div className="imageBlock">{block.url ? <Image src={block.url} alt={block.text || "内容图片"} width={900} height={520} unoptimized /> : <label><input type="file" accept="image/*" onChange={(event) => upload(block.id, event.target.files?.[0])} /><span>选择图片</span><small>图片保存在当前设备</small></label>}<input value={block.text ?? ""} placeholder="图片说明" onChange={(event) => patch(block.id, { text: event.target.value })} /></div>}{block.type === "table" && <TableBlock rows={block.rows ?? [["项目", "内容"]]} onChange={(rows) => patch(block.id, { rows })} />}<button className="blockRemove" aria-label="移除内容块" onClick={() => onChange(blocks.filter((entry) => entry.id !== block.id))}>×</button></div>)}</div></div>;
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
  return <aside className="pagePopup" role="status"><button className="popupClose" aria-label="关闭提醒" onClick={onClose}>×</button><span>{popup.eyebrow}</span><h2>{popup.title}</h2><p>{popup.body}</p><div><button className="primaryButton" onClick={onClose}>完成</button><button className="softButton" onClick={onSnooze}>5 分钟后</button></div></aside>;
}
