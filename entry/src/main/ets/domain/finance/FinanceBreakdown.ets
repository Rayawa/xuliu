import { FinanceEntry } from '../../models/Workspace';
import { expenseDetailCategory } from './FinanceCategories';

export interface FinancePurposeGroup {
  label: string;
  amountCents: number;
  entries: FinanceEntry[];
}

export interface FinanceCategoryGroup {
  label: string;
  amountCents: number;
  count: number;
  purposes: FinancePurposeGroup[];
}

export interface FinanceBreakdownData {
  amountCents: number;
  count: number;
  categories: FinanceCategoryGroup[];
}

export function emptyFinanceBreakdown(): FinanceBreakdownData {
  return { amountCents: 0, count: 0, categories: [] };
}

export function financeBreakdown(entries: FinanceEntry[], month: string, type: string): FinanceBreakdownData {
  const result = emptyFinanceBreakdown();
  const categories = new Map<string, FinanceCategoryGroup>();
  const purposes = new Map<string, Map<string, FinancePurposeGroup>>();
  const ordered = entries.filter((entry) => entry.type === type && entry.date.startsWith(month))
    .sort((left, right) => right.date.localeCompare(left.date) || right.time.localeCompare(left.time));
  for (const entry of ordered) {
    let category = categories.get(entry.category);
    if (!category) {
      category = { label: entry.category, amountCents: 0, count: 0, purposes: [] };
      categories.set(entry.category, category);
      purposes.set(entry.category, new Map<string, FinancePurposeGroup>());
      result.categories.push(category);
    }
    const groups = purposes.get(entry.category) as Map<string, FinancePurposeGroup>;
    const label = type === 'expense' ? expenseDetailCategory(entry) : entry.purpose || entry.note || entry.category;
    let purpose = groups.get(label);
    if (!purpose) {
      purpose = { label, amountCents: 0, entries: [] };
      groups.set(label, purpose);
      category.purposes.push(purpose);
    }
    purpose.entries.push(entry);
    purpose.amountCents += entry.amountCents;
    category.count++;
    category.amountCents += entry.amountCents;
    result.count++;
    result.amountCents += entry.amountCents;
  }
  result.categories.sort((left, right) => right.amountCents - left.amountCents);
  for (const category of result.categories) {
    category.purposes.sort((left, right) => right.amountCents - left.amountCents);
  }
  return result;
}
