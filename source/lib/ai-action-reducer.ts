import "server-only";

import { z } from "zod";
import { createInitialFinanceState, isValidLocalDate, isValidLocalTime, normalizeFinanceState, type FinanceEntry } from "./finance";
import type { AiEntity, AiOperation, AiWorkspaceProposalInput } from "./ai-action-schema";

type JsonObject = Record<string, unknown>;

const areaSchema = z.enum(["课内", "课外", "工作", "生活", "思考"]);
const shortText = z.string().trim().max(500);
const longText = z.string().max(4_000);
const percentage = z.number().int().min(0).max(100);
const positiveMinutes = z.number().int().min(1).max(24 * 60);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().refine(isValidLocalDate, "日期无效");
const safeUrlSchema = z.string().max(2_000).refine((value) => !value || /^https?:\/\//i.test(value), "链接必须使用 http 或 https");

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function objectArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function referenceName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as JsonObject;
  return typeof candidate.$ref === "string" ? candidate.$ref : null;
}

function resolveReference(value: unknown, references: Map<string, string>, label: string) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  const name = referenceName(value);
  if (!name) throw new Error(`${label}格式无效`);
  const id = references.get(name);
  if (!id) throw new Error(`${label}引用了尚未创建的 ref “${name}”`);
  return id;
}

function resolveEntityValues(rawValues: Record<string, unknown>, references: Map<string, string>) {
  const values = { ...rawValues };
  for (const key of ["parentId", "courseId", "taskId"] as const) {
    if (referenceName(values[key])) values[key] = resolveReference(values[key], references, key);
  }
  return values;
}

function contentBlocks(content: string) {
  const nowId = () => crypto.randomUUID();
  return [
    { id: nowId(), type: "heading", text: "AI 整理" },
    { id: nowId(), type: "text", text: content || "从这里继续记录。" },
  ];
}

function researchPages(content = "") {
  return [
    { id: crypto.randomUUID(), title: "研究总览", blocks: contentBlocks(content || "研究目标、范围与当前判断") },
    { id: crypto.randomUUID(), title: "资料与线索", blocks: contentBlocks("资料、证据与待核实线索") },
    { id: crypto.randomUUID(), title: "阶段结论", blocks: contentBlocks("阶段判断与下一步") },
  ];
}

function chinaTimeKey() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

function chinaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseEntityValues(entity: AiEntity, values: Record<string, unknown>) {
  const schemas: Record<AiEntity, z.ZodType> = {
    task: z.object({ title: shortText, requirements: longText, parentCandidate: z.boolean(), courseId: z.string().max(120).nullable(), area: areaSchema, source: shortText, due: dateSchema.nullable(), done: z.boolean(), today: z.boolean(), mode: z.enum(["single", "multi"]), startDate: dateSchema.nullable(), status: z.enum(["未开始", "进行中", "已暂停", "已完成"]), progress: percentage }).partial().strict(),
    milestone: z.object({ title: shortText, date: dateSchema, time: timeSchema, location: shortText, requirements: longText, area: areaSchema, done: z.boolean(), courseId: z.string().max(120).nullable(), mode: z.enum(["single", "multi"]), parentCandidate: z.boolean() }).partial().strict(),
    course: z.object({ title: shortText, term: shortText, teacher: shortText, location: shortText, progress: percentage, requirements: longText, content: longText }).partial().strict(),
    courseSlot: z.object({ weekday: z.number().int().min(1).max(7), start: timeSchema, end: timeSchema, location: shortText, weeks: shortText }).partial().strict(),
    learning: z.object({ title: shortText, category: shortText, progress: percentage, goal: longText, content: longText }).partial().strict(),
    learningResource: z.object({ title: shortText, type: shortText, url: safeUrlSchema, progress: percentage }).partial().strict(),
    research: z.object({ title: shortText, status: z.enum(["收集箱", "研究中", "验证中", "已归档"]), summary: longText, objective: longText, next: longText, progress: percentage, content: longText }).partial().strict(),
    researchPage: z.object({ title: shortText, content: longText }).partial().strict(),
    idea: z.object({ title: shortText, note: longText }).partial().strict(),
    tool: z.object({ title: shortText, status: shortText, description: longText, url: safeUrlSchema, version: shortText, content: longText }).partial().strict(),
    toolVersion: z.object({ label: shortText, url: safeUrlSchema, note: longText, makeCurrent: z.boolean() }).partial().strict(),
    habit: z.object({ title: shortText, today: z.boolean(), schedule: shortText }).partial().strict(),
    reminder: z.object({ title: shortText, type: z.enum(["exercise", "break", "sleep", "custom"]), times: z.array(timeSchema).max(12), intervalMinutes: z.number().int().min(1).max(1_440).nullable(), enabled: z.boolean() }).partial().strict(),
    media: z.object({ title: shortText, kind: z.enum(["书籍", "动画", "影视"]), status: z.enum(["正在看", "想看", "书单"]), progress: shortText, content: longText }).partial().strict(),
    recipe: z.object({ title: shortText, ingredients: longText, note: longText, content: longText }).partial().strict(),
    page: z.object({ title: shortText, space: z.enum(["thoughts", "free"]), parentId: z.string().max(120).nullable(), kind: z.enum(["folder", "page"]), content: longText }).partial().strict(),
    focusEntry: z.object({ taskId: z.string().min(1).max(120), minutes: positiveMinutes, date: dateSchema, mode: z.enum(["pomodoro", "stopwatch", "manual", "ai"]) }).partial().strict(),
  };
  return schemas[entity].parse(values) as JsonObject;
}

