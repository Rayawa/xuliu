import { expenseCategoryChoices, incomeCategoryChoices, normalizeMerchantName } from "./finance-categories.ts";

export type FinanceEntryType = "income" | "expense" | "topup";

export type StoredValueAccount = {
  id: string;
  name: string;
  openingBalanceCents: number;
};

export type FinanceEntry = {
  id: string;
  type: FinanceEntryType;
  amountCents: number;
  category: string;
  date: string;
  time: string;
  note: string;
  purpose?: string;
  relatedProject: string;
  createdAt: string;
  updatedAt: string;
  origin: "manual" | "ai" | "wechat";
  merchant?: string;
  storedValueAccountId?: string;
  bonusCents?: number;
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
  paymentRules: Record<string, { category: string; purpose: string }>;
  storedValueAccounts?: StoredValueAccount[];
};

export const defaultExpenseCategories = expenseCategoryChoices;
export const defaultIncomeCategories = incomeCategoryChoices;

function canonicalExpenseCategory(value: string) {
  const category = value.trim();
  return ({ 人情: "人情往来", 学习: "教育", 居住: "住房", 健康: "医疗健康" } as Record<string, string>)[category] || category;
}

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
    paymentRules: {},
    storedValueAccounts: [],
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
      { id: "finance-demo-4", type: "expense", amountCents: 8990, category: "教育", date: dayInCurrentMonth(8), time: "15:10", note: "课程资料", relatedProject: "财务管理", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-5", type: "expense", amountCents: 4280, category: "购物", date: dayInCurrentMonth(12), time: "17:42", note: "生活用品", relatedProject: "", createdAt: now, updatedAt: now, origin: "manual" },
      { id: "finance-demo-6", type: "expense", amountCents: 3590, category: "餐饮", date: dayInCurrentMonth(15), time: "18:36", note: "朋友聚餐", relatedProject: "", createdAt: now, updatedAt: now, origin: "manual" },
    ],
    budgets: {
      [currentMonth]: {
        totalCents: 300000,
        categoryCents: { 餐饮: 90000, 交通: 30000, 教育: 60000, 购物: 50000 },
      },
    },
    expenseCategories: [...defaultExpenseCategories],
    incomeCategories: [...defaultIncomeCategories],
    merchantCategories: {},
    paymentRules: {},
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
    if (candidate.type !== "income" && candidate.type !== "expense" && candidate.type !== "topup") return [];
    if (!candidate.id || !isValidLocalDate(candidate.date ?? "")) return [];
    const amountCents = finiteCents(candidate.amountCents);
    if (!amountCents) return [];
    return [{
      id: String(candidate.id),
      type: candidate.type,
      amountCents,
      ...(candidate.type === "topup" && candidate.bonusCents !== undefined ? { bonusCents: Math.min(amountCents, finiteCents(candidate.bonusCents)) } : {}),
      category: candidate.type === "expense"
        ? canonicalExpenseCategory(String(candidate.category || "其他"))
        : candidate.type === "topup" ? "储值充值" : String(candidate.category || "其他收入"),
      date: String(candidate.date),
      time: isValidLocalTime(String(candidate.time ?? "")) ? String(candidate.time) : "12:00",
      note: String(candidate.note ?? ""),
      ...(typeof candidate.purpose === "string" && candidate.purpose.trim() ? { purpose: candidate.purpose.trim().slice(0, 80) } : {}),
      relatedProject: String(candidate.relatedProject ?? ""),
      createdAt: String(candidate.createdAt ?? new Date().toISOString()),
      updatedAt: String(candidate.updatedAt ?? candidate.createdAt ?? new Date().toISOString()),
      origin: candidate.origin === "ai" || candidate.origin === "wechat" ? candidate.origin : "manual",
      ...(typeof candidate.merchant === "string" && candidate.merchant.trim() ? { merchant: candidate.merchant.trim().slice(0, 200) } : {}),
      ...(typeof candidate.storedValueAccountId === "string" && candidate.storedValueAccountId ? { storedValueAccountId: candidate.storedValueAccountId } : {}),
    } satisfies FinanceEntry];
  }) : fallback.entries;
  const budgets = saved.budgets && typeof saved.budgets === "object"
    ? Object.fromEntries(Object.entries(saved.budgets).flatMap(([month, budget]) => {
      if (!isValidMonthKey(month) || !budget || typeof budget !== "object") return [];
      const candidate = budget as Partial<MonthlyBudget>;
      const categoryCents: Record<string, number> = {};
      if (candidate.categoryCents && typeof candidate.categoryCents === "object") {
        for (const [category, cents] of Object.entries(candidate.categoryCents)) {
          const canonical = canonicalExpenseCategory(category);
          if (category === canonical || !(canonical in categoryCents)) categoryCents[canonical] = finiteCents(cents);
        }
      }
      return [[month, { totalCents: finiteCents(candidate.totalCents), categoryCents } satisfies MonthlyBudget]];
    }))
    : fallback.budgets;
  return {
    entries,
    budgets,
    expenseCategories: uniqueStrings(saved.expenseCategories, defaultExpenseCategories, canonicalExpenseCategory),
    incomeCategories: uniqueStrings(saved.incomeCategories, defaultIncomeCategories),
    storedValueAccounts: Array.isArray(saved.storedValueAccounts) ? saved.storedValueAccounts.flatMap((account) => !account || typeof account !== "object" ? [] : [{
      id: String(account.id ?? ""),
      name: String(account.name ?? "").trim(),
      openingBalanceCents: finiteCents(account.openingBalanceCents),
    }]) : [],
    merchantCategories: saved.merchantCategories && typeof saved.merchantCategories === "object"
      ? Object.fromEntries(Object.entries(saved.merchantCategories).slice(0, 500).flatMap(([merchant, category]) => {
        const key = normalizeMerchantName(merchant);
        const label = String(category ?? "").trim();
        return key && label && label.length <= 40 ? [[key, key.startsWith("expense:") ? canonicalExpenseCategory(label) : label]] : [];
      }))
      : {},
    paymentRules: saved.paymentRules && typeof saved.paymentRules === "object"
      ? Object.fromEntries(Object.entries(saved.paymentRules).slice(0, 500).flatMap(([rawKey, rule]) => {
        if (!rule || typeof rule !== "object") return [];
        const key = normalizeMerchantName(rawKey);
        const category = String(rule.category ?? "").trim();
        const purpose = String(rule.purpose ?? "").trim();
        return key && key.length <= 200 && category && category.length <= 40 && purpose.length <= 80
          ? [[key, { category: key.startsWith("expense:") ? canonicalExpenseCategory(category) : category, purpose }]] : [];
      }))
      : {},
  };
}

