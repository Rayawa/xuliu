import { assertFinance } from '../finance/FinanceDomain';
import { Workspace, WorkspaceEntry, Block } from '../../models/Workspace';
import { MAX_FILE_BYTES, MAX_BLOCK_TEXT_CHARS, MAX_DOCUMENT_BLOCKS, MAX_ATTACHMENTS } from '../../config/constants';
import { validDate, validTime } from './WorkspaceDomain';

function assertText(value: string | undefined, name: string, max: number = MAX_BLOCK_TEXT_CHARS): void {
  if (value !== undefined && (typeof value !== 'string' || value.length > max)) throw new Error(`${name}格式无效`);
}

function assertBlocks(blocks: Block[] | undefined): void {
  if (blocks === undefined) return;
  if (!Array.isArray(blocks) || blocks.length > MAX_DOCUMENT_BLOCKS) throw new Error('内容块格式或数量无效');
  blocks.forEach((block) => {
    if (!block || typeof block.id !== 'string' || typeof block.type !== 'string') throw new Error('内容块缺少编号或类型');
    assertText(block.text, '内容块正文'); assertText(block.url, '内容块链接', MAX_FILE_BYTES);
    if (block.rows !== undefined && (!Array.isArray(block.rows) || block.rows.some((row) => !Array.isArray(row) || row.some((v) => typeof v !== 'string')))) {
      throw new Error('表格内容无效');
    }
    if (block.inlineRuns !== undefined && (!Array.isArray(block.inlineRuns) || block.inlineRuns.length > MAX_DOCUMENT_BLOCKS ||
      block.inlineRuns.some((run) => !run || typeof run.text !== 'string') || block.inlineRuns.map((run) => run.text).join('') !== (block.text ?? ''))) throw new Error('局部文字格式与正文不一致');
    if (block.embeddedFiles !== undefined && (!Array.isArray(block.embeddedFiles) || block.embeddedFiles.length > MAX_ATTACHMENTS)) throw new Error('内嵌附件无效');
    if (block.embeddedImages !== undefined && (!Array.isArray(block.embeddedImages) || block.embeddedImages.length > MAX_ATTACHMENTS)) throw new Error('内嵌图片无效');
  });
}

function assertEntries(items: WorkspaceEntry[], family: string): void {
  if (items.length > 10000) throw new Error('记录数量超过限制');
  const ids: Set<string> = new Set();
  items.forEach((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 120 || typeof item.title !== 'string' || item.title.length > 500) {
      throw new Error('记录编号或标题格式无效');
    }
    if (ids.has(item.id)) throw new Error('记录编号重复');
    ids.add(item.id);
    for (const text of [item.note, item.requirements, item.goal, item.summary, item.objective, item.next, item.description, item.ingredients, item.outcomeText]) {
      assertText(text, '记录正文');
    }
    for (const text of [item.area, item.status, item.location, item.teacher, item.term, item.kind, item.space, item.source, item.category]) {
      assertText(text, '记录属性', 500);
    }
    for (const date of [item.date, item.due, item.plannedDate, item.startDate, item.completedDate]) {
      if (date !== undefined && date !== '' && (typeof date !== 'string' || !validDate(date))) throw new Error('记录日期无效');
    }
    if (item.progress !== undefined) {
      if (family === 'media') assertText(item.progress as string, '阅读进度', 500);
      else if (typeof item.progress !== 'number' || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 100) throw new Error('记录进度无效');
    }
    assertBlocks(item.blocks);
    if (item.pages !== undefined) {
      if (!Array.isArray(item.pages)) throw new Error('研究页面无效');
      item.pages.forEach((page) => { if (!page || typeof page.id !== 'string' || typeof page.title !== 'string') throw new Error('研究页面无效'); assertBlocks(page.blocks); });
    }
    if (family === 'courses') {
      if (!Array.isArray(item.schedule)) throw new Error('课程时段无效');
      item.schedule.forEach((slot) => {
        if (!slot || typeof slot.id !== 'string' || !Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7 ||
          typeof slot.start !== 'string' || typeof slot.end !== 'string' || !validTime(slot.start) || !validTime(slot.end)) throw new Error('课程时间无效');
      });
    }
    if (family === 'habits' && typeof item.schedule !== 'string') throw new Error('习惯频率无效');
    for (const list of [item.resources, item.websites, item.versions, item.times, item.progressLogs, item.attachments, item.outcomeAttachments]) {
      if (list !== undefined && !Array.isArray(list)) throw new Error('记录子项格式无效');
    }
  });
}

export function assertWorkspace(data: Workspace): void {
  assertEntries(data.tasks, 'tasks'); assertEntries(data.milestones, 'milestones'); assertEntries(data.courses, 'courses');
  assertEntries(data.learning, 'learning'); assertEntries(data.research, 'research'); assertEntries(data.ideas, 'ideas');
  assertEntries(data.tools, 'tools'); assertEntries(data.habits, 'habits'); assertEntries(data.routines, 'routines');
  assertEntries(data.reminders, 'reminders'); assertEntries(data.media, 'media'); assertEntries(data.recipes, 'recipes'); assertEntries(data.pages, 'pages');
  assertFinance(data.finance);
  if (data.reviewPool) {
    if (!Array.isArray(data.reviewPool.items)) throw new Error('复习池格式无效');
    data.reviewPool.items.forEach((item) => {
      if (!item || typeof item.id !== 'string' || typeof item.course !== 'string' || typeof item.chapter !== 'string' || !Array.isArray(item.sources) ||
        (item.steps !== undefined && !Array.isArray(item.steps))) throw new Error('复习章节格式无效');
    });
  }
  if (typeof data.timetableSettings.termStartDate !== 'string' || !validDate(data.timetableSettings.termStartDate)) throw new Error('学期起始日期无效');
}