function requireTitle(entity: AiEntity, values: JsonObject) {
  if (["courseSlot", "focusEntry"].includes(entity)) return;
  if (entity === "toolVersion") {
    if (typeof values.label !== "string" || !values.label.trim()) throw new Error("新增工具版本缺少版本名称");
    return;
  }
  if (typeof values.title !== "string" || !values.title.trim()) throw new Error("新增内容缺少标题");
}

function defaultsFor(entity: AiEntity): JsonObject {
  const defaults: Record<AiEntity, JsonObject> = {
    task: { title: "", requirements: "", parentCandidate: false, area: "思考", source: "AI 助手", done: false, today: false, elapsed: 0, mode: "single", status: "未开始", progress: 0, progressLogs: [] },
    milestone: { title: "", date: "", time: "00:00", location: "", requirements: "", area: "思考", done: false },
    course: { title: "", term: "", teacher: "", location: "", progress: 0, requirements: "", schedule: [], blocks: contentBlocks("") },
    courseSlot: { weekday: 1, start: "08:00", end: "09:00", location: "", weeks: "", source: "manual" },
    learning: { title: "", category: "自主学习", progress: 0, goal: "", resources: [], blocks: contentBlocks("") },
    learningResource: { title: "", type: "资料", url: "", progress: 0 },
    research: { title: "", status: "收集箱", summary: "", objective: "", next: "", progress: 0, pages: researchPages() },
    researchPage: { title: "", blocks: contentBlocks("") },
    idea: { title: "", note: "", createdAt: new Date().toISOString() },
    tool: { title: "", status: "想法", description: "", url: "", version: "构思", versions: [], blocks: contentBlocks("") },
    toolVersion: { label: "", url: "", note: "", createdAt: new Date().toISOString() },
    habit: { title: "", streak: 0, today: false, schedule: "每天" },
    reminder: { title: "", type: "custom", times: [], enabled: true },
    media: { title: "", kind: "书籍", status: "想看", progress: "未开始", blocks: contentBlocks("") },
    recipe: { title: "", ingredients: "", note: "", blocks: contentBlocks("") },
    page: { title: "", space: "thoughts", parentId: null, kind: "page", blocks: contentBlocks("") },
    focusEntry: { taskId: "", minutes: 30, date: chinaDateKey(), mode: "ai" },
  };
  return defaults[entity];
}

