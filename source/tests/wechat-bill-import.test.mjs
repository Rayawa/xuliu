import test from "node:test";
import assert from "node:assert/strict";
import { createInitialFinanceState, normalizeFinanceState } from "../lib/finance.ts";
import { expenseDetailCategory, merchantCategoryKey, paymentAmountKey, transactionCategoryKey } from "../lib/finance-categories.ts";
import { mergeWeChatBillEntries, parseWeChatBillCsv, parseWeChatBillRows, recategorizeWeChatMonth } from "../lib/wechat-bill-import.ts";
import { workspaceStateSchema } from "../lib/workspace-state-schema.ts";

const header = "交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注";

test("personal WeChat CSV: preamble, quoted fields, income, expense and neutral rows", async () => {
  const csv = `\uFEFF微信支付账单明细\r\n记录时间：2026-09-25\r\n${header}\r\n`
    + '2026-09-24 12:03:04,商户消费,"食堂,一楼",午餐,支出,¥12.34,零钱,支付成功,10001,,"第一行\n第二行"\r\n'
    + '2026-09-24 13:00:00,转账,小明,生活费,收入,¥50.00,零钱,已收钱,10002,,\r\n'
    + '2026-09-24 14:00:00,充值,零钱,充值,/,¥100.00,银行卡,支付成功,10003,,\r\n'
    + '2026-09-24 15:00:00,商户消费,店铺,取消订单,支出,¥5.00,零钱,交易关闭,10004,,\r\n';
  const result = await parseWeChatBillRows(parseWeChatBillCsv(csv));
  assert.equal(result.transactionRows, 4);
  assert.equal(result.entries.length, 2);
  assert.equal(result.skippedNeutral, 1);
  assert.equal(result.skippedUnsuccessful, 1);
  assert.deepEqual(result.entries.map(({ type, amountCents }) => [type, amountCents]), [["expense", 1234], ["income", 5000]]);
  assert.equal(result.entries[0].date, "2026-09-24");
  assert.equal(result.entries[0].time, "12:03");
  assert.match(result.entries[0].note, /食堂,一楼.*第一行\n第二行/s);
  assert.equal(result.entries[0].origin, "wechat");
});

test("reimport does not duplicate entries; normalization preserves WeChat provenance", async () => {
  const rows = [header.split(","),
    ["2026-09-24 12:03:04", "商户消费", "书店", "教材", "支出", "¥20.50", "零钱", "支付成功", "10001", "", ""],
    ["2026-09-24 12:03:04", "商户消费", "书店", "教材", "支出", "¥20.50", "零钱", "支付成功", "10001", "", ""]];
  const parsed = await parseWeChatBillRows(rows);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.skippedDuplicate, 1);
  const first = mergeWeChatBillEntries(createInitialFinanceState(), parsed.entries);
  assert.equal(first.added, 1);
  const second = mergeWeChatBillEntries(first.finance, parsed.entries);
  assert.equal(second.added, 0);
  assert.equal(second.duplicates, 1);
  assert.deepEqual(second.finance.entries, first.finance.entries);
  assert.equal(normalizeFinanceState(JSON.parse(JSON.stringify(first.finance))).entries[0].origin, "wechat");
  assert.equal(workspaceStateSchema.shape.finance.shape.entries.element.safeParse(first.finance.entries[0]).success, true);
});

test("invalid dates and amounts are rejected without reversing the payment direction", async () => {
  const rows = [["交易时间", "交易对方", "收/支", "金额(元)", "当前状态", "交易单号"],
    ["2026-02-30 09:00:00", "A", "支出", "1.00", "支付成功", "bad-date"],
    ["2026-09-24 09:00:00", "B", "收入", "abc", "已收钱", "bad-amount"],
    ["2026-09-24 09:00:00", "C", "支出", "1.00", "支付成功", "good"]];
  const parsed = await parseWeChatBillRows(rows);
  assert.equal(parsed.skippedInvalid, 2);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].type, "expense");
  await assert.rejects(parseWeChatBillRows([["日期", "金额"]]), /未识别微信个人对账账单/);
});

