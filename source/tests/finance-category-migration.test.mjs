import test from "node:test";
import assert from "node:assert/strict";
import { createInitialFinanceState, expenseByCategory, financeSummary, normalizeFinanceState } from "../lib/finance.ts";

test("legacy 人情 category merges into 人情往来 without changing transactions or budgets", () => {
  const saved = createInitialFinanceState();
  saved.entries = [{
    id: "legacy-gift", type: "expense", amountCents: 2500, category: "人情",
    date: "2026-09-26", time: "12:00", note: "礼物", relatedProject: "",
    createdAt: "2026-09-26T04:00:00.000Z", updatedAt: "2026-09-26T04:00:00.000Z", origin: "manual",
  }];
  saved.expenseCategories.push("人情");
  saved.budgets["2026-09"] = { totalCents: 10000, categoryCents: { 人情: 3000 } };
  saved.merchantCategories["expense:文创小店"] = "人情";

  const normalized = normalizeFinanceState(saved);
  assert.equal(normalized.entries[0].category, "人情往来");
  assert.equal(normalized.expenseCategories.filter((category) => category === "人情往来").length, 1);
  assert.equal(normalized.expenseCategories.includes("人情"), false);
  assert.deepEqual(normalized.budgets["2026-09"].categoryCents, { 人情往来: 3000 });
  assert.equal(normalized.merchantCategories["expense:文创小店"], "人情往来");
  assert.deepEqual(expenseByCategory(normalized.entries, "2026-09"), [{ category: "人情往来", amountCents: 2500 }]);
  assert.equal(financeSummary(normalized.entries, "2026-09").expenseCents, 2500);
});

test("a budget under the current category name takes precedence over the legacy alias", () => {
  const saved = createInitialFinanceState();
  saved.budgets["2026-09"] = { totalCents: 10000, categoryCents: { 人情往来: 4000, 人情: 3000 } };
  assert.equal(normalizeFinanceState(saved).budgets["2026-09"].categoryCents["人情往来"], 4000);
});

test("old study, housing and health categories migrate with their transactions and budgets", () => {
  const saved = createInitialFinanceState();
  const base = { id: "old", type: "expense", amountCents: 100, date: "2026-09-26", time: "12:00", note: "旧记录", relatedProject: "", createdAt: "2026-09-26T04:00:00.000Z", updatedAt: "2026-09-26T04:00:00.000Z", origin: "manual" };
  saved.entries = ["学习", "居住", "健康"].map((category, index) => ({ ...base, id: `${base.id}-${index}`, category }));
  saved.expenseCategories.push("学习", "居住", "健康");
  saved.budgets["2026-09"] = { totalCents: 3000, categoryCents: { 学习: 500, 居住: 600, 健康: 700 } };
  const normalized = normalizeFinanceState(saved);
  assert.deepEqual(normalized.entries.map((entry) => entry.category), ["教育", "住房", "医疗健康"]);
  assert.deepEqual(normalized.budgets["2026-09"].categoryCents, { 教育: 500, 住房: 600, 医疗健康: 700 });
  for (const old of ["学习", "居住", "健康"]) assert.equal(normalized.expenseCategories.includes(old), false);
  for (const current of ["教育", "住房", "医疗健康"]) assert.equal(normalized.expenseCategories.filter((category) => category === current).length, 1);
});
