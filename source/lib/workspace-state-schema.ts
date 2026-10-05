import { z } from "zod";
import { STUDY_AUTOMATION_RULE_VERSION } from "./study-task-automation.ts";
import { createInitialFinanceState, isValidLocalDate, isValidLocalTime, isValidMonthKey } from "./finance.ts";
import { parentError } from "./task-time.ts";
import { MAX_COLLECTION_WEBSITES, normalizeWebsiteUrl } from "./tool-collections.ts";

const id = z.string().min(1).max(120);
const text = z.string().max(4_000);
const shortText = z.string().max(500);
const date = z.string().refine(isValidLocalDate);
const time = z.string().refine(isValidLocalTime);
const area = z.enum(["课内", "课外", "工作", "生活", "思考"]);
const researchStatus = z.enum(["收集箱", "研究中", "验证中", "已归档"]);
const taskStatus = z.enum(["未开始", "进行中", "已暂停", "已完成"]);
const taskProgressLog = z.object({
  id,
  date,
  progress: z.number().int().min(0).max(100),
  status: taskStatus,
  note: shortText,
}).strict();

const inlineRun = z.object({
  text,
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontSize: z.enum(["small", "normal", "large", "xlarge"]).optional(),
  fontFamily: z.enum(["sans", "serif", "mono"]).optional(),
}).strict();