function withContent(target: JsonObject, values: JsonObject, entity: AiEntity) {
  const { content, ...rest } = values;
  const next = { ...target, ...rest };
  if (typeof content === "string") {
    if (entity === "research") {
      const pages = objectArray(next.pages);
      const first = pages[0] ?? { id: crypto.randomUUID(), title: "研究总览", blocks: [] };
      next.pages = [{ ...first, blocks: contentBlocks(content) }, ...pages.slice(1)];
      delete next.blocks;
    } else next.blocks = contentBlocks(content);
  }
  if (entity === "task" && next.due === null) delete next.due;
  if (entity === "task" && next.startDate === null) delete next.startDate;
  if (entity === "task" && next.courseId === null) delete next.courseId;
  if (entity === "task") {
    next.mode = next.mode === "multi" ? "multi" : "single";
    next.progress = Math.min(100, Math.max(0, Math.round(Number(next.progress) || 0)));
    if (!["未开始", "进行中", "已暂停", "已完成"].includes(String(next.status ?? ""))) next.status = Number(next.progress) > 0 ? "进行中" : "未开始";
    if (!Array.isArray(next.progressLogs)) next.progressLogs = [];
    if (next.done === true || next.status === "已完成" || Number(next.progress ?? 0) >= 100) {
      next.done = true;
      next.status = "已完成";
      next.progress = 100;
    } else {
      next.done = false;
      if (Number(next.progress ?? 0) > 0 && next.status === "未开始") next.status = "进行中";
    }
    if (next.mode !== "multi") delete next.startDate;
  }
  if (entity === "milestone") {
    if (next.courseId === null) delete next.courseId;
    if (next.courseId) {
      next.mode = next.mode === "multi" ? "multi" : "single";
      next.parentCandidate = next.parentCandidate ?? next.mode === "multi";
    } else {
      delete next.mode;
      delete next.parentCandidate;
    }
  }
  if (entity === "reminder" && next.intervalMinutes === null) delete next.intervalMinutes;
  return next;
}

function validateReminder(item: JsonObject) {
  const times = Array.isArray(item.times) ? item.times : [];
  const interval = Number(item.intervalMinutes ?? 0);
  if (item.type === "break") {
    if (!times.length && !(interval > 0)) throw new Error("休息提醒必须设置时间或间隔分钟数");
  } else if (!times.length) throw new Error("提醒必须至少设置一个时间");
}

const collectionByEntity: Partial<Record<AiEntity, string>> = {
  task: "tasks",
  milestone: "milestones",
  course: "courses",
  learning: "learning",
  research: "research",
  idea: "ideas",
  tool: "tools",
  habit: "habits",
  reminder: "reminders",
  media: "media",
  recipe: "recipes",
  page: "pages",
  focusEntry: "timeEntries",
};

const nestedEntity: Partial<Record<AiEntity, { parentCollection: string; childCollection: string }>> = {
  courseSlot: { parentCollection: "courses", childCollection: "schedule" },
  learningResource: { parentCollection: "learning", childCollection: "resources" },
  researchPage: { parentCollection: "research", childCollection: "pages" },
  toolVersion: { parentCollection: "tools", childCollection: "versions" },
};

function findOrThrow(items: JsonObject[], id: string, label: string) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`${label}不存在或已经被移除`);
  return item;
}

function adjustTaskMinutes(state: JsonObject, taskId: string, delta: number, targetKind: unknown = "task") {
  const collection = targetKind === "milestone" ? "milestones" : "tasks";
  const tasks = objectArray(state[collection]);
  findOrThrow(tasks, taskId, "关联任务");
  state[collection] = tasks.map((task) => task.id === taskId
    ? { ...task, elapsed: Math.max(0, Number(task.elapsed ?? 0) + delta) }
    : task);
}

