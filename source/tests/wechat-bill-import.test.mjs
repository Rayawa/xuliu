import test from "node:test";
import assert from "node:assert/strict";
import { createInitialFinanceState, normalizeFinanceState } from "../lib/finance.ts";
import { mergeWeChatBillEntries, parseWeChatBillCsv, parseWeChatBillRows } from "../lib/wechat-bill-import.ts";
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
