import test from "node:test";
import assert from "node:assert/strict";
import { createInitialFinanceState, expenseByCategory, financeCsv, financeSummary, incomeByCategory, normalizeFinanceState, parseStoredValueTopup, storedValueBalance, storedValuePaidCents, storedValueTotals } from "../lib/finance.ts";
import { createEmptyWorkspaceState, workspaceStateSchema } from "../lib/workspace-state-schema.ts";
import { mergeWeChatBillEntries, recategorizeWeChatMonth } from "../lib/wechat-bill-import.ts";

const account = { id: "campus", name: "校园卡", openingBalanceCents: 10000 };
const record = (id, type, amountCents, patch = {}) => ({
  id, type, amountCents, category: type === "income" ? "兼职" : type === "topup" ? "储值充值" : "餐饮",
  date: "2026-10-25", time: "12:00", note: id, relatedProject: "", origin: "manual",
  createdAt: "2026-10-25T04:00:00.000Z", updatedAt: "2026-10-25T04:00:00.000Z", ...patch,
});
const fixture = () => ({ ...createInitialFinanceState(), storedValueAccounts: [account], entries: [
  record("topup", "topup", 20000, { storedValueAccountId: account.id }),
  record("lunch", "expense", 3500, { storedValueAccountId: account.id }),
  record("metro", "expense", 1250, { category: "交通" }),
  record("income", "income", 30000),
  record("last-month", "topup", 5000, { date: "2026-09-25", storedValueAccountId: account.id }),
] });

test("legacy finance data keeps every record, amount and date without creating stored-value activity", () => {
  const previous = createInitialFinanceState();
  delete previous.storedValueAccounts;
  previous.entries = [record("old", "expense", 1999), record("pay", "income", 100000)];
  const normalized = normalizeFinanceState(JSON.parse(JSON.stringify(previous)));
  assert.deepEqual(normalized.entries, previous.entries);
  assert.deepEqual(normalized.storedValueAccounts, []);
  assert.deepEqual(financeSummary(normalized.entries, "2026-10"), { incomeCents: 100000, expenseCents: 1999, netCents: 98001 });
  assert.equal(workspaceStateSchema.safeParse({ ...createEmptyWorkspaceState(), finance: previous }).success, true);
});

test("top-ups and opening balance are excluded from monthly income, expense, category pies and budget spending", () => {
  const finance = fixture();
  assert.deepEqual(financeSummary(finance.entries, "2026-10"), { incomeCents: 30000, expenseCents: 4750, netCents: 25250 });
  assert.deepEqual(expenseByCategory(finance.entries, "2026-10"), [{ category: "餐饮", amountCents: 3500 }, { category: "交通", amountCents: 1250 }]);
  assert.deepEqual(incomeByCategory(finance.entries, "2026-10"), [{ category: "兼职", amountCents: 30000 }]);
  assert.deepEqual(storedValueTotals(finance.entries.filter((entry) => entry.date.startsWith("2026-10"))), { topupCents: 20000, paidCents: 20000, bonusCents: 0, spentCents: 3500 });
  assert.equal(storedValueBalance(account, finance.entries), 31500);
  assert.deepEqual(incomeByCategory(finance.entries, "2026-09"), []);
  assert.equal(financeSummary(finance.entries, "2026-09").expenseCents, 0);
});

test("editing or deleting ledger entries immediately changes the derived balance and cannot double-count consumption", () => {
  const finance = fixture();
  assert.equal(storedValueBalance(account, finance.entries.map((entry) => entry.id === "topup" ? { ...entry, amountCents: 15000 } : entry)), 26500);
  assert.equal(storedValueBalance(account, finance.entries.filter((entry) => entry.id !== "lunch")), 35000);
  const moved = finance.entries.map((entry) => entry.id === "lunch" ? { ...entry, storedValueAccountId: undefined } : entry);
  assert.equal(storedValueBalance(account, moved), 35000);
  assert.equal(financeSummary(moved, "2026-10").expenseCents, 4750);
  assert.equal(storedValueBalance({ ...account, openingBalanceCents: 0 }, [record("historical-spend", "expense", 900, { storedValueAccountId: account.id })]), -900);
});