function createEntity(state: JsonObject, entity: AiEntity, parentId: string | undefined, rawValues: Record<string, unknown>) {
  const values = parseEntityValues(entity, rawValues);
  requireTitle(entity, values);
  const id = crypto.randomUUID();
  let item = withContent({ ...defaultsFor(entity), id }, values, entity);

  if (entity === "task" && item.mode === "multi" && item.startDate && item.due && String(item.startDate) > String(item.due)) throw new Error("跨日任务开始日期不能晚于截止日期");
  if (entity === "task" && (Number(item.progress ?? 0) > 0 || item.status !== "未开始")) item.progressLogs = [{ id: crypto.randomUUID(), date: chinaDateKey(), progress: Number(item.progress ?? 0), status: item.status, note: "由 AI 创建任务" }];
  if (entity === "milestone" && !isValidLocalDate(String(item.date ?? ""))) throw new Error("日历事项缺少有效日期");
  if (entity === "reminder") validateReminder(item);
  if (entity === "habit" && item.today === true) {
    item.streak = 1;
    item.lastCompletedDate = chinaDateKey();
  }

  if (["task", "milestone"].includes(entity) && item.courseId) {
    findOrThrow(objectArray(state.courses), String(item.courseId), "关联课程");
  }
  if (entity === "page" && item.parentId) {
    const parent = findOrThrow(objectArray(state.pages), String(item.parentId), "父级文件夹");
    if (parent.kind !== "folder" || parent.space !== item.space) throw new Error("笔记父级必须是同一空间中的文件夹");
  }
  if (entity === "focusEntry") {
    const taskId = String(item.taskId ?? "");
    const minutes = Number(item.minutes ?? 0);
    adjustTaskMinutes(state, taskId, minutes);
  }

  const nested = nestedEntity[entity];
  if (nested) {
    if (!parentId) throw new Error("缺少父级 ID");
    const parents = objectArray(state[nested.parentCollection]);
    const parent = findOrThrow(parents, parentId, "父级内容");
    const children = objectArray(parent[nested.childCollection]);
    if (entity === "courseSlot" && String(item.start) >= String(item.end)) throw new Error("课程结束时间必须晚于开始时间");
    if (entity === "toolVersion") {
      delete item.makeCurrent;
      parent.currentVersionId = id;
      parent.version = item.label;
      parent.url = item.url;
    }
    parent[nested.childCollection] = [...children, item];
    state[nested.parentCollection] = parents.map((candidate) => candidate.id === parentId ? parent : candidate);
    return id;
  }

  const collection = collectionByEntity[entity];
  if (!collection) throw new Error("不支持的内容类型");
  state[collection] = [...objectArray(state[collection]), item];
  return id;
}

function updateEntity(state: JsonObject, entity: AiEntity, id: string, parentId: string | undefined, rawValues: Record<string, unknown>) {
  const values = parseEntityValues(entity, rawValues);
  const nested = nestedEntity[entity];
  if (nested) {
    if (!parentId) throw new Error("缺少父级 ID");
    const parents = objectArray(state[nested.parentCollection]);
    const parent = findOrThrow(parents, parentId, "父级内容");
    const children = objectArray(parent[nested.childCollection]);
    const current = findOrThrow(children, id, "目标内容");
    const next = withContent(current, values, entity);
    if (entity === "courseSlot" && String(next.start) >= String(next.end)) throw new Error("课程结束时间必须晚于开始时间");
    if (entity === "toolVersion") {
      const makeCurrent = values.makeCurrent === true;
      delete next.makeCurrent;
      if (makeCurrent || parent.currentVersionId === id) {
        parent.currentVersionId = id;
        parent.version = next.label;
        parent.url = next.url;
      }
    }
    parent[nested.childCollection] = children.map((child) => child.id === id ? next : child);
    state[nested.parentCollection] = parents.map((candidate) => candidate.id === parentId ? parent : candidate);
    return;
  }

  const collection = collectionByEntity[entity];
  if (!collection) throw new Error("不支持的内容类型");
  const items = objectArray(state[collection]);
  const current = findOrThrow(items, id, "目标内容");
  const next = withContent(current, values, entity);

  if (entity === "task" && next.mode === "multi" && next.startDate && next.due && String(next.startDate) > String(next.due)) throw new Error("跨日任务开始日期不能晚于截止日期");
  if (entity === "task" && (Number(next.progress ?? 0) !== Number(current.progress ?? 0) || next.status !== current.status || next.done !== current.done)) {
    next.progressLogs = [...objectArray(current.progressLogs).slice(-1_999), { id: crypto.randomUUID(), date: chinaDateKey(), progress: Number(next.progress ?? 0), status: next.status, note: "由 AI 更新任务" }];
  }
  if (["task", "milestone"].includes(entity) && next.courseId) findOrThrow(objectArray(state.courses), String(next.courseId), "关联课程");
  if (entity === "page") {
    const descendants = pageDescendantIds(items, id);
    if (current.kind === "folder" && descendants.size > 1 && (next.kind !== "folder" || next.space !== current.space)) {
      throw new Error("含有后代的笔记父级不能改变类型或跨空间移动");
    }
    if (next.parentId) {
      const parent = findOrThrow(objectArray(state.pages), String(next.parentId), "父级文件夹");
      if (descendants.has(String(parent.id)) || parent.kind !== "folder" || parent.space !== next.space) throw new Error("笔记父级必须是同一空间中、且不属于当前页面后代的文件夹");
    }
  }
  if (entity === "focusEntry") {
    const oldTaskId = String(current.taskId ?? "");
    const oldMinutes = Number(current.minutes ?? 0);
    const nextTaskId = String(next.taskId ?? "");
    const nextMinutes = Number(next.minutes ?? 0);
    adjustTaskMinutes(state, oldTaskId, -oldMinutes, current.targetKind);
    adjustTaskMinutes(state, nextTaskId, nextMinutes, next.targetKind);
  }
  if (entity === "habit" && typeof values.today === "boolean" && values.today !== current.today) {
    const currentDate = chinaDateKey();
    const previousDate = chinaDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    if (values.today) {
      next.streak = current.lastCompletedDate === previousDate ? Number(current.streak ?? 0) + 1 : 1;
      next.lastCompletedDate = currentDate;
    } else {
      next.streak = Math.max(0, Number(current.streak ?? 0) - 1);
      if (Number(next.streak) > 0) next.lastCompletedDate = previousDate;
      else delete next.lastCompletedDate;
    }
  }
  if (entity === "reminder") validateReminder(next);
  state[collection] = items.map((item) => item.id === id ? next : item);
}

