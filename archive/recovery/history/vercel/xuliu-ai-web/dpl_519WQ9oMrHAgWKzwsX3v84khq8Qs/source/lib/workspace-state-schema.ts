import { z } from "zod";
import { createInitialFinanceState, isValidLocalDate, isValidLocalTime, isValidMonthKey } from "./finance.ts";

const id = z.string().min(1).max(120);
const text = z.string().max(4_000);
const shortText = z.string().max(500);
const date = z.string().refine(isValidLocalDate);
const time = z.string().refine(isValidLocalTime);
const area = z.enum(["课内", "课外", "工作", "生活", "思考"]);
const researchStatus = z.enum(["收集箱", "研究中", "验证中", "已归档"]);

const block = z.object({
  id,
  type: z.enum(["heading", "text", "checklist", "image", "table", "link"]),
  text: text.optional(),
  checked: z.boolean().optional(),
  url: z.string().max(2_000_000).optional(),
  rows: z.array(z.array(shortText).max(30)).max(100).optional(),
}).strict();

const financeEntry = z.object({
  id,
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(100_000_000_00),
  category: z.string().min(1).max(40),
  date,
  time,
  note: z.string().max(500),
  relatedProject: z.string().max(200),
  createdAt: z.string().max(80),
  updatedAt: z.string().max(80),
  origin: z.enum(["manual", "ai"]),
}).strict();

export const workspaceStateSchema = z.object({
  version: z.literal(5),
  tasks: z.array(z.object({ id, title: shortText, area, source: shortText, due: date.optional(), done: z.boolean(), today: z.boolean(), elapsed: z.number().int().min(0).max(10_000_000) }).strict()).max(10_000),
  milestones: z.array(z.object({ id, courseId: id.optional(), title: shortText, date, time, location: shortText, requirements: text, area, done: z.boolean() }).strict()).max(10_000),
  courses: z.array(z.object({
    id, title: shortText, term: shortText, teacher: shortText, location: shortText, progress: z.number().int().min(0).max(100), requirements: text,
    schedule: z.array(z.object({ id, weekday: z.number().int().min(1).max(7), start: time, end: time, location: shortText, weeks: shortText.optional(), source: z.enum(["manual", "pku", "bit", "ics"]).optional() }).strict()).max(1_000),
    blocks: z.array(block).max(2_000),
  }).strict()).max(2_000),
  learning: z.array(z.object({
    id, title: shortText, category: shortText, progress: z.number().int().min(0).max(100), goal: text,
    resources: z.array(z.object({ id, title: shortText, type: shortText, url: z.string().max(2_000), progress: z.number().int().min(0).max(100) }).strict()).max(2_000),
    blocks: z.array(block).max(2_000),
  }).strict()).max(2_000),
  research: z.array(z.object({
    id, title: shortText, status: researchStatus, summary: text, objective: text, next: text, progress: z.number().int().min(0).max(100),
    pages: z.array(z.object({ id, title: shortText, blocks: z.array(block).max(2_000) }).strict()).min(1).max(2_000),
  }).strict()).max(2_000),
  ideas: z.array(z.object({ id, title: shortText, note: text, createdAt: z.string().max(80) }).strict()).max(10_000),
  tools: z.array(z.object({
    id, title: shortText, status: shortText, description: text, url: z.string().max(2_000), version: shortText,
    currentVersionId: id.optional(),
    versions: z.array(z.object({ id, label: shortText, url: z.string().max(2_000), note: text, createdAt: z.string().max(80) }).strict()).max(2_000).optional(),
    blocks: z.array(block).max(2_000),
  }).strict()).max(2_000),
  habits: z.array(z.object({
    id, title: shortText, streak: z.number().int().min(0).max(10_000_000), today: z.boolean(), schedule: shortText,
    lastCompletedDate: date.optional(),
  }).strict()).max(2_000),
  routines: z.array(z.object({ id, title: shortText, note: text }).strict()).max(2_000),
  reminders: z.array(z.object({
    id, title: shortText, type: z.enum(["exercise", "break", "sleep", "custom"]), times: z.array(time).max(12), time: time.optional(),
    intervalMinutes: z.number().int().min(1).max(1_440).optional(), enabled: z.boolean(), lastFired: z.string().max(80).optional(), snoozedUntil: z.number().int().nonnegative().optional(),
  }).strict().superRefine((reminder, context) => {
    const hasTime = reminder.times.length > 0 || Boolean(reminder.time);
    const hasInterval = reminder.type === "break" && Boolean(reminder.intervalMinutes);
    if (reminder.enabled && !hasTime && !hasInterval) {
      context.addIssue({ code: "custom", message: "启用的提醒必须包含提醒时间或休息间隔" });
    }
  })).max(2_000),
  media: z.array(z.object({ id, title: shortText, kind: z.enum(["书籍", "动画", "影视"]), status: z.enum(["正在看", "想看", "书单"]), progress: shortText, blocks: z.array(block).max(2_000) }).strict()).max(2_000),
  recipes: z.array(z.object({ id, title: shortText, ingredients: text, note: text, blocks: z.array(block).max(2_000) }).strict()).max(2_000),
  pages: z.array(z.object({ id, space: z.enum(["thoughts", "free"]), parentId: id.nullable(), title: shortText, kind: z.enum(["folder", "page"]), blocks: z.array(block).max(2_000) }).strict()).max(10_000),
  daily: z.record(date, z.object({ note: text, gain: text, problem: text, feeling: text, tomorrow: text }).strict()),
  timeEntries: z.array(z.object({ id, taskId: id, minutes: z.number().int().min(1).max(1_440), date, mode: shortText }).strict()).max(20_000),
  finance: z.object({
    entries: z.array(financeEntry).max(20_000),
    budgets: z.record(z.string().refine(isValidMonthKey), z.object({ totalCents: z.number().int().nonnegative().max(100_000_000_00), categoryCents: z.record(z.string().min(1).max(40), z.number().int().nonnegative().max(100_000_000_00)) }).strict()),
    expenseCategories: z.array(z.string().min(1).max(40)).max(200),
    incomeCategories: z.array(z.string().min(1).max(40)).max(200),
  }).strict(),
  themes: z.record(z.string().max(40), z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
}).strict();

export function createEmptyWorkspaceState() {
  return {
    version: 5 as const,
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
    themes: {},
  };
}
