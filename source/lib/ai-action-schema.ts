import { z } from "zod";
import { isValidLocalDate, isValidLocalTime, isValidMonthKey } from "./finance.ts";

export const aiEntitySchema = z.enum([
  "task",
  "milestone",
  "course",
  "courseSlot",
  "learning",
  "learningResource",
  "research",
  "researchPage",
  "idea",
  "tool",
  "toolVersion",
  "habit",
  "reminder",
  "media",
  "recipe",
  "page",
  "focusEntry",
]);

const createRefNameSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "ref 必须以英文字母开头，且只能包含字母、数字、下划线或连字符");
const createReferenceSchema = z.object({ $ref: createRefNameSchema }).strict();
const idOrReferenceSchema = z.union([z.string().min(1).max(120), createReferenceSchema]);
const aiAreaSchema = z.enum(["课内", "课外", "工作", "生活", "思考"]);

const milestoneActionValuesSchema = z.object({
  title: z.string().trim().max(500),
  date: z.string().refine(isValidLocalDate, "日期无效"),
  time: z.string().refine(isValidLocalTime, "时间无效"),
  location: z.string().trim().max(500),
  requirements: z.string().max(4_000),
  area: aiAreaSchema,
  done: z.boolean(),
  courseId: z.union([z.string().trim().min(1).max(120), createReferenceSchema, z.null()]),
  mode: z.enum(["single", "multi"]),
  parentCandidate: z.boolean(),
}).partial().strict();

function referenceName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.$ref === "string" ? candidate.$ref : null;
}

const valueSchema = z.union([
  z.string().max(4_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(300)).max(20),
  createReferenceSchema,
]);

function normalizeEntityActionInput(rawValue: unknown) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) return rawValue;
  const operation = rawValue as Record<string, unknown>;
  if (operation.entity !== "milestone" || !["create", "update"].includes(String(operation.action)) || !operation.values || typeof operation.values !== "object" || Array.isArray(operation.values)) return rawValue;

  const values = { ...(operation.values as Record<string, unknown>) };
  if (typeof values.date === "string") values.date = values.date.trim();
  if (typeof values.time === "string") values.time = values.time.trim();
  if (typeof values.area === "string") {
    values.area = values.area.trim();
    if (!values.area) delete values.area;
  }
  if (Object.prototype.hasOwnProperty.call(values, "courseId")) {
    if (typeof values.courseId === "string") values.courseId = values.courseId.trim();
    if (values.courseId === "" || values.courseId === null) {
      if (operation.action === "update") values.courseId = null;
      else delete values.courseId;
    }
  }
  return { ...operation, values };
}

const entityActionCommonShape = {
  kind: z.literal("entity"),
  action: z.enum(["create", "update", "delete"]),
  ref: createRefNameSchema.optional(),
  id: idOrReferenceSchema.optional(),
  parentId: idOrReferenceSchema.optional(),
};

const milestoneEntityActionObjectSchema = z.object({
  ...entityActionCommonShape,
  entity: z.literal("milestone"),
  values: milestoneActionValuesSchema.default({}),
}).strict();

const otherEntityActionObjectSchema = z.object({
  ...entityActionCommonShape,
  entity: aiEntitySchema.exclude(["milestone"]),
  values: z.record(z.string().max(80), valueSchema).default({}),
}).strict();

const entityActionObjectSchema = z.union([milestoneEntityActionObjectSchema, otherEntityActionObjectSchema]);