test("workspace save and JSON round trip retain stored-value projects and links; invalid references fail validation", () => {
  const finance = normalizeFinanceState(JSON.parse(JSON.stringify(fixture())));
  assert.deepEqual(finance, fixture());
  const state = { ...createEmptyWorkspaceState(), finance };
  assert.equal(workspaceStateSchema.safeParse(state).success, true);
  for (const entry of [record("missing", "topup", 100), record("unknown", "expense", 100, { storedValueAccountId: "unknown" }), record("income-link", "income", 100, { storedValueAccountId: account.id })]) {
    assert.equal(workspaceStateSchema.safeParse({ ...state, finance: { ...finance, entries: [entry] } }).success, false);
  }
  for (const accounts of [[account, account], [{ ...account, openingBalanceCents: -1 }], [{ ...account, openingBalanceCents: Number.MAX_SAFE_INTEGER }]]) {
    assert.equal(workspaceStateSchema.safeParse({ ...state, finance: { ...finance, storedValueAccounts: accounts } }).success, false);
  }
});

test("reimport and automatic WeChat categorization preserve manually reclassified top-ups and original import identity", () => {
  const imported = record("wechat-topup", "expense", 20000, { category: "校园卡充值", merchant: "学校", note: "学校 · 校园卡充值", origin: "wechat" });
  const stored = { ...imported, type: "topup", category: "储值充值", storedValueAccountId: account.id, bonusCents: 2000, updatedAt: "2026-10-25T05:00:00.000Z" };
  const finance = { ...createInitialFinanceState(), storedValueAccounts: [account], entries: [stored] };
  const merged = mergeWeChatBillEntries(finance, [imported], { updateExistingCategories: true });
  assert.equal(merged.added, 0);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.recategorized, 0);
  assert.deepEqual(merged.finance.entries, [stored]);
  assert.deepEqual(recategorizeWeChatMonth(merged.finance, "2026-10").finance.entries, [stored]);
  assert.equal(financeSummary(merged.finance.entries, "2026-10").expenseCents, 0);
  assert.equal(storedValueBalance(account, merged.finance.entries), 30000);
});

test("CSV separates top-ups and names the stored-value project for both top-ups and purchases", () => {
  const finance = fixture();
  const csv = financeCsv(finance.entries, finance.storedValueAccounts);
  assert.match(csv, /"储值项目"/);
  assert.match(csv, /"储值充值","200\.00"/);
  assert.match(csv, /"支出","35\.00"/);
  assert.equal(csv.split("\n").filter((row) => row.includes(',"校园卡",')).length, 3);
});

test("paid and bonus amounts are recorded separately while only the combined credit increases balance", () => {
  assert.deepEqual(parseStoredValueTopup("100", "20"), { amountCents: 12000, bonusCents: 2000 });
  assert.deepEqual(parseStoredValueTopup("0", "20"), { amountCents: 2000, bonusCents: 2000 });
  assert.deepEqual(parseStoredValueTopup("100", ""), { amountCents: 10000, bonusCents: 0 });
  for (const [paid, bonus] of [["0", "0"], ["100", "-1"], ["abc", "20"], ["10.999", "0"], ["100000000", "1"]]) assert.equal(parseStoredValueTopup(paid, bonus), null);
  const topup = record("gifted", "topup", 12000, { bonusCents: 2000, storedValueAccountId: account.id });
  const expense = record("used", "expense", 2500, { storedValueAccountId: account.id });
  const entries = [topup, expense];
  assert.equal(storedValuePaidCents(topup), 10000);
  assert.equal(storedValueBalance({ ...account, openingBalanceCents: 0 }, entries), 9500);
  assert.deepEqual(storedValueTotals(entries), { topupCents: 12000, paidCents: 10000, bonusCents: 2000, spentCents: 2500 });
  assert.deepEqual(financeSummary(entries, "2026-10"), { incomeCents: 0, expenseCents: 2500, netCents: -2500 });
  assert.equal(storedValueBalance(account, [expense]), 7500);
});

test("bonus survives workspace and CSV export; historical credits default to fully paid and invalid splits are rejected", () => {
  const topup = record("gifted", "topup", 12000, { bonusCents: 2000, storedValueAccountId: account.id });
  const finance = { ...fixture(), entries: [topup, record("old-credit", "topup", 5000, { storedValueAccountId: account.id })] };
  const restored = normalizeFinanceState(JSON.parse(JSON.stringify(finance)));
  const state = { ...createEmptyWorkspaceState(), finance: restored };
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
  assert.equal(restored.entries[0].bonusCents, 2000);
  assert.equal(storedValuePaidCents(restored.entries[1]), 5000);
  assert.match(financeCsv(restored.entries, restored.storedValueAccounts), /"校园卡","100\.00","20\.00"/);
  for (const patch of [{ bonusCents: -1 }, { bonusCents: 12001 }, { bonusCents: 1.5 }, { type: "expense" }, { type: "income", storedValueAccountId: undefined }]) {
    assert.equal(workspaceStateSchema.safeParse({ ...state, finance: { ...restored, entries: [{ ...topup, ...patch }] } }).success, false);
  }
});