function uniqueStrings(value: unknown, fallback: string[], normalize = (category: string) => category) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value.map((item) => normalize(String(item).trim())).filter(Boolean);
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

export function parseStoredValueTopup(paid: string, bonus: string) {
  const parse = (value: string) => !value.trim() || /^0(?:\.0{1,2})?$/.test(value.trim()) ? 0 : yuanToCents(value) || null;
  const paidCents = parse(paid);
  const bonusCents = parse(bonus);
  if (paidCents === null || bonusCents === null) return null;
  const amountCents = paidCents + bonusCents;
  return amountCents > 0 && amountCents <= 100_000_000_00 ? { amountCents, bonusCents } : null;
}

export function storedValuePaidCents(entry: Pick<FinanceEntry, "amountCents" | "bonusCents">) {
  return entry.amountCents - (entry.bonusCents ?? 0);
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
    else if (entry.type === "expense") summary.expenseCents += entry.amountCents;
    summary.netCents = summary.incomeCents - summary.expenseCents;
    return summary;
  }, { incomeCents: 0, expenseCents: 0, netCents: 0 });
}

export function expenseByCategory(entries: FinanceEntry[], month: string) {
  return financeByCategory(entries, month, "expense");
}

export function incomeByCategory(entries: FinanceEntry[], month: string) {
  return financeByCategory(entries, month, "income");
}

function financeByCategory(entries: FinanceEntry[], month: string, type: "income" | "expense") {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== type || !entry.date.startsWith(month)) continue;
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents);
  }
  return [...totals.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
}

export function storedValueTotals(entries: FinanceEntry[], accountId?: string) {
  return entries.reduce((totals, entry) => {
    if (!entry.storedValueAccountId || (accountId && entry.storedValueAccountId !== accountId)) return totals;
    if (entry.type === "topup") {
      totals.topupCents += entry.amountCents;
      totals.paidCents += storedValuePaidCents(entry);
      totals.bonusCents += entry.bonusCents ?? 0;
    }
    if (entry.type === "expense") totals.spentCents += entry.amountCents;
    return totals;
  }, { topupCents: 0, paidCents: 0, bonusCents: 0, spentCents: 0 });
}

export function storedValueBalance(account: StoredValueAccount, entries: FinanceEntry[]) {
  const totals = storedValueTotals(entries, account.id);
  return account.openingBalanceCents + totals.topupCents - totals.spentCents;
}

export function recentMonthKeys(count: number, reference = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (count - index - 1), 1);
    return monthKey(date);
  });
}

export function financeCsv(entries: FinanceEntry[], accounts: StoredValueAccount[] = []) {
  const escape = (value: string | number) => {
    const text = String(value);
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["日期", "时间", "类型", "金额（元）", "分类", "识别用途", "关联项目", "备注", "储值项目", "储值实付（元）", "储值赠送（元）"],
    ...entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.updatedAt.localeCompare(a.updatedAt)).map((entry) => [
      entry.date,
      entry.time,
      entry.type === "income" ? "收入" : entry.type === "topup" ? "储值充值" : "支出",
      centsToYuanInput(entry.amountCents),
      entry.category,
      entry.purpose ?? "",
      entry.relatedProject,
      entry.note,
      accounts.find((account) => account.id === entry.storedValueAccountId)?.name ?? entry.storedValueAccountId ?? "",
      entry.type === "topup" ? centsToYuanInput(storedValuePaidCents(entry)) : "",
      entry.type === "topup" ? centsToYuanInput(entry.bonusCents ?? 0) : "",
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\n")}`;
}