export const entityActionSchema = z.preprocess(normalizeEntityActionInput, entityActionObjectSchema).superRefine((operation, context) => {
  if (operation.entity === "task" && Object.prototype.hasOwnProperty.call(operation.values, "due")) {
    const due = operation.values.due;
    if (due !== null && (typeof due !== "string" || !isValidLocalDate(due))) {
      context.addIssue({
        code: "custom",
        message: "任务截止日期必须使用 YYYY-MM-DD；需要具体时间请创建日历事项",
        path: ["values", "due"],
      });
    }
  }
  if (operation.entity === "task" && Object.prototype.hasOwnProperty.call(operation.values, "startDate")) {
    const startDate = operation.values.startDate;
    if (startDate !== null && (typeof startDate !== "string" || !isValidLocalDate(startDate))) context.addIssue({ code: "custom", message: "跨日任务开始日期必须使用 YYYY-MM-DD", path: ["values", "startDate"] });
  }
  if (operation.entity === "task" && operation.values.mode !== undefined && !["single", "multi"].includes(String(operation.values.mode))) context.addIssue({ code: "custom", message: "任务方式只能是 single 或 multi", path: ["values", "mode"] });
  if (operation.entity === "task" && operation.values.status !== undefined && !["未开始", "进行中", "已暂停", "已完成"].includes(String(operation.values.status))) context.addIssue({ code: "custom", message: "任务状态无效", path: ["values", "status"] });
  if (operation.entity === "task" && operation.values.progress !== undefined && (typeof operation.values.progress !== "number" || !Number.isInteger(operation.values.progress) || operation.values.progress < 0 || operation.values.progress > 100)) context.addIssue({ code: "custom", message: "任务进度必须是 0 到 100 的整数", path: ["values", "progress"] });
  if (operation.entity === "task" && operation.values.mode === "multi" && typeof operation.values.startDate === "string" && typeof operation.values.due === "string" && operation.values.startDate > operation.values.due) context.addIssue({ code: "custom", message: "跨日任务开始日期不能晚于截止日期", path: ["values", "startDate"] });
  if (operation.action !== "create" && operation.ref) {
    context.addIssue({ code: "custom", message: "只有新增实体可以声明 ref", path: ["ref"] });
  }
  if (operation.action === "create" && operation.id) {
    context.addIssue({ code: "custom", message: "新增实体的 ID 必须由服务器生成", path: ["id"] });
  }
  if (operation.action !== "create" && !operation.id) {
    context.addIssue({ code: "custom", message: "更新或删除必须提供实体 ID", path: ["id"] });
  }
  if (["courseSlot", "learningResource", "researchPage", "toolVersion"].includes(operation.entity) && !operation.parentId) {
    context.addIssue({ code: "custom", message: "嵌套实体必须提供父级 ID", path: ["parentId"] });
  }
  if (operation.action === "delete" && Object.keys(operation.values).length) {
    context.addIssue({ code: "custom", message: "删除动作不能携带修改字段", path: ["values"] });
  }
  if (operation.action === "update" && !Object.keys(operation.values).length) {
    context.addIssue({ code: "custom", message: "修改动作至少需要一个字段", path: ["values"] });
  }
  for (const [key, value] of Object.entries(operation.values)) {
    if (!referenceName(value)) continue;
    const supported = (key === "parentId" && operation.entity === "page")
      || (key === "courseId" && ["task", "milestone"].includes(operation.entity))
      || (key === "taskId" && operation.entity === "focusEntry");
    if (!supported) context.addIssue({ code: "custom", message: "$ref 仅可用于页面 parentId、任务或日程 courseId、专注记录 taskId", path: ["values", key] });
  }
  if (operation.action === "create") {
    if (operation.entity === "toolVersion") {
      if (typeof operation.values.label !== "string" || !operation.values.label.trim()) context.addIssue({ code: "custom", message: "新增工具版本必须提供版本名称", path: ["values", "label"] });
    } else if (!["courseSlot", "focusEntry"].includes(operation.entity) && (typeof operation.values.title !== "string" || !operation.values.title.trim())) {
      context.addIssue({ code: "custom", message: "新增内容必须提供标题", path: ["values", "title"] });
    }
    if (operation.entity === "milestone" && typeof operation.values.date !== "string") {
      context.addIssue({ code: "custom", message: "新增日历事项必须提供日期", path: ["values", "date"] });
    }
    if (operation.entity === "reminder") {
      const times = Array.isArray(operation.values.times) ? operation.values.times : [];
      const interval = typeof operation.values.intervalMinutes === "number" ? operation.values.intervalMinutes : 0;
      if (!times.length && !(operation.values.type === "break" && interval > 0)) {
        context.addIssue({ code: "custom", message: "提醒必须提供至少一个时间；休息提醒也可提供间隔分钟数", path: ["values", "times"] });
      }
    }
  }
  if (operation.entity === "focusEntry" && operation.action !== "create") {
    context.addIssue({ code: "custom", message: "专注记录只支持新增", path: ["action"] });
  }
});

const financeEntryPersistedValuesSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(100_000_000_00),
  category: z.string().trim().min(1).max(40),
  date: z.string().refine(isValidLocalDate, "日期无效"),
  time: z.string().refine(isValidLocalTime, "时间无效").optional(),
  note: z.string().max(500).default(""),
  relatedProject: z.string().max(200).default(""),
}).strict();

const financeEntryCreateValuesSchema = financeEntryPersistedValuesSchema.extend({
  allowDuplicate: z.boolean().default(false),
}).strict();

