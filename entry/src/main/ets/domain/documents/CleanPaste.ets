import { InlineRun, Block } from '../../models/Workspace';
import { compactRuns, copyRun, normalizedRuns, sliceRuns } from './RichText';
import { MAX_PASTE_CHARS, MAX_PASTE_TOKENS, MAX_PASTE_DEPTH, MAX_BLOCK_TEXT_CHARS, MAX_DOCUMENT_BLOCKS } from '../../config/constants';

export interface CleanPasteResult { text: string; runs: InlineRun[]; fromHtml: boolean; tables: string[][][]; mergedCells: boolean; notice: string; }
interface HtmlFrame { tag: string; marks: InlineRun; block: boolean; pre: boolean; listIndex: number; cells: number; cellParts?: string[]; }
interface RunBuffer { marks: InlineRun; parts: string[]; }
interface TagToken { name: string; close: boolean; selfClose: boolean; end: number; raw: string; }

export function normalizedPastedText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
function entities(text: string, names: Record<string, string>): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (whole: string, name: string): string => {
    if (name[0] !== '#') { const decoded = names[name]; return typeof decoded === 'string' ? decoded : whole; }
    const value = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return !Number.isFinite(value) || value <= 0 || value > 0x10FFFF || value >= 0xD800 && value <= 0xDFFF ? '\uFFFD' : names[`#${value}`] ?? String.fromCodePoint(value);
  });
}
function tokenAt(html: string, start: number): TagToken | undefined {
  if (!/^\/?[a-z]/i.test(html.slice(start + 1, start + 3))) return undefined;
  let quote = ''; let end = start + 1; const limit = Math.min(html.length, start + 16384);
  for (; end < limit; end++) {
    const char = html[end];
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '>') break;
  }
  if (end >= limit || end >= html.length) throw new Error('HTML标签未闭合或过长');
  const raw = html.slice(start + 1, end); const match = /^\s*(\/?)\s*([a-z][a-z0-9:-]*)(?=\s|\/|$)/i.exec(raw);
  if (!match) return undefined;
  return { name: match[2].toLowerCase(), close: !!match[1], selfClose: /\/\s*$/.test(raw), end: end + 1, raw };
}

