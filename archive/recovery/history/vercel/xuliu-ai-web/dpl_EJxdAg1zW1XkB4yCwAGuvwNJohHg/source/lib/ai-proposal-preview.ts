import { normalizeFinanceState, type FinanceEntry } from "./finance.ts";
import type { AiEntity, AiOperation, AiWorkspaceProposalInput } from "./ai-action-schema.ts";

type JsonObject = Record<string, unknown>;
type EntityOperation = Extract<AiOperation, { kind: "entity" }>;
type BlockOperation = Extract<AiOperation, { kind: "block" }>;
type FinanceOperation = Extract<AiOperation, { kind: "finance.entry.create" | "finance.entry.update" | "finance.entry.delete" | "finance.budget.set" | "finance.budget.remove" }>;

export type AiProposalPreviewItem = {
  index: number;
  description: string;
};

const entityLabels: Record<AiEntity, string> = {
  task: "任务",
  milestone: "日程",
  course: "课程",
  courseSlot: "课程时间",
  learning: "课外学习项目",
  learningResource: "学习资源",
  research: "研究项目",
  researchPage: "研究页面",
  idea: "灵感",
  tool: "工具",
  toolVersion: "工具版本",
  habit: "习惯",
  reminder: "提醒",
  media: "书影音",
  recipe: "食谱",
  page: "笔记页面",
  focusEntry: "专注记录",
};

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

const fieldLabels: Record<string, string> = {
  title: "名称",
  label: "版本名称",
  area: "领域",
  source: "来源",
  due: "截止日期",
  done: "完成状态",
  today: "今日任务",
  date: "日期",
  time: "时间",
  location: "地点",
  requirements: "要求",
  courseId: "关联课程",
  term: "学期",
  teacher: "教师或说明",
  progress: "进度",
  content: "详情内容",
  weekday: "星期",
  start: "开始时间",
  end: "结束时间",
  weeks: "周次",
  category: "分类",
  goal: "阶段目标",
  type: "类型",
  status: "状态",
  summary: "当前关注",
  objective: "目标",
  next: "下一步",
  note: "备注",
  description: "用途说明",
  url: "链接",
  version: "版本",
  makeCurrent: "设为当前版本",
  schedule: "频率",
  times: "提醒时间",
  intervalMinutes: "间隔分钟",
  enabled: "启用状态",
  kind: "种类",
  ingredients: "食材",
  space: "空间",
  parentId: "父级页面",
  taskId: "关联任务",
  minutes: "分钟数",
  mode: "记录方式",
};

const blockTypeLabels: Record<string, string> = {
  heading: "标题",
  text: "正文",
  checklist: "清单",
  image: "图片",
  table: "表格",
  link: "链接",
};

const dailyFieldLabels: Record<string, string> = {
  note: "当天随记",
  gain: "收获",
  problem: "卡点",
  feeling: "状态",
  tomorrow: "明日重点",
};

const themeLabels: Record<string, string> = {
  today: "今天",
  timetable: "课程表",
  tasks: "任务",
  calendar: "日历",
  review: "复盘",
  finance: "记账",
  school: "课内学习",
  learning: "课外学习",
  thoughts: "思考集",
  work: "工作研究",
  ideas: "灵感",
  tools: "工具集",
  life: "生活管理",
  free: "自由空间",
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function objectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function referenceName(value: unknown) {
  const candidate = asObject(value);
  return typeof candidate.$ref === "string" ? candidate.$ref : null;
}

function cleanText(value: unknown, maximum = 140) {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}

function formatId(value: unknown) {
  return cleanText(value, 120) || "未知";
}

function formatCents(value: unknown) {
  const cents = Number(value);
  return Number.isFinite(cents) ? `¥${(cents / 100).toFixed(2)}` : "金额无效";
}

function formatValue(key: string, value: unknown) {
  const ref = referenceName(value);
  if (ref) return `本提案 ref:${cleanText(ref, 64)}`;
  if (value === undefined || value === null || value === "") return "空";
  if (key === "amountCents" || key === "limitCents") return formatCents(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.length ? value.map((item) => cleanText(item, 40)).join("、") : "空";
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && /^data:/i.test(value)) return "[内嵌文件，不展示]";
  return `“${cleanText(value)}”`;
}

function formatFields(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, value]) => `${fieldLabels[key] ?? cleanText(key, 40)}：${formatValue(key, value)}`);
}