test("spreadsheet date cells keep the transaction day and time", async () => {
  const result = await parseWeChatBillRows([
    ["交易时间", "交易对方", "收/支", "金额(元)", "交易单号"],
    [new Date("2026-09-24T08:05:00.000Z"), "书店", "支出", 19.9, "xlsx-trade"],
  ]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].date, "2026-09-24");
  assert.equal(result.entries[0].time, "08:05");
  assert.equal(result.entries[0].amountCents, 1990);
});

test("WeChat import recognizes campus top-ups, gifts, restaurants and everyday merchants", async () => {
  const rows = [header.split(","),
    ["2026-09-24 09:00:00", "商户消费", "北京理工大学", "付款", "支出", "¥30.00", "零钱", "支付成功", "campus", "", ""],
    ["2026-09-24 10:00:00", "商户消费", "文创小店", "纪念品", "支出", "¥25.00", "零钱", "支付成功", "gift", "", ""],
    ["2026-09-24 11:00:00", "商户消费", "川味饭店", "付款", "支出", "¥28.00", "零钱", "支付成功", "food", "", ""],
    ["2026-09-24 12:00:00", "商户消费", "中国移动", "话费", "支出", "¥20.00", "零钱", "支付成功", "mobile", "", ""],
    ["2026-09-24 13:00:00", "商户消费", "楼下便利店", "日用品", "支出", "¥12.00", "零钱", "支付成功", "daily", "", ""],
  ];
  const parsed = await parseWeChatBillRows(rows);
  assert.deepEqual(parsed.entries.map((entry) => entry.category), ["校园卡充值", "人情往来", "餐饮", "通讯", "日常生活"]);
  assert.equal(parsed.entries[0].merchant, "北京理工大学");
});

test("reimport can update old categories without duplicating records; merchant edits guide later imports", async () => {
  const rows = [header.split(","),
    ["2026-09-24 09:00:00", "商户消费", "北京理工大学", "付款", "支出", "¥30.00", "零钱", "支付成功", "campus", "", ""],
    ["2026-09-24 10:00:00", "商户消费", "黑狗科技", "微信支付", "支出", "¥15.00", "零钱", "支付成功", "tech", "", ""],
    ["2026-09-24 11:00:00", "转账", "黑狗科技", "退款", "收入", "¥5.00", "零钱", "已收钱", "refund", "", ""],
  ];
  const parsed = await parseWeChatBillRows(rows);
  const previous = createInitialFinanceState();
  previous.entries = [{ ...parsed.entries[0], category: "其他" }];
  previous.merchantCategories[merchantCategoryKey("expense", "黑狗科技")] = "通讯";
  const unchanged = mergeWeChatBillEntries(previous, parsed.entries);
  assert.equal(unchanged.added, 2);
  assert.equal(unchanged.recategorized, 0);
  assert.equal(unchanged.finance.entries.find((entry) => entry.id === parsed.entries[0].id)?.category, "其他");
  assert.equal(unchanged.finance.entries.find((entry) => entry.id === parsed.entries[1].id)?.category, "通讯");
  assert.equal(unchanged.finance.entries.find((entry) => entry.id === parsed.entries[2].id)?.category, "其他收入");
  const updated = mergeWeChatBillEntries(previous, parsed.entries, { updateExistingCategories: true });
  assert.equal(updated.added, 2);
  assert.equal(updated.recategorized, 1);
  assert.equal(updated.finance.entries.find((entry) => entry.id === parsed.entries[0].id)?.category, "校园卡充值");
  assert.equal(workspaceStateSchema.shape.finance.safeParse(updated.finance).success, true);
  assert.equal(normalizeFinanceState(JSON.parse(JSON.stringify(updated.finance))).merchantCategories[merchantCategoryKey("expense", "黑狗科技")], "通讯");
});

