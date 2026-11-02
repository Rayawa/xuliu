import { FinanceState, FinanceEntry, PaymentRule } from '../../models/Workspace';
import { MAX_FINANCE_ENTRIES } from '../../config/constants';
import { normalizeMerchantName, merchantFromEntry, merchantCategoryKey, paymentAmountKey, transactionCategoryKey, classifyWeChatCategory } from './FinanceCategories';
import { CategoryMigration, RuleRow } from './FinanceDomain';

interface LearnedGroup { categories: Set<string>; purposes: Set<string>; }
export interface ImportMergeResult { added: number; duplicates: number; recategorized: number; }

function learnedPayments(finance: FinanceState): Map<string, PaymentRule | null> {
  const examples: Map<string, LearnedGroup> = new Map();
  for (const entry of finance.entries) {
    if (entry.origin !== 'wechat' || entry.type === 'topup' || entry.updatedAt === entry.createdAt) continue;
    const merchant = merchantFromEntry(entry.note, entry.merchant);
    if (!merchant || merchant === '微信支付') continue;
    const editedNote = entry.note.trim() && !normalizeMerchantName(entry.note).startsWith(normalizeMerchantName(merchant));
    const purpose = entry.purpose?.trim() || (editedNote ? entry.note.trim().slice(0, 80) : '');
    const inferred = classifyWeChatCategory(entry.type, { counterparty: merchant, product: entry.note, amountCents: entry.amountCents });
    if (!purpose && entry.category === inferred) continue;
    const key = paymentAmountKey(entry.type, merchant, entry.amountCents);
    const group: LearnedGroup = examples.get(key) ?? { categories: new Set<string>(), purposes: new Set<string>() };
    group.categories.add(entry.category); if (purpose) group.purposes.add(purpose); examples.set(key, group);
  }
  const result: Map<string, PaymentRule | null> = new Map();
  examples.forEach((group, key) => result.set(key, group.categories.size === 1 ? {
    category: Array.from(group.categories)[0], purpose: group.purposes.size === 1 ? Array.from(group.purposes)[0] : ''
  } : null));
  return result;
}

function resolvePayment(finance: FinanceState, entry: FinanceEntry, inferred: string, learned: Map<string, PaymentRule | null>): PaymentRule {
  const merchant = merchantFromEntry(entry.note, entry.merchant);
  const specific = finance.merchantCategories?.[transactionCategoryKey(entry.type, merchant, entry.note)];
  const detail = entry.note.split(' · ').slice(1).join(' ');
  const explicit = detail ? classifyWeChatCategory(entry.type, { product: detail }) : '其他';
  const key = paymentAmountKey(entry.type, merchant, entry.amountCents);
  const learnedRule = learned.get(key);
  const rule = learnedRule === null ? undefined : finance.paymentRules?.[key] || learnedRule;
  const recognized = explicit !== '其他' && explicit !== '其他收入' ? explicit : undefined;
  const category = specific || recognized || rule?.category || (inferred !== '其他' && inferred !== '其他收入' ? inferred : undefined) ||
    finance.merchantCategories?.[merchantCategoryKey(entry.type, merchant)] || inferred;
  return { category, purpose: rule?.category === category && (!recognized || recognized === category) ? rule.purpose : '' };
}

export function mergeImportedEntries(finance: FinanceState, imported: FinanceEntry[], updateExisting: boolean = false): ImportMergeResult {
  const known = new Set(finance.entries.map((entry) => entry.id));
  const additions = imported.filter((entry) => { if (known.has(entry.id)) return false; known.add(entry.id); return true; });
  if (finance.entries.length + additions.length > MAX_FINANCE_ENTRIES) throw new Error('账目将超过20000笔，请先导出并整理');
  const learned = learnedPayments(finance);
  const categorized = additions.map((original): FinanceEntry => {
    const entry = JSON.parse(JSON.stringify(original)) as FinanceEntry;
    const rule = resolvePayment(finance, entry, entry.category, learned); entry.category = rule.category;
    if (rule.purpose) entry.purpose = rule.purpose; return entry;
  });
  let recategorized = 0;
  if (updateExisting) {
    const source: Map<string, FinanceEntry> = new Map(); imported.forEach((entry) => source.set(entry.id, entry));
    finance.entries.forEach((entry) => {
      const original = source.get(entry.id); if (!original || entry.type === 'topup') return;
      const rule = resolvePayment(finance, original, original.category, learned);
      const purpose = entry.purpose || (entry.note === rule.purpose ? '' : rule.purpose || '');
      if (entry.category === rule.category && (entry.purpose ?? '') === purpose) return;
      entry.category = rule.category; if (purpose) entry.purpose = purpose;
      entry.updatedAt = new Date().toISOString(); recategorized++;
    });
  }
  finance.entries = categorized.concat(finance.entries);
  const importedIds = new Set(imported.map((entry) => entry.id));
  const touched = categorized.concat(updateExisting ? finance.entries.filter((entry) => importedIds.has(entry.id)) : []);
  const expense = touched.filter((entry) => entry.type === 'expense').map((entry) => entry.category);
  const income = touched.filter((entry) => entry.type === 'income').map((entry) => entry.category);
  finance.expenseCategories = Array.from(new Set(finance.expenseCategories.concat(expense)));
  finance.incomeCategories = Array.from(new Set(finance.incomeCategories.concat(income)));
  return { added: categorized.length, duplicates: imported.length - additions.length, recategorized };
}

