import { expenseCategoryChoices, incomeCategoryChoices, normalizeMerchantName } from "./finance-categories.ts";

export type FinanceEntryType = "income" | "expense";

export type FinanceEntry = {
  id: string;
  type: FinanceEntryType;
  amountCents: number;
  category: string;
  date: string;
  time: string;
  note: string;
  relatedProject: string;
  createdAt: string;
  updatedAt: string;
  origin: "manual" | "ai" | "wechat";
  merchant?: string;
};

export type MonthlyBudget = {
  totalCents: number;
  categoryCents: Record<string, number>;
};

export type FinanceState = {
  entries: FinanceEntry[];
  budgets: Record<string, MonthlyBudget>;
  expenseCategories: string[];
  incomeCategories: string[];
  merchantCategories: Record<string, string>;
};

export const defaultExpenseCategories = expenseCategoryChoices;
export const defaultIncomeCategories = incomeCategoryChoices;

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localTimeKey(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function monthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

export function isValidMonthKey(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 1900 && year <= 9999 && month >= 1 && month <= 12;
}

function dayInCurrentMonth(day: number) {
  const now = new Date();
  const safeDay = Math.min(Math.max(1, day), now.getDate());
  return `${monthKey(now)}-${String(safeDay).padStart(2, "0")}`;
}

export function createInitialFinanceState(): FinanceState {
  return {
    entries: [],
    budgets: {},
    expenseCategories: [...defaultExpenseCategories],
    incomeCategories: [...defaultIncomeCategories],
    merchantCategories: {},
  };
}

export function createPreviewFinanceState(): FinanceState {
  const now = new Date().toISOString();
  const currentMonth = monthKey();
  return {
    entries: [
      { id: "finance-demo-1", type: "expense", amountCents: 2860, category: "餐饮", date: dayInCurrentMonth(2), time: "12:18", note: "午餐", relatedProject: "", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-2", type: "expense", amountCents: 1580, category: "交通", date: dayInCurrentMonth(4), time: "08:35", note: "地铁与公交", relatedProject: "", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-3", type: "income", amountCents: 120000, category: "兼职", date: dayInCurrentMonth(6), time: "19:20", note: "设计项目结算", relatedProject: "AI 学习工具", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-4", type: "expense", amountCents: 8990, category: "学习", date: dayInCurrentMonth(8), time: "15:10", note: "课程资料", relatedProject: "财务管理", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-5", type: "expense", amountCents: 4280, category: "购物", date: dayInCurrentMonth(12), time: "17:42", note: "生活用品", relatedProject: "", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-6", type: "expense", amountCents: 3590, category: "餐饮", date: dayInCurrentMonth(15), time: "18:36", note: "朋友聚餐", relatedProject: "", createdAt: now, updatedAt: now, origin: "manual" },
    ],
    budgets: {
      [currentMonth]: {
        totalCents: 300000,
        categoryCents: { 餐饮: 90000, 交通: 30000, 学习: 60000, 购物: 50000 },
      },
    },
    expenseCategories: [...defaultExpenseCategories],
    incomeCategories: [...defaultIncomeCategories],
    merchantCategories: {},
  };
}

function finiteCents(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function isValidLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidLocalTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeFinanceState(raw: unknown): FinanceState {
  const fallback = createInitialFinanceState();
  if (!raw || typeof raw !== "object") return fallback;
  const saved = raw as Partial<FinanceState>;
  const entries = Array.isArray(saved.entries) ? saved.entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<FinanceEntry>;
    if (candidate.type !== "income" && candidate.type !== "expense") return [];
    if (!candidate.id || !isValidLocalDate(candidate.date ?? "")) return [];
    const amountCents = finiteCents(candidate.amountCents);
    if (!amountCents) return [];
    return [{
      id: String(candidate.id),
      type: candidate.type,
      amountCents,
      category: String(candidate.category || (candidate.type === "income" ? "其他收入" : "其他")),
      date: String(candidate.date),
      time: isValidLocalTime(String(candidate.time ?? "")) ? String(candidate.time) : "12:00",
      note: String(candidate.note ?? ""),
      relatedProject: String(candidate.relatedProject ?? ""),
      createdAt: String(candidate.createdAt ?? new Date().toISOString()),
      updatedAt: String(candidate.updatedAt ?? candidate.createdAt ?? new Date().toISOString()),
      origin: candidate.origin === "ai" || candidate.origin === "wechat" ? candidate.origin : "manual",
      ...(typeof candidate.merchant === "string" && candidate.merchant.trim() ? { merchant: candidate.merchant.trim().slice(0, 200) } : {}),
    } satisfies FinanceEntry];
  }) : fallback.entries;
  const budgets = saved.budgets && typeof saved.budgets === "object"
    ? Object.fromEntries(Object.entries(saved.budgets).flatMap(([month, budget]) => {
      if (!isValidMonthKey(month) || !budget || typeof budget !== "object") return [];
      const candidate = budget as Partial<MonthlyBudget>;
      const categoryCents = candidate.categoryCents && typeof candidate.categoryCents === "object"
        ? Object.fromEntries(Object.entries(candidate.categoryCents).map(([category, cents]) => [category, finiteCents(cents)]))
        : {};
      return [[month, { totalCents: finiteCents(candidate.totalCents), categoryCents } satisfies MonthlyBudget]];
    }))
    : fallback.budgets;
  return {
    entries,
    budgets,
    expenseCategories: uniqueStrings(saved.expenseCategories, defaultExpenseCategories),
    incomeCategories: uniqueStrings(saved.incomeCategories, defaultIncomeCategories),
    merchantCategories: saved.merchantCategories && typeof saved.merchantCategories === "object"
      ? Object.fromEntries(Object.entries(saved.merchantCategories).slice(0, 500).flatMap(([merchant, category]) => {
        const key = normalizeMerchantName(merchant);
        const label = String(category ?? "").trim();
        return key && label && label.length <= 40 ? [[key, label]] : [];
      }))
      : {},
  };
}

function uniqueStrings(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value.map((item) => String(item).trim()).filter(Boolean);
  return [...new Set([...fallback, ...normalized])];
}

export function yuanToCents(value: string | number) {
  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return 0;
  const [yuan, decimal = ""] = normalized.split(".");
  const cents = Number(yuan) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000_00 ? cents : 0;
}

export function budgetInputToCents(value: string) {
  if (!value.trim()) return 0;
  return yuanToCents(value) || null;
}

export function centsToYuanInput(value: number) {
  return (finiteCents(value) / 100).toFixed(2);
}

export function formatCny(value: number, sign = false) {
  const formatted = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(finiteCents(Math.abs(value)) / 100);
  if (!sign || value === 0) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

export function formatSignedCny(value: number) {
  if (value === 0) return formatCny(0);
  return `${value > 0 ? "+" : "−"}${formatCny(Math.abs(value))}`;
}

export function financeSummary(entries: FinanceEntry[], month: string) {
  return entries.reduce((summary, entry) => {
    if (!entry.date.startsWith(month)) return summary;
    if (entry.type === "income") summary.incomeCents += entry.amountCents;
    else summary.expenseCents += entry.amountCents;
    summary.netCents = summary.incomeCents - summary.expenseCents;
    return summary;
  }, { incomeCents: 0, expenseCents: 0, netCents: 0 });
}

export function expenseByCategory(entries: FinanceEntry[], month: string) {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== "expense" || !entry.date.startsWith(month)) continue;
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents);
  }
  return [...totals.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
}

export function recentMonthKeys(count: number, reference = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (count - index - 1), 1);
    return monthKey(date);
  });
}

export function financeCsv(entries: FinanceEntry[]) {
  const escape = (value: string | number) => {
    const text = String(value);
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["日期", "时间", "类型", "金额（元）", "分类", "关联项目", "备注"],
    ...entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.updatedAt.localeCompare(a.updatedAt)).map((entry) => [
      entry.date,
      entry.time,
      entry.type === "income" ? "收入" : "支出",
      centsToYuanInput(entry.amountCents),
      entry.category,
      entry.relatedProject,
      entry.note,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\n")}`;
}
