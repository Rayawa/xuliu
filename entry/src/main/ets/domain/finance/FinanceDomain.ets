import { PaymentRule } from '../../models/Workspace';
import { FinanceState, FinanceEntry, Budget, ChartDatum, StoredValueAccount } from '../../models/Workspace';
import { MAX_FINANCE_CENTS, MAX_FINANCE_ENTRIES, MAX_FINANCE_CATEGORIES, MAX_STORED_VALUE_ACCOUNTS } from '../../config/constants';
import { localDate, localTime, validDate, validTime, uid } from '../workspace/WorkspaceDomain';
import { transactionCategoryKey, paymentAmountKey, merchantFromEntry } from './FinanceCategories';

export interface FinanceEntryDraft {
  type: string;
  amount: string;
  bonus: string;
  category: string;
  date: string;
  time: string;
  note: string;
  purpose: string;
  project: string;
  merchant: string;
  storedId: string;
  learnDetail: boolean;
  learnPayment: boolean;
}

export interface FinanceTotals {
  income: number;
  expense: number;
  net: number;
}

export interface FinanceTrendPoint {
  date: string;
  income: number;
  expense: number;
}

export interface CategoryMigration {
  entries: number;
  budgets: number;
  rules: number;
  changed: boolean;
}

export interface RuleRow {
  key: string;
  category: string;
  purpose: string;
  kind: string;
}

export function validMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) >= 1900;
}

export function amountCents(input: string, allowZero: boolean = false): number {
  const value = input.replace(/,/g, '').trim();
  if (!value && allowZero) return 0;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error('金额需为非负数字，最多两位小数');
  const parts = value.split('.');
  const cents = Number(parts[0]) * 100 + Number((parts[1] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_FINANCE_CENTS || (cents <= 0 && !allowZero)) throw new Error('请输入有效金额');
  return cents;
}

export function amountInput(cents: number): string { return (cents / 100).toFixed(2); }

export function newFinanceDraft(entry?: FinanceEntry): FinanceEntryDraft {
  return {
    type: entry?.type ?? 'expense', amount: entry ? amountInput(entry.type === 'topup' ? entry.amountCents - (entry.bonusCents ?? 0) : entry.amountCents) : '',
    bonus: entry?.type === 'topup' ? amountInput(entry.bonusCents ?? 0) : '', category: entry?.category ?? '其他',
    date: entry?.date ?? localDate(), time: entry?.time ?? localTime(), note: entry?.note ?? '', purpose: entry?.purpose ?? '',
    project: entry?.relatedProject ?? '', merchant: entry?.merchant ?? '', storedId: entry?.storedValueAccountId ?? '', learnDetail: false, learnPayment: false
  };
}

export function assertBudget(budget: Budget): void {
  const values = [budget.totalCents].concat(Object.keys(budget.categoryCents).map((key) => budget.categoryCents[key]));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_FINANCE_CENTS)) throw new Error('预算金额无效');
}

export function financeTotals(finance: FinanceState, month: string): FinanceTotals {
  const totals: FinanceTotals = { income: 0, expense: 0, net: 0 };
  finance.entries.filter((entry) => entry.date.startsWith(month)).forEach((entry) => {
    if (entry.type === 'income') totals.income += entry.amountCents;
    else if (entry.type === 'expense') totals.expense += entry.amountCents;
  });
  totals.net = totals.income - totals.expense; return totals;
}

export function categoryChart(finance: FinanceState, month: string, type: string): ChartDatum[] {
  const totals: Map<string, number> = new Map();
  finance.entries.filter((entry) => entry.type === type && entry.date.startsWith(month)).forEach((entry) => {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents);
  });
  const result: ChartDatum[] = []; totals.forEach((value, label) => result.push({ label, value }));
  return result.sort((a, b) => b.value - a.value);
}

