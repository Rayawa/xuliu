import { MAX_XLSX_ROWS, MAX_XLSX_COLUMNS, MAX_XLSX_CELL_CHARS } from '../../config/constants';

export function parseCsv(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > MAX_XLSX_COLUMNS) throw new Error('导入列数过多');
      if (row.some((v) => v.trim())) rows.push(row);
      if (rows.length > MAX_XLSX_ROWS) throw new Error('导入行数过多');
      row = []; field = '';
    } else field += c;
    if (field.length > MAX_XLSX_CELL_CHARS || row.length > MAX_XLSX_COLUMNS) throw new Error('导入单元格过长或列数过多');
  }
  if (quoted) throw new Error('CSV 引号未闭合');
  row.push(field);
  if (row.length > MAX_XLSX_COLUMNS) throw new Error('导入列数过多');
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > MAX_XLSX_ROWS) throw new Error('导入行数过多');
  return rows;
}


export function parseDelimitedRows(text: string): string[][] {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  const separators = [',', '\t', ';']; separators.sort((left, right) => first.split(right).length - first.split(left).length);
  return parseCsv(text, separators[0]);
}