function displayName(entity: AiEntity, item: JsonObject) {
  const direct = item.title ?? item.label;
  if (typeof direct === "string" && direct.trim()) return cleanText(direct, 80);
  if (entity === "courseSlot") {
    return `星期${cleanText(item.weekday, 8)} ${cleanText(item.start, 8)}-${cleanText(item.end, 8)}`;
  }
  if (entity === "focusEntry") return `${cleanText(item.date, 12)} · ${cleanText(item.minutes, 8)} 分钟`;
  return "未命名";
}

function entityIdentity(entity: AiEntity, item: JsonObject, id: unknown) {
  return `${entityLabels[entity]}“${displayName(entity, item)}”（ID ${formatId(id)}）`;
}

function deletionContext(entity: AiEntity, item: JsonObject) {
  if (entity === "task" && item.due) return `；截止日期：${cleanText(item.due, 12)}`;
  if (entity === "milestone") {
    const date = cleanText(item.date, 12) || "日期未定";
    const time = cleanText(item.time, 8) || "时间未定";
    return `；日期时间：${date} ${time}`;
  }
  return "";
}

function findById(items: unknown, id: string) {
  return objectArray(items).find((item) => item.id === id);
}

function findEntity(state: JsonObject, entity: AiEntity, id: string, parentId?: string) {
  const nested = nestedEntity[entity];
  if (nested) {
    if (!parentId) throw new Error("嵌套实体缺少父级 ID");
    const parent = findById(state[nested.parentCollection], parentId);
    if (!parent) throw new Error("父级实体不存在");
    const target = findById(parent[nested.childCollection], id);
    if (!target) throw new Error("目标实体不存在");
    return { target, parent };
  }
  const collection = collectionByEntity[entity];
  if (!collection) throw new Error("实体类型不支持预览");
  const target = findById(state[collection], id);
  if (!target) throw new Error("目标实体不存在");
  return { target };
}

function parentIdentity(state: JsonObject, entity: AiEntity, parentId: unknown, createdRefs: Map<string, { entity: AiEntity; values: JsonObject }>) {
  const ref = referenceName(parentId);
  if (ref) {
    const created = createdRefs.get(ref);
    return created ? entityIdentity(created.entity, created.values, `本提案 ref:${ref}`) : `本提案 ref:${cleanText(ref, 64)}`;
  }
  if (typeof parentId !== "string") return "";
  const nested = nestedEntity[entity];
  if (!nested) return `父级 ID ${formatId(parentId)}`;
  const parent = findById(state[nested.parentCollection], parentId);
  if (!parent) return `父级 ID ${formatId(parentId)}`;
  const parentEntity: Partial<Record<AiEntity, AiEntity>> = {
    courseSlot: "course",
    learningResource: "learning",
    researchPage: "research",
    toolVersion: "tool",
  };
  const kind = parentEntity[entity]!;
  return entityIdentity(kind, parent, parentId);
}

function existingContentSummary(target: JsonObject) {
  const blocks = objectArray(target.blocks);
  return blocks.length ? `现有 ${blocks.length} 个内容块` : "空";
}

function entityChangeLines(target: JsonObject, values: JsonObject) {
  return Object.entries(values).map(([key, next]) => {
    const before = key === "content" ? existingContentSummary(target) : formatValue(key, target[key]);
    return `${fieldLabels[key] ?? cleanText(key, 40)}：${before} → ${formatValue(key, next)}`;
  });
}