export function monthTrend(finance: FinanceState, month: string): FinanceTrendPoint[] {
  if (!validMonth(month)) return [];
  const count = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const result: FinanceTrendPoint[] = [];
  for (let day = 1; day <= count; day++) result.push({ date: `${month}-${String(day).padStart(2, '0')}`, income: 0, expense: 0 });
  finance.entries.filter((entry) => entry.date.startsWith(month)).forEach((entry) => {
    const point = result[Number(entry.date.slice(-2)) - 1]; if (!point) return;
    if (entry.type === 'income') point.income += entry.amountCents;
    if (entry.type === 'expense') point.expense += entry.amountCents;
  });
  return result;
}

export function saveFinanceEntry(finance: FinanceState, draft: FinanceEntryDraft, id: string = ''): FinanceEntry {
  if (!['income', 'expense', 'topup'].includes(draft.type) || !validDate(draft.date) || !validTime(draft.time)) throw new Error('请选择有效的类型、日期和时间');
  if (draft.category.trim().length > 40 || draft.purpose.trim().length > 80 || draft.note.length > 500 || draft.project.length > 200 || draft.merchant.length > 200) throw new Error('分类最多40字、用途80字、备注500字、商户或项目200字');
  const old = finance.entries.find((entry) => entry.id === id);
  if (id && !old) throw new Error('这笔账目已不存在，请返回明细重新打开');
  if (!old && finance.entries.length >= MAX_FINANCE_ENTRIES) throw new Error('账目最多20000笔，请先导出并整理');
  const entry: FinanceEntry = old ? JSON.parse(JSON.stringify(old)) as FinanceEntry : {
    id: uid(), type: draft.type, amountCents: 0, category: '', date: draft.date, time: draft.time,
    note: '', relatedProject: '', createdAt: new Date().toISOString(), updatedAt: '', origin: 'manual'
  };
  entry.type = draft.type; entry.date = draft.date; entry.time = draft.time;
  entry.category = draft.type === 'topup' ? '储值充值' : draft.category.trim() || (draft.type === 'income' ? '其他收入' : '其他');
  entry.note = draft.note; entry.purpose = draft.purpose.trim() || undefined; entry.relatedProject = draft.project;
  entry.merchant = draft.merchant.trim() || undefined; entry.updatedAt = new Date().toISOString();
  entry.amountCents = amountCents(draft.amount, draft.type === 'topup'); entry.bonusCents = undefined; entry.storedValueAccountId = undefined;
  if (draft.type === 'topup') {
    const bonus = amountCents(draft.bonus, true);
    entry.amountCents += bonus; entry.bonusCents = bonus;
    if (entry.amountCents <= 0 || entry.amountCents > MAX_FINANCE_CENTS) throw new Error('实付与赠送合计需大于0，且不超过金额上限');
  }
  if (draft.type !== 'income' && draft.storedId) {
    if (!finance.storedValueAccounts?.some((account) => account.id === draft.storedId)) throw new Error('请选择有效的储值项目');
    entry.storedValueAccountId = draft.storedId;
  }
  if (draft.type === 'topup' && !entry.storedValueAccountId) throw new Error('充值需要选择储值项目');
  const categories = draft.type === 'income' ? finance.incomeCategories : finance.expenseCategories;
  if (draft.type !== 'topup' && !categories.includes(entry.category)) {
    if (categories.length >= MAX_FINANCE_CATEGORIES) throw new Error('分类最多200个'); categories.push(entry.category);
  }
  const merchant = merchantFromEntry(entry.note, entry.merchant);
  if (draft.type !== 'topup' && draft.learnDetail && merchant) {
    if (!finance.merchantCategories) finance.merchantCategories = {};
    finance.merchantCategories[transactionCategoryKey(draft.type, merchant, old?.note || entry.note)] = entry.category;
    finance.merchantCategories[transactionCategoryKey(draft.type, merchant, entry.note)] = entry.category;
  }
  if (draft.type !== 'topup' && draft.learnPayment && merchant) {
    if (!finance.paymentRules) finance.paymentRules = {};
    finance.paymentRules[paymentAmountKey(draft.type, merchant, entry.amountCents)] = { category: entry.category, purpose: draft.purpose.trim() };
  }
  const index = finance.entries.findIndex((value) => value.id === entry.id);
  if (index < 0) finance.entries.unshift(entry); else finance.entries[index] = entry;
  return entry;
}

