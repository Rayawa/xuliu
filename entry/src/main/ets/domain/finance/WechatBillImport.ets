import { amountCents } from './FinanceDomain';
import { classifyWeChatCategory } from './FinanceCategories';
import { MAX_FINANCE_ENTRIES } from '../../config/constants';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { FinanceEntry } from '../../models/Workspace';
import { validDate, validTime } from '../workspace/WorkspaceDomain';
import { parseDelimitedRows } from '../imports/DelimitedText';

export interface BillImportResult {
  entries: FinanceEntry[];
  transactionRows: number;
  skippedNeutral: number;
  skippedUnsuccessful: number;
  skippedInvalid: number;
  skippedDuplicate: number;
}

export async function importWechat(text: string, isCancelled: () => boolean = () => false): Promise<BillImportResult> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerLine = lines.findIndex((line) => line.includes('交易时间') && line.includes('收/支'));
  const rows = parseDelimitedRows((headerLine >= 0 ? lines.slice(headerLine) : lines).join('\n'));
  return importWechatRows(rows, isCancelled);
}

export async function importWechatRows(rows: string[][], isCancelled: () => boolean = () => false): Promise<BillImportResult> {
  const normalize = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === '交易时间') && row.some((cell) => normalize(cell) === '收/支'));
  if (headerIndex < 0) throw new Error('未识别微信账单表头，请选择解压后的CSV或XLSX文件');
  const headers = rows[headerIndex].map(normalize);
  const column = (name: string): number => headers.indexOf(name);
  const amountIndex = headers.findIndex((cell) => cell === '金额' || cell === '金额(元)');
  if (amountIndex < 0 || column('交易对方') < 0) throw new Error('微信账单缺少金额或交易对方列');
  const result: BillImportResult = { entries: [], transactionRows: 0, skippedNeutral: 0, skippedUnsuccessful: 0, skippedInvalid: 0, skippedDuplicate: 0 };
  const seen: Set<string> = new Set();
  const now = new Date().toISOString();
  for (const row of rows.slice(headerIndex + 1)) {
    if (isCancelled()) throw new Error('账单导入已取消');
    const get = (name: string): string => (row[column(name)] ?? '').trim();
    if (!get('交易时间')) continue;
    result.transactionRows++;
    const direction = get('收/支');
    if (direction !== '支出' && direction !== '收入') { result.skippedNeutral++; continue; }
    if (/失败|关闭|撤销|未支付|待支付|未收钱|退款中|处理中/.test(get('当前状态'))) { result.skippedUnsuccessful++; continue; }
    const timestamp = get('交易时间').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!timestamp) { result.skippedInvalid++; continue; }
    const date = `${timestamp[1]}-${timestamp[2].padStart(2, '0')}-${timestamp[3].padStart(2, '0')}`;
    const time = `${timestamp[4].padStart(2, '0')}:${timestamp[5]}`;
    let cents = 0;
    try { cents = amountCents((row[amountIndex] ?? '').normalize('NFKC').replace(/[¥￥,，\s]/g, '').replace(/^[`']/g, '')); }
    catch (_) { result.skippedInvalid++; continue; }
    if (!validDate(date) || !validTime(time)) { result.skippedInvalid++; continue; }
    const meaningful = (value: string): string => value === '/' || value === '-' ? '' : value;
    const transaction = meaningful(get('交易单号')).replace(/^[`']/g, '');
    const merchant = meaningful(get('交易对方')); const product = meaningful(get('商品')); const memo = meaningful(get('备注'));
    const transactionType = meaningful(get('交易类型')); const merchantNumber = meaningful(get('商户单号')).replace(/^[`']/g, '');
    const sourceKey = transaction ? `trade:${transaction}:${date}:${time}:${direction}:${cents}` :
      `row:${date}:${time}:${direction}:${cents}:${transactionType}:${merchant}:${product}:${merchantNumber}:${memo}`;
    let id = '';
    if (canIUse('SystemCapability.Security.CryptoFramework.MessageDigest')) {
      const digest = cryptoFramework.createMd('SHA256'); await digest.update({ data: new util.TextEncoder().encodeInto(sourceKey) });
      const hash = await digest.digest(); id = `wechat-${Array.from(hash.data).map((value) => value.toString(16).padStart(2, '0')).join('').slice(0, 40)}`;
    } else throw new Error('当前设备不支持账单去重所需的系统摘要能力');
    if (isCancelled()) throw new Error('账单导入已取消');
    if (seen.has(id)) { result.skippedDuplicate++; continue; } seen.add(id);
    if (seen.size > MAX_FINANCE_ENTRIES) throw new Error('账单超过20000笔，请按月份拆分');
    const type = direction === '收入' ? 'income' : 'expense';
    const category = classifyWeChatCategory(type, { transactionType, counterparty: merchant, product, memo, amountCents: cents });
    const notes = [merchant, product, memo, get('当前状态').includes('退款') ? get('当前状态') : ''].filter((value) => !!value);
    const note = Array.from(new Set(notes)).join(' · ').slice(0, 500) || transactionType || '微信支付';
    result.entries.push({ id, type, amountCents: cents, category, date, time, note, relatedProject: '', createdAt: now, updatedAt: now,
      origin: 'wechat', merchant: merchant || undefined });
  }
  return result;
}