export const financeEntryCreateSchema = z.object({
  kind: z.literal("finance.entry.create"),
  values: financeEntryCreateValuesSchema,
}).strict();

export const financeEntryUpdateSchema = z.object({
  kind: z.literal("finance.entry.update"),
  id: z.string().min(1).max(120),
  values: financeEntryPersistedValuesSchema.partial().strict(),
}).strict().superRefine((operation, context) => {
  if (!Object.keys(operation.values).length) context.addIssue({ code: "custom", message: "修改动作至少需要一个字段", path: ["values"] });
});

export const financeEntryDeleteSchema = z.object({
  kind: z.literal("finance.entry.delete"),
  id: z.string().min(1).max(120),
}).strict();

export const financeBudgetSetSchema = z.object({
  kind: z.literal("finance.budget.set"),
  month: z.string().refine(isValidMonthKey, "月份无效"),
  category: z.string().trim().min(1).max(40).nullable(),
  limitCents: z.number().int().positive().max(100_000_000_00),
}).strict();

export const financeBudgetRemoveSchema = z.object({
  kind: z.literal("finance.budget.remove"),
  month: z.string().refine(isValidMonthKey, "月份无效"),
  category: z.string().trim().min(1).max(40).nullable(),
}).strict();

export const dailyReviewUpsertSchema = z.object({
  kind: z.literal("daily_review.upsert"),
  date: z.string().refine(isValidLocalDate, "日期无效"),
  values: z.object({
    note: z.string().max(4_000).optional(),
    gain: z.string().max(2_000).optional(),
    problem: z.string().max(2_000).optional(),
    feeling: z.string().max(2_000).optional(),
    tomorrow: z.string().max(2_000).optional(),
  }).strict(),
}).strict();