test("specific purposes outrank broad platform and campus names", async () => {
  const rows = [header.split(","),
    ["2026-09-24 08:00:00", "商户消费", "美团", "共享单车", "支出", "¥1.88", "零钱", "支付成功", "bike", "", ""],
    ["2026-09-24 08:10:00", "商户消费", "美团", "微信支付", "支出", "¥1.88", "零钱", "支付成功", "bike-ambiguous", "", ""],
    ["2026-09-24 08:20:00", "商户消费", "美团", "早餐", "支出", "¥1.88", "零钱", "支付成功", "food-small", "", ""],
    ["2026-09-24 09:00:00", "商户消费", "北京理工大学", "校园网费", "支出", "¥30.00", "零钱", "支付成功", "network", "", ""],
    ["2026-09-24 10:00:00", "商户消费", "北理文创", "纪念品", "支出", "¥25.00", "零钱", "支付成功", "creative", "", ""],
    ["2026-09-24 11:00:00", "商户消费", "腾讯缴费", "自动扣费", "支出", "¥19.00", "零钱", "支付成功", "reading", "", ""],
    ["2026-09-24 12:00:00", "商户消费", "上海塔罗斯", "月卡", "支出", "¥30.00", "零钱", "支付成功", "game", "", ""],
  ];
  const parsed = await parseWeChatBillRows(rows);
  assert.deepEqual(parsed.entries.map((entry) => entry.category), ["交通", "交通", "餐饮", "通讯", "人情往来", "教育", "娱乐"]);
  const old = createInitialFinanceState();
  old.entries = parsed.entries.map((entry) => ({ ...entry, category: "其他" }));
  const updated = recategorizeWeChatMonth(old, "2026-09");
  assert.equal(updated.changed, 7);
  assert.deepEqual(updated.finance.entries.map((entry) => entry.category), ["交通", "交通", "餐饮", "通讯", "人情往来", "教育", "娱乐"]);
  assert.equal(recategorizeWeChatMonth(updated.finance, "2026-09").changed, 0);
  assert.equal(recategorizeWeChatMonth(old, "2026-08").changed, 0);
});

test("a manual category correction stays with its transaction context", async () => {
  const rows = [header.split(","),
    ["2026-09-24 08:00:00", "商户消费", "美团", "共享单车", "支出", "¥1.88", "零钱", "支付成功", "bike-context", "", ""],
    ["2026-09-24 12:00:00", "商户消费", "美团", "午餐", "支出", "¥18.00", "零钱", "支付成功", "food-context", "", ""],
    ["2026-09-24 13:00:00", "商户消费", "北京理工大学", "校园网费", "支出", "¥30.00", "零钱", "支付成功", "network-context", "", ""]];
  const parsed = await parseWeChatBillRows(rows);
  const previous = createInitialFinanceState();
  previous.merchantCategories[merchantCategoryKey("expense", "美团")] = "餐饮";
  previous.merchantCategories[merchantCategoryKey("expense", "北京理工大学")] = "校园卡充值";
  previous.merchantCategories[transactionCategoryKey("expense", "美团", parsed.entries[0].note)] = "交通";
  const imported = mergeWeChatBillEntries(previous, parsed.entries);
  assert.deepEqual(imported.finance.entries.map((entry) => entry.category), ["交通", "餐饮", "通讯"]);
  const old = { ...previous, entries: parsed.entries.map((entry) => ({ ...entry, category: "其他" })) };
  const refreshed = recategorizeWeChatMonth(old, "2026-09");
  assert.deepEqual(refreshed.finance.entries.map((entry) => entry.category), ["交通", "餐饮", "通讯"]);
});