function pageDescendantIds(pages: JsonObject[], rootId: string) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages) {
      if (typeof page.id === "string" && typeof page.parentId === "string" && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        changed = true;
      }
    }
  }
  return ids;
}

function deleteEntity(state: JsonObject, entity: AiEntity, id: string, parentId: string | undefined) {
  const nested = nestedEntity[entity];
  if (nested) {
    if (!parentId) throw new Error("缺少父级 ID");
    const parents = objectArray(state[nested.parentCollection]);
    const parent = findOrThrow(parents, parentId, "父级内容");
    const children = objectArray(parent[nested.childCollection]);
    findOrThrow(children, id, "目标内容");
    const remaining = children.filter((child) => child.id !== id);
    if (entity === "researchPage" && !remaining.length) throw new Error("研究项目必须至少保留一个页面");
    parent[nested.childCollection] = remaining;
    if (entity === "toolVersion" && parent.currentVersionId === id) {
      const replacement = remaining[0];
      parent.currentVersionId = replacement?.id;
      parent.version = replacement?.label ?? "构思";
      parent.url = replacement?.url ?? "";
    }
    state[nested.parentCollection] = parents.map((candidate) => candidate.id === parentId ? parent : candidate);
    return;
  }

  const collection = collectionByEntity[entity];
  if (!collection) throw new Error("不支持的内容类型");
  const items = objectArray(state[collection]);
  const current = findOrThrow(items, id, "目标内容");

  if (entity === "focusEntry") adjustTaskMinutes(state, String(current.taskId ?? ""), -Number(current.minutes ?? 0), current.targetKind);
  if (entity === "task") {
    state.timeEntries = objectArray(state.timeEntries).filter((entry) => entry.taskId !== id || entry.targetKind === "milestone");
    for (const child of items) if (child.parentId === id) delete child.parentId;
  }
  if (entity === "milestone") {
    state.timeEntries = objectArray(state.timeEntries).filter((entry) => entry.taskId !== id || entry.targetKind !== "milestone");
    state.tasks = objectArray(state.tasks).map(task => { if (task.parentMilestoneId !== id) return task; const next = { ...task }; delete next.parentMilestoneId; return next; });
  }
  if (entity === "course") state.milestones = objectArray(state.milestones).map((milestone) => milestone.courseId === id ? { ...milestone, courseId: undefined } : milestone);
  if (entity === "page") {
    const ids = pageDescendantIds(items, id);
    state.pages = items.filter((page) => typeof page.id !== "string" || !ids.has(page.id));
    return;
  }
  state[collection] = items.filter((item) => item.id !== id);
}

type FinanceOperation = Extract<AiOperation, { kind: "finance.entry.create" | "finance.entry.update" | "finance.entry.delete" | "finance.budget.set" | "finance.budget.remove" }>;