export function recategorizeMonth(finance: FinanceState, month: string): number {
  const learned = learnedPayments(finance); let changed = 0;
  finance.entries.forEach((entry) => {
    if (entry.origin !== 'wechat' || entry.type === 'topup' || !entry.date.startsWith(month)) return;
    const merchant = merchantFromEntry(entry.note, entry.merchant);
    const inferred = classifyWeChatCategory(entry.type, { counterparty: merchant, product: entry.note, amountCents: entry.amountCents });
    const rule = resolvePayment(finance, entry, inferred, learned);
    const purpose = entry.purpose || (entry.note === rule.purpose ? '' : rule.purpose);
    if (entry.category === rule.category && (entry.purpose ?? '') === purpose) return;
    entry.category = rule.category; if (purpose) entry.purpose = purpose; entry.updatedAt = new Date().toISOString(); changed++;
  });
  finance.expenseCategories = Array.from(new Set(finance.expenseCategories.concat(finance.entries.filter((entry) => entry.type === 'expense').map((entry) => entry.category))));
  finance.incomeCategories = Array.from(new Set(finance.incomeCategories.concat(finance.entries.filter((entry) => entry.type === 'income').map((entry) => entry.category))));
  return changed;
}

export function financeRuleRows(finance: FinanceState): RuleRow[] {
  const rows: RuleRow[] = [];
  Object.keys(finance.merchantCategories ?? ({} as Record<string, string>)).forEach((key) => rows.push({ key, category: finance.merchantCategories?.[key] ?? '', purpose: '', kind: 'category' }));
  Object.keys(finance.paymentRules ?? ({} as Record<string, PaymentRule>)).forEach((key) => {
    const rule = finance.paymentRules?.[key]; if (rule) rows.push({ key, category: rule.category, purpose: rule.purpose, kind: 'payment' });
  });
  return rows;
}

export function saveFinanceRule(finance: FinanceState, type: string, scope: string, merchant: string, note: string,
  cents: number, category: string, purpose: string, existing?: RuleRow): void {
  if (!merchant.trim() && !existing) throw new Error('请填写商户');
  if (!category.trim() || category.trim().length > 40 || purpose.length > 80) throw new Error('分类需为1–40字，用途最多80字');
  if (existing?.kind === 'payment' || (!existing && scope === 'amount')) {
    if (!existing && (!Number.isSafeInteger(cents) || cents <= 0)) throw new Error('固定金额规则需要有效金额');
    if (!finance.paymentRules) finance.paymentRules = {};
    const key = existing?.key ?? paymentAmountKey(type, merchant, cents);
    finance.paymentRules[key] = { category: category.trim(), purpose: purpose.trim() };
  } else {
    if (!finance.merchantCategories) finance.merchantCategories = {};
    const key = existing?.key ?? (scope === 'detail' ? transactionCategoryKey(type, merchant, note) : merchantCategoryKey(type, merchant));
    finance.merchantCategories[key] = category.trim();
  }
}

const LEGACY_CATEGORIES: Record<string, string> = { '人情': '人情往来', '学习': '教育', '居住': '住房', '健康': '医疗健康' };

export function migrateExpenseCategories(finance: FinanceState): CategoryMigration {
  const result: CategoryMigration = { entries: 0, budgets: 0, rules: 0, changed: false };
  const canonical = (category: string): string => LEGACY_CATEGORIES[category.trim()] || category.trim();
  finance.entries.forEach((entry) => {
    if (entry.type === 'expense' && canonical(entry.category) !== entry.category) { entry.category = canonical(entry.category); result.entries++; }
  });
  Object.keys(finance.budgets).forEach((month) => {
    const budget = finance.budgets[month]; const categories: Record<string, number> = {};
    Object.keys(budget.categoryCents).forEach((category) => {
      const next = canonical(category);
      if (category === next || categories[next] === undefined) categories[next] = budget.categoryCents[category];
      if (category !== next) result.budgets++;
    });
    budget.categoryCents = categories;
  });
  Object.keys(finance.merchantCategories ?? ({} as Record<string, string>)).forEach((key) => {
    const value = finance.merchantCategories?.[key];
    if (value && key.startsWith('expense:') && value !== canonical(value) && finance.merchantCategories) {
      finance.merchantCategories[key] = canonical(value); result.rules++;
    }
  });
  Object.keys(finance.paymentRules ?? ({} as Record<string, PaymentRule>)).forEach((key) => {
    const rule = finance.paymentRules?.[key];
    if (rule && key.startsWith('expense:') && rule.category !== canonical(rule.category)) { rule.category = canonical(rule.category); result.rules++; }
  });
  const categories = Array.from(new Set(finance.expenseCategories.map(canonical)));
  result.changed = result.entries + result.budgets + result.rules > 0 || JSON.stringify(categories) !== JSON.stringify(finance.expenseCategories);
  finance.expenseCategories = categories; return result;
}

export function removeFinanceRule(finance: FinanceState, rule: RuleRow): void {
  if (rule.kind === 'payment') {
    const next: Record<string, PaymentRule> = {};
    Object.keys(finance.paymentRules ?? ({} as Record<string, PaymentRule>)).filter((key) => key !== rule.key).forEach((key) => {
      const value = finance.paymentRules?.[key]; if (value) next[key] = value;
    });
    finance.paymentRules = next;
  } else {
    const next: Record<string, string> = {};
    Object.keys(finance.merchantCategories ?? ({} as Record<string, string>)).filter((key) => key !== rule.key).forEach((key) => {
      const value = finance.merchantCategories?.[key]; if (value !== undefined) next[key] = value;
    });
    finance.merchantCategories = next;
  }
}