const embeddedImage = z.object({
  id,
  url: z.string().url().regex(/^https:\/\//i).max(2_000),
  fileName: z.string().min(1).max(300),
  fileSize: z.number().int().nonnegative().max(50 * 1024 * 1024),
  mimeType: z.string().regex(/^image\/(jpeg|png|webp|gif)$/i).max(200),
  uploadedAt: z.string().max(80),
  caption: shortText.optional(),
}).strict();

const storedAttachment = z.object({
  id,
  url: z.string().url().regex(/^https:\/\//i).max(2_000),
  fileName: z.string().min(1).max(300),
  fileSize: z.number().int().nonnegative().max(50 * 1024 * 1024),
  mimeType: z.string().min(1).max(200),
  uploadedAt: z.string().max(80),
}).strict();

const block = z.object({
  id,
  type: z.enum(["heading", "text", "checklist", "image", "table", "link", "file"]),
  text: text.optional(),
  checked: z.boolean().optional(),
  url: z.string().max(2_000_000).optional(),
  rows: z.array(z.array(shortText).max(30)).max(100).optional(),
  inlineRuns: z.array(inlineRun).max(2_000).optional(),
  embeddedImages: z.array(embeddedImage).max(50).optional(),
  embeddedFiles: z.array(storedAttachment).max(50).optional(),
  fileName: z.string().max(300).optional(),
  fileSize: z.number().int().nonnegative().max(50 * 1024 * 1024).optional(),
  mimeType: z.string().max(200).optional(),
  uploadedAt: z.string().max(80).optional(),
  headingLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontSize: z.enum(["small", "normal", "large", "xlarge"]).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  fontFamily: z.enum(["sans", "serif", "mono"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.inlineRuns && value.inlineRuns.map((run) => run.text).join("") !== (value.text ?? "")) {
    context.addIssue({ code: "custom", message: "局部文字格式与正文不一致" });
  }
});

const financeEntry = z.object({
  id,
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(100_000_000_00),
  category: z.string().min(1).max(40),
  date,
  time,
  note: z.string().max(500),
  purpose: z.string().max(80).optional(),
  relatedProject: z.string().max(200),
  createdAt: z.string().max(80),
  updatedAt: z.string().max(80),
  origin: z.enum(["manual", "ai", "wechat"]),
  merchant: z.string().max(200).optional(),
}).strict();

export const workspaceStateSchema = z.object({
  version: z.literal(6),
  tasks: z.array(z.object({
    id, title: shortText, area, source: shortText, due: date.optional(), done: z.boolean(), today: z.boolean(), elapsed: z.number().int().min(0).max(10_000_000),
    parentId: id.optional(), parentMilestoneId: id.optional(), courseId: id.optional(), blocks: z.array(block).max(2000).optional(),
    requirements: text.optional(), attachments: z.array(storedAttachment).max(50).optional(), parentCandidate: z.boolean().optional(),
    mode: z.enum(["single", "multi"]).optional(), startDate: date.optional(), dueTime: time.optional(), plannedDate: date.optional(), status: taskStatus.optional(), progress: z.number().int().min(0).max(100).optional(), progressLogs: z.array(taskProgressLog).max(2_000).optional(),
  }).strict().superRefine((task, context) => {
    if (task.mode === "multi" && task.startDate && task.due && task.startDate > task.due) context.addIssue({ code: "custom", message: "跨日任务开始日期不能晚于截止日期" });
    if (task.dueTime && !task.due) context.addIssue({ code: "custom", message: "设置截止时间前请先选择截止日期" });
  })).max(10_000),
  milestones: z.array(z.object({ id, courseId: id.optional(), automationKey: shortText.optional(), title: shortText, date, time, plannedDate: date.optional(), location: shortText, requirements: text, attachments: z.array(storedAttachment).max(50).optional(), outcomeText: text.optional(), outcomeAttachments: z.array(storedAttachment).max(50).optional(), blocks: z.array(block).max(2000).optional(), elapsed: z.number().int().min(0).max(10000000).optional(), mode: z.enum(["single", "multi"]).optional(), parentCandidate: z.boolean().optional(), area, done: z.boolean() }).strict()).max(10_000),
  courses: z.array(z.object({
    id, title: shortText, term: shortText, teacher: shortText, location: shortText, school: z.enum(["pku", "bit"]).optional(), progress: z.number().int().min(0).max(100), requirements: text,
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
    kind: z.enum(["tool", "collection"]).optional(),
    websites: z.array(z.object({
      id, title: shortText.trim().min(1), description: shortText,
      url: z.string().max(2_000).url().refine((value) => /^https?:\/\//i.test(value) && normalizeWebsiteUrl(value) !== null),
    }).strict()).max(MAX_COLLECTION_WEBSITES).optional(),
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
  timeEntries: z.array(z.object({ id, taskId: id, targetKind: z.enum(["task", "milestone"]).optional(), minutes: z.number().int().min(1).max(1_440), date, mode: shortText, note: shortText.optional() }).strict()).max(20_000),
  focusSettings: z.object({ minutes: z.number().int().min(1).max(180), sound: z.boolean(), volume: z.number().int().min(0).max(100) }).strict().optional(),
  timetableSettings: z.object({ termStartDate: date, activeSchool: z.enum(["pku", "bit"]) }).strict().optional(),
  studyAutomation: z.object({ enabled: z.boolean(), processedKeys: z.array(shortText).max(20_000), ruleVersion: z.number().int().min(1).max(100).optional() }).strict().optional(),
  finance: z.object({
    entries: z.array(financeEntry).max(20_000),
    budgets: z.record(z.string().refine(isValidMonthKey), z.object({ totalCents: z.number().int().nonnegative().max(100_000_000_00), categoryCents: z.record(z.string().min(1).max(40), z.number().int().nonnegative().max(100_000_000_00)) }).strict()),
    expenseCategories: z.array(z.string().min(1).max(40)).max(200),
    incomeCategories: z.array(z.string().min(1).max(40)).max(200),
    merchantCategories: z.record(z.string().min(1).max(200), z.string().min(1).max(40)).optional(),
    paymentRules: z.record(z.string().min(1).max(200), z.object({ category: z.string().min(1).max(40), purpose: z.string().max(80) }).strict()).optional(),
  }).strict(),
  themes: z.record(z.string().max(40), z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
}).strict().superRefine((state, context) => {
  const error = parentError(state.tasks, state.milestones);
  if (error) context.addIssue({ code: "custom", path: ["tasks"], message: error });
});

export function createEmptyWorkspaceState() {
  return {
    version: 6 as const,
    tasks: [],
    milestones: [],
    courses: [],
    learning: [
      { id: "learning-default-development", title: "开发", category: "技术", progress: 0, goal: "", resources: [], blocks: [] },
      { id: "learning-default-professional", title: "专业学习", category: "专业", progress: 0, goal: "", resources: [], blocks: [] },
      { id: "learning-default-photography", title: "摄影", category: "兴趣", progress: 0, goal: "", resources: [], blocks: [] },
      { id: "learning-default-japanese", title: "日语", category: "语言", progress: 0, goal: "", resources: [], blocks: [] },
    ],
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
    timetableSettings: { termStartDate: "2026-08-31", activeSchool: "pku" as const },
    studyAutomation: { enabled: true, processedKeys: [], ruleVersion: STUDY_AUTOMATION_RULE_VERSION },
    finance: createInitialFinanceState(),
    themes: {},
  };
}