function applyFinanceOperation(state: JsonObject, operation: FinanceOperation) {
  const finance = normalizeFinanceState(state.finance ?? createInitialFinanceState());
  if (operation.kind === "finance.entry.create") {
    if (!isValidLocalDate(operation.values.date)) throw new Error("记账日期无效");
    const duplicate = finance.entries.some((entry) => entry.type === operation.values.type
      && entry.amountCents === operation.values.amountCents
      && entry.category === operation.values.category
      && entry.date === operation.values.date
      && entry.note.trim() === operation.values.note.trim());
    if (duplicate && !operation.values.allowDuplicate) throw new Error("发现可能重复的账目，请明确说明仍要添加后再试");
    const now = new Date().toISOString();
    const entry: FinanceEntry = {
      id: crypto.randomUUID(),
      type: operation.values.type,
      amountCents: operation.values.amountCents,
      category: operation.values.category,
      date: operation.values.date,
      time: operation.values.time ?? chinaTimeKey(),
      note: operation.values.note,
      relatedProject: operation.values.relatedProject,
      createdAt: now,
      updatedAt: now,
      origin: "ai",
    };
    finance.entries = [entry, ...finance.entries];
    const categoryKey = entry.type === "income" ? "incomeCategories" : "expenseCategories";
    finance[categoryKey] = [...new Set([...finance[categoryKey], entry.category])];
  } else if (operation.kind === "finance.entry.update") {
    const current = finance.entries.find((entry) => entry.id === operation.id);
    if (!current) throw new Error("记账记录不存在或已经被移除");
    const next = { ...current, ...operation.values, updatedAt: new Date().toISOString(), origin: "ai" as const };
    if (!isValidLocalDate(next.date)) throw new Error("记账日期无效");
    if (!isValidLocalTime(next.time)) throw new Error("记账时间无效");
    if (!Number.isSafeInteger(next.amountCents) || next.amountCents <= 0 || next.amountCents > 100_000_000_00) throw new Error("记账金额无效");
    finance.entries = finance.entries.map((entry) => entry.id === operation.id ? next : entry);
    const categoryKey = next.type === "income" ? "incomeCategories" : "expenseCategories";
    finance[categoryKey] = [...new Set([...finance[categoryKey], next.category])];
  } else if (operation.kind === "finance.entry.delete") {
    if (!finance.entries.some((entry) => entry.id === operation.id)) throw new Error("记账记录不存在或已经被移除");
    finance.entries = finance.entries.filter((entry) => entry.id !== operation.id);
  } else if (operation.kind === "finance.budget.set") {
    const previous = finance.budgets[operation.month] ?? { totalCents: 0, categoryCents: {} };
    finance.budgets[operation.month] = operation.category === null
      ? { ...previous, totalCents: operation.limitCents }
      : { ...previous, categoryCents: { ...previous.categoryCents, [operation.category]: operation.limitCents } };
    if (operation.category !== null) finance.expenseCategories = [...new Set([...finance.expenseCategories, operation.category])];
  } else {
    const previous = finance.budgets[operation.month];
    if (!previous) throw new Error("该月份没有可移除的预算");
    if (operation.category === null) previous.totalCents = 0;
    else delete previous.categoryCents[operation.category];
    finance.budgets[operation.month] = previous;
  }
  state.finance = finance;
}

type BlockOperation = Extract<AiOperation, { kind: "block" }>;

function blockTarget(state: JsonObject, operation: BlockOperation) {
  if (operation.container === "researchPage") {
    const project = findOrThrow(objectArray(state.research), operation.parentId, "研究项目");
    const page = findOrThrow(objectArray(project.pages), operation.pageId!, "研究页面");
    return page;
  }
  const collectionMap: Record<Exclude<BlockOperation["container"], "researchPage">, string> = {
    course: "courses",
    learning: "learning",
    tool: "tools",
    media: "media",
    recipe: "recipes",
    page: "pages",
  };
  const target = findOrThrow(objectArray(state[collectionMap[operation.container]]), operation.parentId, "内容容器");
  if (operation.container === "page" && target.kind !== "page") throw new Error("文件夹不能包含内容块");
  return target;
}