class HtmlCleaner {
  private html: string;
  private names: Record<string, string>;
  private runs: RunBuffer[] = [];
  private parts: string[] = [];
  private length: number = 0;
  private lastCharacter: string = '';
  private currentCell: HtmlFrame | undefined;
  private frames: HtmlFrame[] = [{ tag: '', marks: { text: '' }, block: false, pre: false, listIndex: 0, cells: 0 }];
  private tables: string[][][] = [];
  private tableDepth: number = 0;
  private row: string[] | undefined;
  private merged: boolean = false;
  constructor(html: string, names: Record<string, string>) { this.html = html; this.names = names; }
  private top(): HtmlFrame { return this.frames[this.frames.length - 1]; }
  private append(value: string, marks: InlineRun = this.top().marks): void {
    if (!value) return;
    this.parts.push(value); this.length += value.length; this.lastCharacter = value[value.length - 1]; this.currentCell?.cellParts?.push(value);
    if (this.length > MAX_PASTE_CHARS) throw new Error('粘贴内容过长');
    const previous = this.runs[this.runs.length - 1];
    if (previous && this.sameMarks(previous.marks, marks)) previous.parts.push(value);
    else this.runs.push({ marks: copyRun(marks, ''), parts: [value] });
    if (this.runs.length > MAX_PASTE_TOKENS) throw new Error('粘贴格式过于复杂');
  }
  private sameMarks(left: InlineRun, right: InlineRun): boolean {
    return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline && left.strike === right.strike && left.fontFamily === right.fontFamily;
  }
  private line(): void { if (this.length && this.lastCharacter !== '\n') this.append('\n', { text: '' }); }
  private literal(raw: string): void {
    let value = entities(raw, this.names).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
    if (!this.top().pre) {
      value = value.replace(/[\t\n\f ]+/g, ' ');
      if (!this.length || /[\n\t ]/.test(this.lastCharacter)) value = value.replace(/^ /, '');
    }
    this.append(value);
  }
  private finish(frame: HtmlFrame): void {
    if ((frame.tag === 'td' || frame.tag === 'th') && this.tableDepth === 1 && this.row && frame.cellParts) {
      this.row.push(frame.cellParts.join('').replace(/\n+$/, '')); if (this.currentCell === frame) this.currentCell = undefined;
    }
    if (frame.tag === 'tr' && this.tableDepth === 1 && this.row) { this.tables[this.tables.length - 1].push(this.row); this.row = undefined; }
    if (frame.tag === 'table') this.tableDepth--;
    if (frame.block || frame.tag === 'li' || frame.tag === 'tr' || frame.tag === 'pre') this.line();
  }
  private close(tag: string): void {
    let index = this.frames.length - 1; while (index > 0 && this.frames[index].tag !== tag) index--;
    if (index <= 0) return;
    while (this.frames.length > index) { const frame = this.frames.pop(); if (frame) this.finish(frame); }
  }
  private autoClose(tag: string): void {
    if (tag === 'p' || ['table', 'ul', 'ol', 'div', 'section', 'article', 'blockquote', 'pre'].includes(tag) || /^h[1-6]$/.test(tag)) this.close('p');
    if (tag === 'li') {
      let list = this.frames.length - 1; while (list > 0 && !['ul', 'ol'].includes(this.frames[list].tag)) list--;
      const child = this.frames.findIndex((frame, index) => index > list && frame.tag === 'li'); if (child >= 0) this.close('li');
    }
    if (tag === 'tr') {
      let table = this.frames.length - 1; while (table > 0 && this.frames[table].tag !== 'table') table--;
      if (this.frames.some((frame, index) => index > table && frame.tag === 'tr')) this.close('tr');
    }
    if (tag === 'td' || tag === 'th') {
      const previous = this.frames.slice().reverse().find((frame) => ['td', 'th', 'tr', 'table'].includes(frame.tag));
      if (previous && (previous.tag === 'td' || previous.tag === 'th')) this.close(previous.tag);
    }
  }
  private open(token: TagToken): void {
    const tag = token.name; this.autoClose(tag); const parent = this.top(); const marks = copyRun(parent.marks, '');
    if (['b', 'strong'].includes(tag) || /^h[1-6]$/.test(tag)) marks.bold = true;
    if (tag === 'i' || tag === 'em') marks.italic = true;
    if (tag === 'u') marks.underline = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') marks.strike = true;
    if (tag === 'code' || tag === 'pre') marks.fontFamily = 'mono';
    const block = ['p', 'div', 'section', 'article', 'blockquote'].includes(tag) || /^h[1-6]$/.test(tag);
    const isBlock = block && parent.tag !== 'li';
    if (isBlock || tag === 'pre' || tag === 'table' || tag === 'tr') this.line();
    if (tag === 'blockquote') this.append('│ ', marks);
    if (tag === 'br') { this.line(); return; }
    if (tag === 'hr') { this.line(); this.append('——', marks); this.line(); return; }
    if (['area', 'base', 'col', 'embed', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tag)) return;
    if (tag === 'ul' || tag === 'ol') { if (parent.tag === 'li') this.line(); }
    if (tag === 'li') {
      this.line(); const list = this.frames.slice().reverse().find((frame) => frame.tag === 'ol' || frame.tag === 'ul');
      if (list) { list.listIndex++; this.append(list.tag === 'ol' ? `${list.listIndex}. ` : '• ', marks); }
      else this.append('• ', marks);
    }
    if (tag === 'table') { this.tableDepth++; if (this.tableDepth === 1) this.tables.push([]); else this.merged = true; }
    if (tag === 'tr' && this.tableDepth === 1) this.row = [];
    if ((tag === 'td' || tag === 'th') && this.tableDepth === 1) {
      const row = this.frames.slice().reverse().find((frame) => frame.tag === 'tr'); if (row && row.cells++ > 0) this.append('\t', { text: '' });
      if (/\b(?:colspan|rowspan)\s*=\s*["']?\s*(?:[2-9]|\d{2,})/i.test(token.raw)) this.merged = true;
    }
    const frame: HtmlFrame = { tag, marks, block: isBlock, pre: parent.pre || tag === 'pre', listIndex: 0, cells: 0,
      cellParts: (tag === 'td' || tag === 'th') && this.tableDepth === 1 ? [] : undefined };
    if (frame.cellParts) this.currentCell = frame;
    this.frames.push(frame); if (this.frames.length > MAX_PASTE_DEPTH) throw new Error('粘贴内容嵌套过深');
    if (token.selfClose) this.close(tag);
  }
  parse(): CleanPasteResult {
    let offset = 0; let count = 0; const lower = this.html.toLowerCase();
    while (offset < this.html.length) {
      if (++count > MAX_PASTE_TOKENS) throw new Error('粘贴格式过于复杂');
      if (this.html.startsWith('<!--', offset)) { const end = this.html.indexOf('-->', offset + 4); offset = end < 0 ? this.html.length : end + 3; continue; }
      if (this.html[offset] !== '<') {
        const end = this.html.indexOf('<', offset); this.literal(this.html.slice(offset, end < 0 ? this.html.length : end)); offset = end < 0 ? this.html.length : end; continue;
      }
      if (/^<!|^<\?/.test(this.html.slice(offset, offset + 2))) { const end = this.html.indexOf('>', offset + 2); offset = end < 0 ? this.html.length : end + 1; continue; }
      const token = tokenAt(this.html, offset);
      if (!token) { this.literal('<'); offset++; continue; }
      offset = token.end;
      if (!token.close && ['head', 'script', 'style', 'iframe', 'object', 'svg', 'noscript'].includes(token.name)) {
        let end = lower.indexOf(`</${token.name}`, offset); let closing: TagToken | undefined;
        while (end >= 0) { const candidate = tokenAt(this.html, end); if (candidate?.name === token.name && candidate.close) { closing = candidate; break; } end = lower.indexOf(`</${token.name}`, end + token.name.length + 2); }
        offset = closing?.end ?? this.html.length; continue;
      }
      if (token.close) this.close(token.name); else this.open(token);
    }
    while (this.frames.length > 1) { const frame = this.frames.pop(); if (frame) this.finish(frame); }
    const text = this.parts.join('').replace(/\n+$/, '');
    const values = this.runs.map((run) => copyRun(run.marks, run.parts.join(''))); const runs = compactRuns(sliceRuns(values, 0, text.length));
    return { text, runs, fromHtml: true, tables: this.tables, mergedCells: this.merged, notice: '' };
  }
}

export function cleanPaste(html: string, plain: string, names: Record<string, string>): CleanPasteResult {
  if (html.length > MAX_PASTE_CHARS || plain.length > MAX_PASTE_CHARS) throw new Error('粘贴内容过长，请分段复制');
  if (html) {
    try { const result = new HtmlCleaner(html, names).parse(); if (result.text || result.tables.length) return result; }
    catch (_) { if (!plain) throw new Error('富文本格式过于复杂，请复制为纯文本后重试'); }
  }
  const text = normalizedPastedText(plain);
  return { text, runs: text ? [{ text }] : [], fromHtml: false, tables: [], mergedCells: false, notice: html && text ? '已按纯文本保留剪贴板内容' : '' };
}
export function insertPaste(block: Block, start: number, end: number, runs: InlineRun[]): Block {
  const text = block.text ?? ''; const from = Math.max(0, Math.min(start, end, text.length)); const to = Math.max(from, Math.min(Math.max(start, end), text.length));
  const current = normalizedRuns(block); const next = JSON.parse(JSON.stringify(block)) as Block;
  next.inlineRuns = compactRuns(sliceRuns(current, 0, from).concat(runs, sliceRuns(current, to, text.length)));
  next.text = next.inlineRuns.map((run) => run.text).join('');
  if (next.text.length > MAX_BLOCK_TEXT_CHARS) throw new Error('粘贴后此块超过4000字；可用“粘贴为内容块”保留完整长文');
  if (next.inlineRuns.length > MAX_DOCUMENT_BLOCKS) throw new Error('局部格式过多，请分段粘贴');
  return next;
}

export function pasteAsBlocks(value: CleanPasteResult, id: () => string): Block[] {
  const blocks: Block[] = []; let start = 0;
  while (start < value.text.length) {
    let end = Math.min(value.text.length, start + MAX_BLOCK_TEXT_CHARS);
    if (end < value.text.length) {
      const newline = value.text.lastIndexOf('\n', end - 1); if (newline > start + MAX_BLOCK_TEXT_CHARS / 2) end = newline + 1;
      const last = value.text.charCodeAt(end - 1); if (last >= 0xD800 && last <= 0xDBFF) end--;
    }
    const runs = compactRuns(sliceRuns(value.runs, start, end)); const block: Block = { id: id(), type: 'text', text: value.text.slice(start, end), inlineRuns: runs };
    if (runs.length > MAX_DOCUMENT_BLOCKS) throw new Error('局部格式过多，请分段复制');
    blocks.push(block); start = end;
    if (blocks.length > MAX_DOCUMENT_BLOCKS) throw new Error('内容块过多，请分段复制');
  }
  return blocks;
}