function previewEntityOperation(
  state: JsonObject,
  operation: EntityOperation,
  createdRefs: Map<string, { entity: AiEntity; values: JsonObject }>,
) {
  const label = entityLabels[operation.entity];
  if (operation.action === "create") {
    const values = { ...operation.values };
    const name = displayName(operation.entity, values);
    const fields = formatFields(values);
    const parent = operation.parentId ? parentIdentity(state, operation.entity, operation.parentId, createdRefs) : "";
    if (operation.ref) createdRefs.set(operation.ref, { entity: operation.entity, values });
    return `新增${label}“${name}”${parent ? `，父级：${parent}` : ""}${fields.length ? `；${fields.join("；")}` : ""}`;
  }

  const ref = referenceName(operation.id);
  if (ref) {
    const created = createdRefs.get(ref);
    if (!created) throw new Error("目标 ref 不存在");
    const identity = entityIdentity(operation.entity, created.values, `本提案 ref:${ref}`);
    if (operation.action === "delete") return `删除${identity}${deletionContext(operation.entity, created.values)}`;
    const changes = entityChangeLines(created.values, operation.values);
    Object.assign(created.values, operation.values);
    return `修改${identity}；${changes.join("；")}`;
  }

  if (typeof operation.id !== "string") throw new Error("目标 ID 无效");
  const resolvedParentId = typeof operation.parentId === "string" ? operation.parentId : undefined;
  const { target, parent } = findEntity(state, operation.entity, operation.id, resolvedParentId);
  const identity = entityIdentity(operation.entity, target, operation.id);
  const parentText = parent && resolvedParentId
    ? `，父级：${parentIdentity(state, operation.entity, resolvedParentId, createdRefs)}`
    : "";
  if (operation.action === "delete") return `删除${identity}${parentText}${deletionContext(operation.entity, target)}`;
  const changes = entityChangeLines(target, operation.values);
  Object.assign(target, operation.values);
  return `修改${identity}${parentText}；${changes.join("；")}`;
}

function financeSnapshot(entry: Partial<FinanceEntry> & { time?: string }) {
  const type = entry.type === "income" ? "收入" : "支出";
  return `${type} ${formatCents(entry.amountCents)} · ${cleanText(entry.category, 40) || "未分类"} · ${cleanText(entry.date, 12) || "日期未定"} ${cleanText(entry.time, 8) || "执行时北京时间"}`;
}

function isFinanceOperation(operation: AiOperation): operation is FinanceOperation {
  return operation.kind === "finance.entry.create"
    || operation.kind === "finance.entry.update"
    || operation.kind === "finance.entry.delete"
    || operation.kind === "finance.budget.set"
    || operation.kind === "finance.budget.remove";
}

function previewFinanceOperation(state: JsonObject, operation: FinanceOperation) {
  const finance = normalizeFinanceState(state.finance);
  if (operation.kind === "finance.entry.create") {
    const snapshot = financeSnapshot(operation.values);
    const extras = [
      operation.values.note ? `备注：“${cleanText(operation.values.note)}”` : "",
      operation.values.relatedProject ? `关联项目：“${cleanText(operation.values.relatedProject)}”` : "",
      operation.values.allowDuplicate ? "允许添加可能重复的账目：是" : "",
    ].filter(Boolean);
    state.finance = finance;
    return `新增账目：${snapshot}${extras.length ? `；${extras.join("；")}` : ""}`;
  }
  if (operation.kind === "finance.entry.update") {
    const current = finance.entries.find((entry) => entry.id === operation.id);
    if (!current) throw new Error("记账记录不存在");
    const beforeSnapshot = financeSnapshot(current);
    const next = { ...current, ...operation.values };
    const changes = Object.entries(operation.values).map(([key, value]) => {
      const label = key === "amountCents" ? "金额" : key === "type" ? "收支类型" : fieldLabels[key] ?? key;
      return `${label}：${formatValue(key, current[key as keyof FinanceEntry])} → ${formatValue(key, value)}`;
    });
    Object.assign(current, operation.values);
    state.finance = finance;
    return `修改账目（ID ${formatId(current.id)}）；当前：${beforeSnapshot}；修改后：${financeSnapshot(next)}；${changes.join("；")}`;
  }
  if (operation.kind === "finance.entry.delete") {
    const current = finance.entries.find((entry) => entry.id === operation.id);
    if (!current) throw new Error("记账记录不存在");
    const description = `删除账目（ID ${formatId(current.id)}）：${financeSnapshot(current)}${current.note ? `；备注：“${cleanText(current.note)}”` : ""}`;
    finance.entries = finance.entries.filter((entry) => entry.id !== operation.id);
    state.finance = finance;
    return description;
  }
  const budget = finance.budgets[operation.month];
  const current = operation.category === null ? budget?.totalCents ?? 0 : budget?.categoryCents[operation.category] ?? 0;
  const target = `${operation.month} ${operation.category ?? "总"}预算`;
  const monthBudget = budget ?? { totalCents: 0, categoryCents: {} };
  if (operation.kind === "finance.budget.set") {
    if (operation.category === null) monthBudget.totalCents = operation.limitCents;
    else monthBudget.categoryCents[operation.category] = operation.limitCents;
    finance.budgets[operation.month] = monthBudget;
    state.finance = finance;
    return `设置${target}：${formatCents(current)} → ${formatCents(operation.limitCents)}`;
  }
  if (operation.category === null) monthBudget.totalCents = 0;
  else delete monthBudget.categoryCents[operation.category];
  finance.budgets[operation.month] = monthBudget;
  state.finance = finance;
  return `移除${target}：当前 ${formatCents(current)} → 无`;
}