export function categoryChoices(finance: FinanceState, type: string): string[] {
  const choices = type === 'income' ? finance.incomeCategories : finance.expenseCategories;
  return Array.from(new Set(choices.concat(finance.entries.filter((entry) => entry.type === type).map((entry) => entry.category))));
}

export function saveStoredAccount(finance: FinanceState, name: string, opening: string, id: string = ''): StoredValueAccount {
  const title = name.trim();
  if (!title || title.length > 40) throw new Error('储值项目名称需为1–40字');
  const accounts = finance.storedValueAccounts ?? [];
  if (accounts.some((account) => account.id !== id && account.name === title)) throw new Error('已有同名储值项目');
  const index = accounts.findIndex((account) => account.id === id);
  if (id && index < 0) throw new Error('此储值项目已不存在');
  if (index < 0 && accounts.length >= MAX_STORED_VALUE_ACCOUNTS) throw new Error('最多100个储值项目');
  const account: StoredValueAccount = { id: id || uid(), name: title, openingBalanceCents: amountCents(opening, true) };
  if (index >= 0) accounts[index] = account; else accounts.push(account);
  finance.storedValueAccounts = accounts; return account;
}

export function financeCsv(finance: FinanceState, month: string): string {
  const cell = (value: string): string => `"${(/^[=+\-@]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  const rows: string[][] = [['日期', '时间', '类型', '金额（元）', '分类', '识别用途', '关联项目', '备注', '储值项目', '储值实付（元）', '储值赠送（元）']];
  finance.entries.filter((entry) => entry.date.startsWith(month)).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).forEach((entry) => {
    rows.push([entry.date, entry.time, entry.type === 'income' ? '收入' : entry.type === 'topup' ? '储值充值' : '支出',
      amountInput(entry.amountCents), entry.category, entry.purpose ?? '', entry.relatedProject, entry.note,
      finance.storedValueAccounts?.find((account) => account.id === entry.storedValueAccountId)?.name ?? '',
      entry.type === 'topup' ? amountInput(entry.amountCents - (entry.bonusCents ?? 0)) : '', entry.type === 'topup' ? amountInput(entry.bonusCents ?? 0) : '']);
  });
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\n');
}

export interface StoredValueSummary extends StoredValueAccount {
  balance: number;
  paid: number;
  bonus: number;
  spent: number;
}

export function storedValueSummaries(finance: FinanceState): StoredValueSummary[] {
  const result = (finance.storedValueAccounts ?? []).map((account): StoredValueSummary => ({
    id: account.id, name: account.name, openingBalanceCents: account.openingBalanceCents,
    balance: account.openingBalanceCents, paid: 0, bonus: 0, spent: 0
  }));
  const accounts: Map<string, StoredValueSummary> = new Map(); result.forEach((account) => accounts.set(account.id, account));
  finance.entries.forEach((entry) => {
    const account = accounts.get(entry.storedValueAccountId ?? ''); if (!account) return;
    if (entry.type === 'topup') {
      account.balance += entry.amountCents; account.paid += entry.amountCents - (entry.bonusCents ?? 0); account.bonus += entry.bonusCents ?? 0;
    }
    if (entry.type === 'expense') { account.spent += entry.amountCents; account.balance -= entry.amountCents; }
  });
  return result;
}

export function renameCategory(finance: FinanceState, type: string, previous: string, next: string): void {
  const title = next.trim(); const choices = type === 'income' ? finance.incomeCategories : finance.expenseCategories;
  if (!title || title.length > 40) throw new Error('分类需为1–40字');
  if (title !== previous && choices.includes(title)) throw new Error('已有同名分类');
  if (type === 'income') finance.incomeCategories = choices.map((value) => value === previous ? title : value);
  else finance.expenseCategories = choices.map((value) => value === previous ? title : value);
  finance.entries.forEach((entry) => { if (entry.type === type && entry.category === previous) entry.category = title; });
  if (type === 'expense' && previous !== title) Object.keys(finance.budgets).forEach((month) => {
    const budget = finance.budgets[month];
    if (Object.keys(budget.categoryCents).includes(previous)) {
      const values: Map<string, number> = new Map(); Object.keys(budget.categoryCents).forEach((key) => values.set(key, budget.categoryCents[key]));
      const amount = values.get(previous) ?? 0; values.delete(previous); values.set(title, (values.get(title) ?? 0) + amount);
      const categories: Record<string, number> = {};
      values.forEach((value, key) => { categories[key] = value; });
      budget.categoryCents = categories;
    }
  });
  Object.keys(finance.merchantCategories ?? ({} as Record<string, string>)).forEach((key) => {
    if (key.startsWith(`${type}:`) && finance.merchantCategories?.[key] === previous && finance.merchantCategories) finance.merchantCategories[key] = title;
  });
  Object.keys(finance.paymentRules ?? ({} as Record<string, PaymentRule>)).forEach((key) => {
    const rule = finance.paymentRules?.[key]; if (key.startsWith(`${type}:`) && rule?.category === previous) rule.category = title;
  });
}

export function assertFinance(finance: FinanceState): void {
  if (finance.entries.length > MAX_FINANCE_ENTRIES) throw new Error('账目最多20000笔');
  for (const list of [finance.expenseCategories, finance.incomeCategories]) {
    if (list.length > MAX_FINANCE_CATEGORIES || list.some((value) => typeof value !== 'string' || !value || value.length > 40)) throw new Error('分类格式无效或超过200项');
  }
  const ids: Set<string> = new Set();
  (finance.storedValueAccounts ?? []).forEach((account) => {
    if (!account || typeof account.id !== 'string' || !account.id || ids.has(account.id) || typeof account.name !== 'string' || !account.name.trim() || account.name.length > 40 ||
      !Number.isSafeInteger(account.openingBalanceCents) || account.openingBalanceCents < 0 || account.openingBalanceCents > MAX_FINANCE_CENTS) throw new Error('储值项目格式无效');
    ids.add(account.id);
  });
  if (ids.size > MAX_STORED_VALUE_ACCOUNTS) throw new Error('储值项目最多100个');
  const entryIds: Set<string> = new Set();
  finance.entries.forEach((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entryIds.has(entry.id) || !['income', 'expense', 'topup'].includes(entry.type) ||
      !Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0 || entry.amountCents > MAX_FINANCE_CENTS ||
      typeof entry.category !== 'string' || !entry.category || entry.category.length > 40 || typeof entry.date !== 'string' || !validDate(entry.date) ||
      typeof entry.time !== 'string' || !validTime(entry.time)) throw new Error('账目格式或金额无效');
    entryIds.add(entry.id);
    if (entry.type === 'topup' && !entry.storedValueAccountId) throw new Error('充值缺少储值项目');
    if (entry.storedValueAccountId && (entry.type === 'income' || !ids.has(entry.storedValueAccountId))) throw new Error('账目关联的储值项目无效');
    if (entry.bonusCents !== undefined && (entry.type !== 'topup' || !Number.isSafeInteger(entry.bonusCents) || entry.bonusCents < 0 || entry.bonusCents > entry.amountCents)) throw new Error('充值赠送金额无效');
  });
  Object.keys(finance.budgets).forEach((month) => { if (!validMonth(month)) throw new Error('预算月份无效'); assertBudget(finance.budgets[month]); });
  Object.keys(finance.merchantCategories ?? ({} as Record<string, string>)).forEach((key) => {
    const category = finance.merchantCategories?.[key];
    if (!key || key.length > 200 || typeof category !== 'string' || !category || category.length > 40) throw new Error('商户分类规则无效');
  });
  Object.keys(finance.paymentRules ?? ({} as Record<string, PaymentRule>)).forEach((key) => {
    const rule = finance.paymentRules?.[key];
    if (!key || key.length > 200 || !rule || typeof rule.category !== 'string' || !rule.category || rule.category.length > 40 || typeof rule.purpose !== 'string' || rule.purpose.length > 80) throw new Error('固定金额用途规则无效');
  });
}