const blockContainerSchema = z.enum(["course", "learning", "researchPage", "tool", "media", "recipe", "page"]);
const blockTypeSchema = z.enum(["heading", "text", "checklist", "link", "table"]);
const tableRowsSchema = z.array(z.array(z.string().max(300)).min(1).max(12)).min(1).max(50);
const blockValuesSchema = z.object({
  type: blockTypeSchema,
  text: z.string().max(4_000).optional(),
  checked: z.boolean().optional(),
  url: z.string().max(2_000).refine((value) => !value || /^https?:\/\//i.test(value), "链接必须使用 http 或 https").optional(),
  rows: tableRowsSchema.optional(),
}).strict();

export const blockActionSchema = z.object({
  kind: z.literal("block"),
  action: z.enum(["create", "update", "delete"]),
  container: blockContainerSchema,
  parentId: z.string().min(1).max(120),
  pageId: z.string().min(1).max(120).optional(),
  id: z.string().min(1).max(120).optional(),
  values: blockValuesSchema.partial().default({}),
}).strict().superRefine((operation, context) => {
  if (operation.container === "researchPage" && !operation.pageId) context.addIssue({ code: "custom", message: "研究页面块需要 pageId", path: ["pageId"] });
  if (operation.action === "create" && operation.id) context.addIssue({ code: "custom", message: "新增块 ID 由服务器生成", path: ["id"] });
  if (operation.action !== "create" && !operation.id) context.addIssue({ code: "custom", message: "修改或删除块需要 ID", path: ["id"] });
  if (operation.action === "delete" && Object.keys(operation.values).length) context.addIssue({ code: "custom", message: "删除块不能携带修改字段", path: ["values"] });
  if (operation.action !== "delete" && !Object.keys(operation.values).length) context.addIssue({ code: "custom", message: "块动作缺少内容", path: ["values"] });
  if (operation.action === "create" && !operation.values.type) context.addIssue({ code: "custom", message: "新增块必须提供类型", path: ["values", "type"] });
});

export const themeSetSchema = z.object({
  kind: z.literal("theme.set"),
  view: z.enum(["today", "timetable", "tasks", "calendar", "review", "finance", "school", "learning", "thoughts", "work", "ideas", "tools", "life", "free"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();

export const aiOperationSchema = z.union([
  entityActionSchema,
  financeEntryCreateSchema,
  financeEntryUpdateSchema,
  financeEntryDeleteSchema,
  financeBudgetSetSchema,
  financeBudgetRemoveSchema,
  dailyReviewUpsertSchema,
  blockActionSchema,
  themeSetSchema,
]);

export const aiWorkspaceProposalInputSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  baseRevision: z.number().int().nonnegative(),
  operations: z.array(aiOperationSchema).min(1).max(20),
}).strict().superRefine((proposal, context) => {
  const createdRefs = new Map<string, string>();
  const nestedParentEntity: Record<string, string> = {
    courseSlot: "course",
    learningResource: "learning",
    researchPage: "research",
    toolVersion: "tool",
  };

  proposal.operations.forEach((operation, index) => {
    if (operation.kind !== "entity") return;
    const values = operation.values as Record<string, unknown>;
    const references: Array<{ value: unknown; path: Array<string | number>; expectedEntity?: string }> = [
      { value: operation.id, path: ["operations", index, "id"], expectedEntity: operation.entity },
      { value: operation.parentId, path: ["operations", index, "parentId"], expectedEntity: nestedParentEntity[operation.entity] },
      { value: values.parentId, path: ["operations", index, "values", "parentId"], expectedEntity: operation.entity === "page" ? "page" : undefined },
      { value: values.courseId, path: ["operations", index, "values", "courseId"], expectedEntity: ["task", "milestone"].includes(operation.entity) ? "course" : undefined },
      { value: values.taskId, path: ["operations", index, "values", "taskId"], expectedEntity: operation.entity === "focusEntry" ? "task" : undefined },
    ];

    for (const reference of references) {
      const name = referenceName(reference.value);
      if (!name) continue;
      const createdEntity = createdRefs.get(name);
      if (!createdEntity) {
        context.addIssue({ code: "custom", message: `$ref “${name}” 必须引用本提案中更早的新增实体`, path: reference.path });
      } else if (reference.expectedEntity && createdEntity !== reference.expectedEntity) {
        context.addIssue({ code: "custom", message: `$ref “${name}” 指向 ${createdEntity}，不能用于 ${reference.expectedEntity}`, path: reference.path });
      }
    }

    if (operation.action === "create" && operation.ref) {
      if (createdRefs.has(operation.ref)) {
        context.addIssue({ code: "custom", message: `ref “${operation.ref}” 在同一提案中必须唯一`, path: ["operations", index, "ref"] });
      } else createdRefs.set(operation.ref, operation.entity);
    }
  });
});

export type AiEntity = z.infer<typeof aiEntitySchema>;
export type AiOperation = z.infer<typeof aiOperationSchema>;
export type AiWorkspaceProposalInput = z.infer<typeof aiWorkspaceProposalInputSchema>;

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

function valueTitle(values: Record<string, unknown>) {
  const candidate = values.title ?? values.label ?? values.note;
  return typeof candidate === "string" && candidate.trim() ? `“${candidate.trim().slice(0, 50)}”` : "";
}

export function describeAiOperation(operation: AiOperation) {
  if (operation.kind === "entity") {
    const verb = operation.action === "create" ? "新增" : operation.action === "update" ? "修改" : "删除";
    return `${verb}${entityLabels[operation.entity]}${valueTitle(operation.values)}`;
  }
  if (operation.kind === "finance.entry.create") {
    return `新增${operation.values.type === "income" ? "收入" : "支出"}：¥${(operation.values.amountCents / 100).toFixed(2)} · ${operation.values.category} · ${operation.values.date}${operation.values.time ? ` ${operation.values.time}` : ""}`;
  }
  if (operation.kind === "finance.entry.update") return `修改记账记录 ${operation.id}`;
  if (operation.kind === "finance.entry.delete") return `删除记账记录 ${operation.id}`;
  if (operation.kind === "finance.budget.set") return `设置 ${operation.month} ${operation.category ?? "总"}预算：¥${(operation.limitCents / 100).toFixed(2)}`;
  if (operation.kind === "finance.budget.remove") return `移除 ${operation.month} ${operation.category ?? "总"}预算`;
  if (operation.kind === "daily_review.upsert") return `更新 ${operation.date} 的每日复盘`;
  if (operation.kind === "theme.set") return `把 ${operation.view} 页面颜色改为 ${operation.color}`;
  const verb = operation.action === "create" ? "新增" : operation.action === "update" ? "修改" : "删除";
  return `${verb}内容块${operation.values.text ? `“${operation.values.text.slice(0, 40)}”` : ""}`;
}

export function aiProposalRisk(input: AiWorkspaceProposalInput) {
  const destructive = input.operations.some((operation) =>
    (operation.kind === "entity" && operation.action === "delete")
    || operation.kind === "finance.entry.delete"
    || operation.kind === "finance.budget.remove"
    || (operation.kind === "block" && operation.action === "delete"),
  );
  if (destructive) return "destructive" as const;
  if (input.operations.length > 1) return "bulk" as const;
  return "write" as const;
}