function blockContainer(state: JsonObject, operation: BlockOperation) {
  if (operation.container === "researchPage") {
    const project = findById(state.research, operation.parentId);
    if (!project) throw new Error("研究项目不存在");
    const page = findById(project.pages, operation.pageId!);
    if (!page) throw new Error("研究页面不存在");
    return { target: page, description: `${entityIdentity("research", project, operation.parentId)}中的${entityIdentity("researchPage", page, operation.pageId)}` };
  }
  const containers: Record<Exclude<BlockOperation["container"], "researchPage">, { collection: string; entity: AiEntity }> = {
    course: { collection: "courses", entity: "course" },
    learning: { collection: "learning", entity: "learning" },
    tool: { collection: "tools", entity: "tool" },
    media: { collection: "media", entity: "media" },
    recipe: { collection: "recipes", entity: "recipe" },
    page: { collection: "pages", entity: "page" },
  };
  const config = containers[operation.container];
  const target = findById(state[config.collection], operation.parentId);
  if (!target) throw new Error("内容容器不存在");
  return { target, description: entityIdentity(config.entity, target, operation.parentId) };
}

function blockIdentity(block: JsonObject, id: string) {
  const kind = blockTypeLabels[String(block.type)] ?? "内容";
  const name = typeof block.text === "string" && block.text.trim() ? `“${cleanText(block.text, 80)}”` : "";
  return `${kind}块${name}（ID ${formatId(id)}）`;
}

function previewBlockOperation(state: JsonObject, operation: BlockOperation) {
  const container = blockContainer(state, operation);
  if (operation.action === "create") {
    const fields = formatFields(operation.values);
    return `在${container.description}中新增${blockTypeLabels[String(operation.values.type)] ?? "内容"}块${fields.length ? `；${fields.join("；")}` : ""}`;
  }
  const current = findById(container.target.blocks, operation.id!);
  if (!current) throw new Error("内容块不存在");
  const identity = blockIdentity(current, operation.id!);
  if (operation.action === "delete") return `从${container.description}删除${identity}`;
  const changes = Object.entries(operation.values).map(([key, value]) => `${fieldLabels[key] ?? blockTypeLabels[key] ?? key}：${formatValue(key, current[key])} → ${formatValue(key, value)}`);
  Object.assign(current, operation.values);
  return `修改${container.description}中的${identity}；${changes.join("；")}`;
}

function previewDailyOperation(state: JsonObject, operation: Extract<AiOperation, { kind: "daily_review.upsert" }>) {
  const daily = asObject(state.daily);
  const current = asObject(daily[operation.date]);
  const changes = Object.entries(operation.values).map(([key, value]) => `${dailyFieldLabels[key] ?? key}：${formatValue(key, current[key])} → ${formatValue(key, value)}`);
  daily[operation.date] = { ...current, ...operation.values };
  state.daily = daily;
  return `更新 ${operation.date} 每日复盘；${changes.join("；")}`;
}

function previewThemeOperation(state: JsonObject, operation: Extract<AiOperation, { kind: "theme.set" }>) {
  const themes = asObject(state.themes);
  const current = themes[operation.view];
  themes[operation.view] = operation.color;
  state.themes = themes;
  return `修改“${themeLabels[operation.view] ?? operation.view}”页面颜色：${formatValue("color", current)} → ${formatValue("color", operation.color)}`;
}

export function buildAiProposalPreview(rawState: unknown, input: AiWorkspaceProposalInput): AiProposalPreviewItem[] {
  const state = structuredClone(asObject(rawState));
  const createdRefs = new Map<string, { entity: AiEntity; values: JsonObject }>();
  return input.operations.map((operation, index) => {
    let description: string;
    if (operation.kind === "entity") description = previewEntityOperation(state, operation, createdRefs);
    else if (isFinanceOperation(operation)) description = previewFinanceOperation(state, operation);
    else if (operation.kind === "block") description = previewBlockOperation(state, operation);
    else if (operation.kind === "daily_review.upsert") description = previewDailyOperation(state, operation);
    else description = previewThemeOperation(state, operation);
    return { index, description };
  });
}