test("edited September payments teach later imports their actual purpose", async () => {
  const rows = [header.split(","),
    ["2026-09-12 09:00:00", "商户消费", "腾讯缴费", "自动扣费", "支出", "¥19.00", "零钱", "支付成功", "old-reading", "", ""],
    ["2026-10-12 09:00:00", "商户消费", "腾讯缴费", "自动扣费", "支出", "¥19.00", "零钱", "支付成功", "new-reading", "", ""],
    ["2026-10-12 10:00:00", "商户消费", "腾讯缴费", "腾讯视频会员", "支出", "¥19.00", "零钱", "支付成功", "video", "", ""],
    ["2026-10-12 11:00:00", "商户消费", "腾讯缴费", "自动扣费", "支出", "¥25.00", "零钱", "支付成功", "different-amount", "", ""]];
  const parsed = await parseWeChatBillRows(rows);
  const old = createInitialFinanceState();
  old.entries = [{ ...parsed.entries[0], note: "微信读书续费", category: "教育", updatedAt: "2026-09-13T01:00:00.000Z" }];
  const merged = mergeWeChatBillEntries(old, parsed.entries);
  const reading = merged.finance.entries.find((entry) => entry.id === parsed.entries[1].id);
  const video = merged.finance.entries.find((entry) => entry.id === parsed.entries[2].id);
  const differentAmount = merged.finance.entries.find((entry) => entry.id === parsed.entries[3].id);
  assert.equal(reading?.category, "教育");
  assert.equal(reading?.purpose, "微信读书续费");
  assert.equal(video?.category, "娱乐");
  assert.equal(video?.purpose, undefined);
  assert.equal(differentAmount?.purpose, undefined);
  assert.equal(expenseDetailCategory(reading), "微信读书续费");
  const refreshed = mergeWeChatBillEntries({ ...old, entries: [...old.entries, parsed.entries[1]] }, [parsed.entries[1]], { updateExistingCategories: true });
  assert.equal(refreshed.added, 0);
  assert.equal(refreshed.recategorized, 1);
  assert.equal(refreshed.finance.entries[1].purpose, "微信读书续费");
  assert.equal(workspaceStateSchema.shape.finance.safeParse(merged.finance).success, true);
});

test("conflicting edited payments do not teach an amount-wide category", async () => {
  const rows = [header.split(","),
    ["2026-09-10 09:00:00", "商户消费", "未知科技", "付款", "支出", "¥19.00", "零钱", "支付成功", "old-one", "", ""],
    ["2026-09-11 09:00:00", "商户消费", "未知科技", "付款", "支出", "¥19.00", "零钱", "支付成功", "old-two", "", ""],
    ["2026-10-12 09:00:00", "商户消费", "未知科技", "付款", "支出", "¥19.00", "零钱", "支付成功", "new", "", ""]];
  const parsed = await parseWeChatBillRows(rows);
  const old = createInitialFinanceState();
  old.entries = [
    { ...parsed.entries[0], note: "课程会员", category: "教育", updatedAt: "2026-09-12T01:00:00.000Z" },
    { ...parsed.entries[1], note: "游戏月卡", category: "娱乐", updatedAt: "2026-09-12T02:00:00.000Z" },
  ];
  old.paymentRules[paymentAmountKey("expense", "未知科技", 1900)] = { category: "娱乐", purpose: "游戏月卡" };
  const merged = mergeWeChatBillEntries(old, [parsed.entries[2]]);
  assert.equal(merged.finance.entries[0].category, "其他");
  assert.equal(merged.finance.entries[0].purpose, undefined);
});

test("expense details distinguish actual uses within a broad category", () => {
  const base = { amountCents: 1200, origin: "wechat", merchant: "商户", createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" };
  assert.equal(expenseDetailCategory({ ...base, category: "餐饮", note: "食堂 · 早餐" }), "早餐");
  assert.equal(expenseDetailCategory({ ...base, category: "交通", note: "美团 · 共享单车", amountCents: 188 }), "共享单车");
  assert.equal(expenseDetailCategory({ ...base, category: "通讯", note: "北理网费" }), "网络费用");
  assert.equal(expenseDetailCategory({ ...base, category: "教育", note: "腾讯缴费 · 自动扣费", amountCents: 1900 }), "微信读书");
  assert.equal(expenseDetailCategory({ ...base, category: "教育", note: "腾讯缴费 · 自动扣费", purpose: "微信读书续费" }), "微信读书续费");
});
