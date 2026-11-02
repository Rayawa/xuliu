import { ZipArchive } from './ZipArchive';
import { readXml } from './XmlReader';
import { MAX_XLSX_SHEETS, MAX_XLSX_ROWS, MAX_XLSX_COLUMNS, MAX_XLSX_CELLS, MAX_XLSX_CELL_CHARS, MS_PER_DAY } from '../../config/constants';

export interface WorkbookSheet { name: string; rows: string[][]; }
interface Relationship { id: string; type: string; target: string; }
interface SheetDefinition { name: string; relationship: string; }
interface CellStyle { numberFormat: number; parent: number; inherit: boolean; }
interface WorkbookStyles { formats: Map<number, string>; parents: number[]; cells: CellStyle[]; }
interface Cell { reference: string; type: string; style: number; value: string; inline: string; }

function localName(name: string): string { return name.split(':').pop() ?? name; }
function attribute(attributes: Map<string, string>, name: string): string {
  const exact = attributes.get(name); if (exact !== undefined) return exact;
  let value = ''; attributes.forEach((text, key) => { if (localName(key) === name && !key.startsWith('xmlns')) value = text; });
  return value;
}

function packagePath(base: string, target: string): string {
  if (/^[a-z]+:/i.test(target) || target.includes('\\') || target.includes('?') || target.includes('#')) throw new Error('工作簿内部路径无效');
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of decodeURIComponent(target).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('工作簿内部路径越界'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

function relationshipPath(document: string): string {
  const parts = document.split('/'); const name = parts.pop() ?? '';
  return parts.concat(['_rels', `${name}.rels`]).join('/');
}

function relationships(bytes: ArrayBuffer, base: string, cancelled: () => boolean): Relationship[] {
  const result: Relationship[] = [];
  readXml(bytes, { start: (name, attributes) => {
    if (name !== 'Relationship' || attributes.get('TargetMode') === 'External') return;
    result.push({ id: attributes.get('Id') ?? '', type: attributes.get('Type') ?? '', target: packagePath(base, attributes.get('Target') ?? '') });
  }, text: () => {}, end: () => {} }, cancelled);
  return result;
}

function decodeCellText(text: string): string {
  return text.replace(/_x([0-9a-fA-F]{4})_/g, (_all: string, number: string): string => String.fromCharCode(parseInt(number, 16)));
}

function sharedStrings(bytes: ArrayBuffer, cancelled: () => boolean): string[] {
  const result: string[] = []; let value = ''; let inside = false; let textTag = false; let phonetic = 0;
  readXml(bytes, {
    start: (name) => {
      if (name === 'si') { inside = true; value = ''; }
      if (name === 'rPh') phonetic++;
      if (name === 't' && inside && !phonetic) textTag = true;
    },
    text: (text) => {
      if (textTag) { value += text; if (value.length > MAX_XLSX_CELL_CHARS) throw new Error('工作簿单元格文本过长'); }
    },
    end: (name) => {
      if (name === 't') textTag = false;
      if (name === 'rPh') phonetic--;
      if (name === 'si') {
        result.push(decodeCellText(value)); inside = false;
        if (result.length > MAX_XLSX_CELLS) throw new Error('工作簿共享字符串过多');
      }
    }
  }, cancelled);
  return result;
}

function styles(bytes: ArrayBuffer, cancelled: () => boolean): WorkbookStyles {
  const result: WorkbookStyles = { formats: new Map(), parents: [], cells: [] }; let section = '';
  readXml(bytes, { start: (name, attributes) => {
    if (name === 'numFmt') result.formats.set(Number(attributes.get('numFmtId')), attributes.get('formatCode') ?? '');
    if (name === 'cellStyleXfs' || name === 'cellXfs') section = name;
    if (name === 'xf' && section === 'cellStyleXfs') result.parents.push(Number(attributes.get('numFmtId') ?? '0'));
    if (name === 'xf' && section === 'cellXfs') result.cells.push({ numberFormat: Number(attributes.get('numFmtId') ?? '0'),
      parent: Number(attributes.get('xfId') ?? '0'), inherit: attributes.get('numFmtId') === undefined || attributes.get('applyNumberFormat') === '0' });
  }, text: () => {}, end: (name) => { if (name === 'cellStyleXfs' || name === 'cellXfs') section = ''; } }, cancelled);
  return result;
}

function dateKind(styleIndex: number, format: WorkbookStyles): string {
  const style = format.cells[styleIndex]; if (!style) return '';
  const id = style.inherit ? format.parents[style.parent] ?? style.numberFormat : style.numberFormat;
  if ([18, 19, 20, 21, 45, 46, 47].includes(id)) return 'time';
  if (id === 22) return 'datetime';
  if ((id >= 14 && id <= 17) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return 'date';
  const code = (format.formats.get(id) ?? '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '').toLowerCase();
  const date = /[yd]/.test(code) || (/m/.test(code) && !/[hs]/.test(code)); const time = /[hs]/.test(code);
  return date && time ? 'datetime' : date ? 'date' : time ? 'time' : '';
}

function dateText(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function timeText(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function cellValue(cell: Cell, strings: string[], format: WorkbookStyles, date1904: boolean): string {
  if (cell.type === 'inlineStr') return decodeCellText(cell.inline);
  if (!cell.value.trim() && cell.type !== 'inlineStr') return '';
  if (cell.type === 's') {
    const index = Number(cell.value);
    if (!Number.isInteger(index) || index < 0 || index >= strings.length) throw new Error('工作簿共享字符串索引无效');
    return strings[index];
  }
  if (cell.type === 'e') return '';
  if (cell.type === 'b') return cell.value === '1' ? 'true' : 'false';
  if (cell.type === 'str') return decodeCellText(cell.value);
  if (cell.type === 'd') {
    const value = cell.value.includes('T') && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(cell.value) ? `${cell.value}Z` : cell.value;
    const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('工作簿日期无效');
    return `${dateText(date)} ${timeText(date)}`;
  }
  if (!cell.value.trim()) return '';
  const number = Number(cell.value); if (!Number.isFinite(number)) return cell.value;
  const kind = dateKind(cell.style, format);
  if (!kind) return String(number);
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : number < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(number * MS_PER_DAY));
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new Error('工作簿日期超出范围');
  return kind === 'time' ? timeText(date).slice(0, 5) : kind === 'date' ? dateText(date) : `${dateText(date)} ${timeText(date)}`;
}

function columnIndex(reference: string, fallback: number): number {
  const letters = reference.match(/^[A-Za-z]+/)?.[0]; if (!letters) return fallback;
  let index = 0; for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function sheetRows(bytes: ArrayBuffer, strings: string[], format: WorkbookStyles, date1904: boolean,
  cancelled: () => boolean, countCell: () => void): string[][] {
  const rows: string[][] = []; let row: string[] = []; let nextColumn = 0; let cell: Cell | undefined;
  let valueTag = false; let inlineTag = false; let phonetic = 0;
  readXml(bytes, {
    start: (name, attributes) => {
      if (name === 'row') { row = []; nextColumn = 0; }
      if (name === 'c') cell = { reference: attributes.get('r') ?? '', type: attributes.get('t') ?? '', style: Number(attributes.get('s') ?? '0'), value: '', inline: '' };
      if (name === 'v' && cell) valueTag = true;
      if (name === 'rPh') phonetic++;
      if (name === 't' && cell && !phonetic) inlineTag = true;
    },
    text: (value) => {
      if (!cell) return;
      if (valueTag) cell.value += value;
      if (inlineTag) cell.inline += value;
      if (cell.value.length + cell.inline.length > MAX_XLSX_CELL_CHARS) throw new Error('工作簿单元格文本过长');
    },
    end: (name) => {
      if (name === 'v') valueTag = false;
      if (name === 't') inlineTag = false;
      if (name === 'rPh') phonetic--;
      if (name === 'c' && cell) {
        const column = columnIndex(cell.reference, nextColumn); const value = cellValue(cell, strings, format, date1904); nextColumn = column + 1;
        if (value) {
          if (column < 0 || column >= MAX_XLSX_COLUMNS) throw new Error('工作簿列数过多，请导出所需列');
          while (row.length <= column) row.push(''); row[column] = value; countCell();
        }
        cell = undefined;
      }
      if (name === 'row' && row.some((value) => !!value)) {
        rows.push(row); if (rows.length > MAX_XLSX_ROWS) throw new Error('工作表行数过多，请拆分文件');
      }
    }
  }, cancelled);
  return rows;
}

export async function readXlsx(bytes: ArrayBuffer, cancelled: () => boolean = () => false): Promise<WorkbookSheet[]> {
  const archive = new ZipArchive(bytes, cancelled); let workbook = 'xl/workbook.xml';
  if (archive.has('_rels/.rels')) {
    const root = relationships(await archive.read('_rels/.rels'), '', cancelled);
    workbook = root.find((relationship) => relationship.type.endsWith('/officeDocument'))?.target ?? workbook;
  }
  const sheetDefinitions: SheetDefinition[] = []; let date1904 = false;
  readXml(await archive.read(workbook), {
    start: (name, attributes) => {
      if (name === 'workbookPr') date1904 = ['1', 'true'].includes(attributes.get('date1904') ?? '');
      if (name === 'sheet') sheetDefinitions.push({ name: attributes.get('name') ?? '工作表', relationship: attribute(attributes, 'id') });
    }, text: () => {}, end: () => {}
  }, cancelled);
  if (!sheetDefinitions.length || sheetDefinitions.length > MAX_XLSX_SHEETS) throw new Error('工作簿工作表数量无效');
  const links = relationships(await archive.read(relationshipPath(workbook)), workbook, cancelled);
  const shared = links.find((link) => link.type.endsWith('/sharedStrings'))?.target;
  const stylePath = links.find((link) => link.type.endsWith('/styles'))?.target;
  const strings = shared ? sharedStrings(await archive.read(shared), cancelled) : [];
  const format: WorkbookStyles = stylePath ? styles(await archive.read(stylePath), cancelled) : { formats: new Map(), parents: [], cells: [] };
  const result: WorkbookSheet[] = []; let cells = 0;
  for (const sheet of sheetDefinitions) {
    if (cancelled()) throw new Error('工作簿读取已取消');
    const path = links.find((link) => link.id === sheet.relationship && link.type.endsWith('/worksheet'))?.target;
    if (!path) continue;
    const rows = sheetRows(await archive.read(path), strings, format, date1904, cancelled, () => {
      cells++; if (cells > MAX_XLSX_CELLS) throw new Error('工作簿单元格过多，请按月份或学期拆分');
    });
    result.push({ name: sheet.name, rows });
  }
  if (!result.length) throw new Error('工作簿中没有可读取的数据表');
  return result;
}
