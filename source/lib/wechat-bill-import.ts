import { parseDelimitedRows } from "./academic-import.ts";
import { classifyWeChatCategory, merchantCategoryKey, merchantFromEntry } from "./finance-categories.ts";
import { isValidLocalDate, isValidLocalTime, yuanToCents, type FinanceEntry, type FinanceEntryType, type FinanceState } from "./finance.ts";

export type WeChatBillImport = {
  entries: FinanceEntry[];
  transactionRows: number;
  skippedNeutral: number;
  skippedUnsuccessful: number;
  skippedInvalid: number;
  skippedDuplicate: number;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

function cell(value: unknown) {
  return String(value ?? "").replace(/^[\uFEFF\u00A0\s]+|[\u00A0\s]+$/g, "").trim();
}

function headerKey(value: unknown) {
  return cell(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function meaningful(value: unknown) {
  const cleaned = cell(value);
  return cleaned === "/" || cleaned === "-" ? "" : cleaned;
}

function parseDateTime(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
    const time = `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
    return { date, time };
  }
  const matched = cell(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!matched) return null;
  const date = `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
  const time = `${matched[4].padStart(2, "0")}:${matched[5]}`;
  return isValidLocalDate(date) && isValidLocalTime(time) ? { date, time } : null;
}

async function entryId(sourceKey: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceKey));
  return `wechat-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40)}`;
}

export async function parseWeChatBillRows(rawRows: unknown[][]): Promise<WeChatBillImport> {
  const headerIndex = rawRows.findIndex((row) => {
    const keys = row.map(headerKey);
    return keys.includes("交易时间") && keys.includes("交易对方") && keys.includes("收/支")
      && keys.some((key) => key === "金额" || key === "金额(元)")
      && (keys.includes("当前状态") || keys.includes("交易单号") || keys.includes("商品"));
  });
  if (headerIndex < 0) throw new Error("未识别微信个人对账账单。请导入解压后的 .xlsx 或 .csv 文件。");
  const headers = rawRows[headerIndex].map(headerKey);
  const index = (name: string) => headers.indexOf(name);
  const value = (row: unknown[], name: string) => index(name) < 0 ? "" : cell(row[index(name)]);
  const amountIndex = headers.findIndex((key) => key === "金额" || key === "金额(元)");
  const importTime = new Date().toISOString();
  const result: WeChatBillImport = { entries: [], transactionRows: 0, skippedNeutral: 0, skippedUnsuccessful: 0, skippedInvalid: 0, skippedDuplicate: 0 };
  const seen = new Set<string>();

  for (const row of rawRows.slice(headerIndex + 1)) {
    const dateText = value(row, "交易时间");
    if (!dateText && !(row[index("交易时间")] instanceof Date)) continue;
    result.transactionRows += 1;
    const direction = value(row, "收/支");
    if (direction !== "收入" && direction !== "支出") { result.skippedNeutral += 1; continue; }
    const status = value(row, "当前状态");
    if (/失败|关闭|撤销|未支付|待支付|未收钱|退款中|处理中/.test(status)) { result.skippedUnsuccessful += 1; continue; }
    const when = parseDateTime(row[index("交易时间")]);
    const amountText = cell(row[amountIndex]).normalize("NFKC").replace(/[¥￥,，\s]/g, "").replace(/^[`']/g, "");
    const amountCents = yuanToCents(amountText);
    if (!when || !amountCents) { result.skippedInvalid += 1; continue; }

    const transactionType = meaningful(value(row, "交易类型"));
    const counterparty = meaningful(value(row, "交易对方"));
    const product = meaningful(value(row, "商品"));
    const memo = meaningful(value(row, "备注"));
    const tradeNumber = meaningful(value(row, "交易单号")).replace(/^[`']/g, "");
    const merchantNumber = meaningful(value(row, "商户单号")).replace(/^[`']/g, "");
    const sourceKey = tradeNumber
      ? `trade:${tradeNumber}:${when.date}:${when.time}:${direction}:${amountCents}`
      : `row:${when.date}:${when.time}:${direction}:${amountCents}:${transactionType}:${counterparty}:${product}:${merchantNumber}:${memo}`;
    const id = await entryId(sourceKey);
    if (seen.has(id)) { result.skippedDuplicate += 1; continue; }
    seen.add(id);
    if (seen.size > MAX_ENTRIES) throw new Error("账单记录超过 20000 笔，请分批导入。");
    const type: FinanceEntryType = direction === "收入" ? "income" : "expense";
    const note = [counterparty, product, memo, status.includes("退款") ? status : ""].filter(Boolean).filter((part, position, parts) => parts.indexOf(part) === position).join(" · ").slice(0, 500)
      || transactionType || "微信支付";
    result.entries.push({ id, type, amountCents, category: classifyWeChatCategory(type, { transactionType, counterparty, product, memo }), date: when.date, time: when.time, note, relatedProject: "", createdAt: importTime, updatedAt: importTime, origin: "wechat", ...(counterparty ? { merchant: counterparty.slice(0, 200) } : {}) });
  }
  return result;
}

export function parseWeChatBillCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes("交易时间") && line.includes("收/支"));
  return parseDelimitedRows((headerIndex >= 0 ? lines.slice(headerIndex) : lines).join("\n"));
}

export async function readWeChatBillFile(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error("文件超过 8 MB，请按月份拆分账单后导入。");
  if (/\.csv$/i.test(file.name)) {
    const bytes = await file.arrayBuffer();
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("gb18030").decode(bytes); }
    return parseWeChatBillRows(parseWeChatBillCsv(text));
  }
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile(file);
    const allRows = sheets.flatMap((sheet) => sheet.data as unknown[][]);
    return parseWeChatBillRows(allRows);
  }
  throw new Error("请选择微信个人对账导出的 .xlsx 或 .csv 文件；压缩包需要先解压。");
}

export function mergeWeChatBillEntries(finance: FinanceState, imported: FinanceEntry[], options: { updateExistingCategories?: boolean } = {}) {
  const known = new Set(finance.entries.map((entry) => entry.id));
  const additions = imported.filter((entry) => {
    if (known.has(entry.id)) return false;
    known.add(entry.id);
    return true;
  });
  if (finance.entries.length + additions.length > MAX_ENTRIES) throw new Error("记账记录将超过 20000 笔，请先整理旧记录。");
  const suggestedCategory = (entry: FinanceEntry) => finance.merchantCategories?.[merchantCategoryKey(entry.type, merchantFromEntry(entry.note, entry.merchant))] || entry.category;
  const categorizedAdditions = additions.map((entry) => ({ ...entry, category: suggestedCategory(entry) }));
  const importedById = options.updateExistingCategories ? new Map(imported.map((entry) => [entry.id, entry])) : null;
  let recategorized = 0;
  const existingEntries = importedById ? finance.entries.map((entry) => {
    const suggested = importedById.get(entry.id);
    const category = suggested ? suggestedCategory(suggested) : entry.category;
    if (!suggested || category === entry.category) return entry;
    recategorized += 1;
    return { ...entry, category, updatedAt: new Date().toISOString() };
  }) : finance.entries;
  const categories = [...categorizedAdditions, ...existingEntries.filter((entry) => importedById?.has(entry.id))];
  return {
    finance: {
      ...finance,
      entries: [...categorizedAdditions, ...existingEntries],
      expenseCategories: [...new Set([...finance.expenseCategories, ...categories.filter((entry) => entry.type === "expense").map((entry) => entry.category)])],
      incomeCategories: [...new Set([...finance.incomeCategories, ...categories.filter((entry) => entry.type === "income").map((entry) => entry.category)])],
    },
    added: additions.length,
    duplicates: imported.length - additions.length,
    recategorized,
  };
}
