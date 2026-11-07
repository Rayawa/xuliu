import { MAX_TABLE_ROWS, MAX_TABLE_COLUMNS, MAX_TABLE_CELL_CHARS, MAX_FILE_BYTES } from '../../config/constants';
import { CleanPasteResult } from './CleanPaste';

export function assertTable(rows: string[][]): void {
  if (!Array.isArray(rows) || rows.length > MAX_TABLE_ROWS) throw new Error('表格最多100行');
  if (rows.some((row) => !Array.isArray(row) || row.length > MAX_TABLE_COLUMNS || row.some((cell) => typeof cell !== 'string' || cell.length > MAX_TABLE_CELL_CHARS))) {
    throw new Error('表格最多30列，每格最多500字');
  }
}
export function tableColumnCount(rows: string[][]): number { return rows.reduce((width, row) => Math.max(width, row.length), 1); }
export function tableTsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => !cell || /[\t\r\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join('\t')).join('\n');
}
export function parseTableTsv(raw: string): string[][] {
  if (raw.length > MAX_FILE_BYTES) throw new Error('整表文字过长，请分段复制');
  if (!raw) return [['', '']];
  const text = raw.replace(/^\uFEFF/, ''); const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let afterQuote = false;
  const pushCell = (): void => { if (cell.length > MAX_TABLE_CELL_CHARS || row.length >= MAX_TABLE_COLUMNS) throw new Error('表格最多30列，每格最多500字'); row.push(cell); cell = ''; afterQuote = false; };
  const pushRow = (): void => { pushCell(); rows.push(row); row = []; if (rows.length > MAX_TABLE_ROWS) throw new Error('表格最多100行'); };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else cell += char;
    } else if (char === '"' && !cell && !afterQuote) quoted = true;
    else if (char === '\t') pushCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[index + 1] === '\n') index++; pushRow(); }
    else { if (afterQuote && char.trim()) throw new Error('表格引号后的内容格式无效'); cell += char; }
    if (cell.length > MAX_TABLE_CELL_CHARS) throw new Error('每个单元格最多500字');
  }
  if (quoted) throw new Error('表格引号未闭合，原表格未改动');
  if (cell || row.length || !/[\r\n]$/.test(text)) pushRow();
  assertTable(rows); return rows;
}
export function pastedTable(value: CleanPasteResult): string[][] {
  if (value.tables.length > 1) throw new Error('剪贴板包含多个表格，请单独复制需要的一个表格');
  if (!value.tables.length && !value.text) throw new Error('剪贴板没有可用的表格文字');
  const rows = value.tables.length ? value.tables[0] : parseTableTsv(value.text);
  assertTable(rows); if (!rows.length) throw new Error('剪贴板没有表格内容');
  return rows;
}