function normalizedBlock(values: Record<string, unknown>, current?: JsonObject) {
  const type = String(values.type ?? current?.type ?? "");
  if (type === "image") {
    if (!current || values.type) throw new Error("AI 不能创建或替换图片块");
    const next: JsonObject = { ...current, text: typeof values.text === "string" ? values.text : current.text };
    if (typeof values.text === "string" && values.text !== current.text) delete next.inlineRuns;
    return next;
  }
  if (!["heading", "text", "checklist", "link", "table"].includes(type)) throw new Error("内容块类型无效");
  const base: JsonObject = { id: current?.id ?? crypto.randomUUID(), type };
  for (const key of ["headingLevel", "color", "backgroundColor", "fontSize", "fontWeight", "fontStyle", "textDecoration", "textAlign", "fontFamily"] as const) {
    if (current?.[key] !== undefined) base[key] = current[key];
  }
  if (current?.embeddedImages !== undefined) base.embeddedImages = current.embeddedImages;
  if (current?.embeddedFiles !== undefined) base.embeddedFiles = current.embeddedFiles;
  if (current?.inlineRuns !== undefined && (values.text === undefined || values.text === current.text)) base.inlineRuns = current.inlineRuns;
  if (type === "heading" || type === "text") {
    const text = values.text ?? current?.text;
    if (typeof text !== "string") throw new Error("内容块缺少文字");
    base.text = text;
  } else if (type === "checklist") {
    const text = values.text ?? current?.text;
    if (typeof text !== "string") throw new Error("清单块缺少文字");
    base.text = text;
    base.checked = typeof values.checked === "boolean" ? values.checked : Boolean(current?.checked);
  } else if (type === "link") {
    const url = values.url ?? current?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("链接块必须包含 http 或 https 链接");
    base.url = url;
    base.text = typeof (values.text ?? current?.text) === "string" ? values.text ?? current?.text : url;
  } else {
    const rows = values.rows ?? current?.rows;
    if (!Array.isArray(rows) || !rows.length) throw new Error("表格块缺少行列数据");
    base.rows = rows;
  }
  return base;
}

function applyBlockOperation(state: JsonObject, operation: BlockOperation) {
  const target = blockTarget(state, operation);
  const blocks = objectArray(target.blocks);
  if (operation.action === "create") {
    target.blocks = [...blocks, normalizedBlock(operation.values)];
    return;
  }
  const current = findOrThrow(blocks, operation.id!, "内容块");
  if (operation.action === "update") target.blocks = blocks.map((block) => block.id === operation.id ? normalizedBlock(operation.values, current) : block);
  else target.blocks = blocks.filter((block) => block.id !== operation.id);
}

export function applyAiWorkspaceProposal(rawState: unknown, input: AiWorkspaceProposalInput) {
  const state = structuredClone(asObject(rawState));
  const references = new Map<string, string>();
  state.version = 5;
  for (const operation of input.operations) {
    if (operation.kind === "entity") {
      const id = resolveReference(operation.id, references, "实体 ID");
      const parentId = resolveReference(operation.parentId, references, "父级 ID");
      const values = resolveEntityValues(operation.values, references);
      if (operation.action === "create") {
        const createdId = createEntity(state, operation.entity, parentId, values);
        if (operation.ref) {
          if (references.has(operation.ref)) throw new Error(`ref “${operation.ref}” 在同一提案中必须唯一`);
          references.set(operation.ref, createdId);
        }
      } else if (operation.action === "update") updateEntity(state, operation.entity, id!, parentId, values);
      else deleteEntity(state, operation.entity, id!, parentId);
    } else if (operation.kind === "daily_review.upsert") {
      if (!isValidLocalDate(operation.date)) throw new Error("复盘日期无效");
      const daily = asObject(state.daily);
      const current = asObject(daily[operation.date]);
      daily[operation.date] = { note: "", gain: "", problem: "", feeling: "", tomorrow: "", ...current, ...operation.values };
      state.daily = daily;
    } else if (operation.kind === "block") {
      applyBlockOperation(state, operation);
    } else if (operation.kind === "theme.set") {
      state.themes = { ...asObject(state.themes), [operation.view]: operation.color };
    } else {
      applyFinanceOperation(state, operation);
    }
  }
  return state;
}
