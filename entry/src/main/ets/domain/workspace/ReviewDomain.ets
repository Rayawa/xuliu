import { MAX_REVIEW_ITEMS, MAX_REVIEW_STEPS, MAX_REVIEW_SOURCES, MAX_REVIEW_REMOVED_SOURCES } from '../../config/constants';
import { Workspace, ReviewItem, ReviewStep, ReviewPool, WorkspaceEntry } from '../../models/Workspace';
import { localDate, uid, validDate } from './WorkspaceDomain';

interface ReviewCourse {
  key: string;
  title: string;
  aliases: string[];
  chapters: string[];
}

interface TodayCounts {
  total: number;
  completed: number;
}

const REVIEW_COURSES: ReviewCourse[] = [
  { key: 'big-data', title: '大数据分析', aliases: ['大数据分析', '大数据'], chapters: ['L2', 'L3', 'L4'] },
  { key: 'probability', title: '概率论', aliases: ['概率论与数理统计', '概率论', '概率'], chapters: ['第1章', '第2章'] },
  { key: 'accounting', title: '会计学基础', aliases: ['会计学基础', '会计基础'], chapters: ['L1', 'L2', 'L3'] },
  { key: 'economics', title: '经济学基础', aliases: ['经济学基础', '经济学'], chapters: ['L1', 'L2', 'L3', 'L4'] },
  { key: 'tax', title: '税收理论与实务', aliases: ['税收理论与实务', '税收理论', '税务', '税法'], chapters: ['第1章', '第2章', '第3章'] },
  { key: 'linear-algebra', title: '线性代数', aliases: ['线性代数b', '线性代数', '线代'], chapters: ['第1章', '第2章'] }
];
const DIGITS: Record<string, number> = { "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const UNITS: Record<string, number> = { "十": 10, "百": 100, "千": 1000 };
const FORMAL_WORK: RegExp = /作业|提交|考试|测验|测试|论文|报告|交付|答辩|quiz|homework|assignment|exam|deadline|\bddl\b/i;

function compact(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function chapterNumber(value: string): string | undefined {
  const text = value.normalize('NFKC');
  if (/^\d+$/.test(text)) return text.replace(/^0+(?=\d)/, '');
  if (/^[零〇一二两三四五六七八九]+$/.test(text)) return text.split('').map((digit) => DIGITS[digit]).join('').replace(/^0+(?=\d)/, '');
  let total = 0;
  let digit: number | undefined;
  let lastUnit = Infinity;
  for (const character of text) {
    if (DIGITS[character] !== undefined) {
      if (digit !== undefined && digit !== 0) return undefined;
      digit = DIGITS[character];
    } else {
      const unit = UNITS[character];
      if (!unit || unit >= lastUnit || digit === 0) return undefined;
      if (digit === undefined && (total !== 0 || unit !== 10)) return undefined;
      total += (digit ?? 1) * unit; digit = undefined; lastUnit = unit;
    }
  }
  return String(total + (digit ?? 0));
}

export function normalizeChapter(value: string): string {
  const text = value.trim();
  const lecture = /^[lLｌＬ]\s*([0-9０-９]+)(?=$|[^A-Za-z0-9０-９])/.exec(text);
  if (lecture) return `L${chapterNumber(lecture[1])}${text.slice(lecture[0].length)}`;
  const chapter = /^第\s*([0-9０-９零〇一二两三四五六七八九十百千]+)\s*章/.exec(text);
  if (!chapter) return text;
  const number = chapterNumber(chapter[1]);
  return number === undefined ? text : `第${number}章${text.slice(chapter[0].length)}`;
}

function courseKey(title: string): string {
  const name = compact(title);
  return REVIEW_COURSES.find((course) => course.aliases.some((alias) => name.includes(alias)))?.key ?? name;
}

export function sameCourse(left: string, right: string): boolean {
  return courseKey(left) === courseKey(right);
}

export function sameChapter(left: string, right: string): boolean {
  return compact(normalizeChapter(left)) === compact(normalizeChapter(right));
}

export function assertReviewItem(items: ReviewItem[], item: ReviewItem, checkName: boolean = true): void {
  if (!item.course.trim() || !item.chapter.trim()) throw new Error('请填写课程和复习项目');
  if (item.course.length > 500 || item.chapter.length > 500 || item.note.length > 4000) throw new Error('课程或项目最多500字，备注最多4000字');
  if (checkName && items.some((v) => v.id !== item.id && sameCourse(v.course, item.course) && sameChapter(v.chapter, item.chapter))) throw new Error('池中已有这个复习项目');
  if (!items.some((v) => v.id === item.id) && items.length >= MAX_REVIEW_ITEMS) throw new Error('复习池最多保存500个项目');
  const steps = item.steps ?? [];
  if (steps.length > MAX_REVIEW_STEPS) throw new Error('每章最多50个小任务');
  const ids = new Set<string>();
  steps.forEach((step) => {
    if (!step.title.trim() || step.title.length > 500 || ids.has(step.id)) throw new Error('小任务内容需为1–500字，编号不能重复');
    ids.add(step.id);
  });
}

export function chapterVisible(item: ReviewItem, day: string): boolean {
  return item.selectedDate === day && (!item.done || item.completedDate === day);
}

export function stepVisible(step: ReviewStep, day: string): boolean {
  return step.selectedDate === day && (!step.done || step.completedDate === day);
}

export function stepTodayCounts(item: ReviewItem, day: string): TodayCounts {
  const steps = (item.steps ?? []).filter((step) => stepVisible(step, day) || (step.done && step.completedDate === day));
  return { total: steps.length, completed: steps.filter((step) => step.done && step.completedDate === day).length };
}

export function stepTodaySummary(item: ReviewItem, day: string): string {
  const counts = stepTodayCounts(item, day);
  if (!counts.total) return '';
  if (counts.completed === counts.total) return `今日完成 ${counts.completed} 项`;
  if (counts.completed > 0) return `今日完成 ${counts.completed}/${counts.total} 项`;
  return `今日小任务 ${counts.total} 项`;
}

export function reviewTodayCounts(items: ReviewItem[], day: string): TodayCounts {
  let total = 0; let completed = 0;
  items.forEach((item) => {
    if (chapterVisible(item, day)) { total++; if (item.done) completed++; }
    (item.steps ?? []).forEach((step) => { if (stepVisible(step, day)) { total++; if (step.done) completed++; } });
  });
  return { total, completed };
}

export function reviewSourceKeys(data: Workspace): Set<string> {
  const keys: Set<string> = new Set();
  data.reviewPool?.items.forEach((item) => item.sources.forEach((source) => keys.add(`${source.kind}:${source.id}`)));
  data.reviewPool?.removedSources?.forEach((source) => keys.add(`${source.kind}:${source.id}`));
  let changed = true;
  while (changed) {
    changed = false;
    data.tasks.forEach((task) => {
      if (!task.id.startsWith('stage:') || FORMAL_WORK.test(task.title) || FORMAL_WORK.test(task.requirements ?? '') || keys.has(`task:${task.id}`)) return;
      if ((task.parentId && keys.has(`task:${task.parentId}`)) || (task.parentMilestoneId && keys.has(`milestone:${task.parentMilestoneId}`))) {
        keys.add(`task:${task.id}`); changed = true;
      }
    });
  }
  return keys;
}

/** Attach hidden generated descendants so their original notes and timing remain reachable in the pool. */
export function attachReviewStages(data: Workspace): number {
  const owners = new Map<string, ReviewItem>(); const removed = new Set((data.reviewPool?.removedSources ?? []).map((source) => `${source.kind}:${source.id}`));
  data.reviewPool?.items.forEach((item) => item.sources.forEach((source) => owners.set(`${source.kind}:${source.id}`, item)));
  let added = 0; let changed = true;
  while (changed) {
    changed = false;
    for (const task of data.tasks) {
      const key = `task:${task.id}`;
      if (!task.id.startsWith('stage:') || FORMAL_WORK.test(task.title) || FORMAL_WORK.test(task.requirements ?? '') || owners.has(key) || removed.has(key)) continue;
      const taskOwner = task.parentId ? owners.get(`task:${task.parentId}`) : undefined;
      const nodeOwner = task.parentMilestoneId ? owners.get(`milestone:${task.parentMilestoneId}`) : undefined;
      if (taskOwner && nodeOwner && taskOwner.id !== nodeOwner.id) continue;
      const owner = taskOwner ?? nodeOwner; if (!owner) continue;
      if (owner.sources.length >= MAX_REVIEW_SOURCES) throw new Error('章节来源已达上限，未归集额外阶段');
      owner.sources.push({ kind: 'task', id: task.id }); owners.set(key, owner); changed = true; added++;
    }
  }
  return added;
}

/** Classify only unambiguous course/chapter review records; formal coursework is never absorbed. */
export function pureReviewMatch(record: WorkspaceEntry, data: Workspace): ReviewItem | undefined {
  if (record.automationKey || record.id.startsWith('stage:') || FORMAL_WORK.test(record.title) || FORMAL_WORK.test(record.requirements ?? '')) return undefined;
  const title = compact(record.title);
  const context = [title, compact(record.source ?? ''), compact(data.courses.find((course) => course.id === record.courseId)?.title ?? '')];
  const candidates = REVIEW_COURSES.filter((course) => course.aliases.some((alias) => context.some((value) => value.includes(alias))));
  if (candidates.length !== 1) return undefined;
  const course = candidates[0];
  const matches = Array.from(title.matchAll(/(?:lecture|lec|l)([1-9]\d*)|第([一二三四五六七八九十\d]+)章|(?:chapter|ch)([1-9]\d*)/g));
  if (matches.length !== 1) return undefined;
  const match = matches[0]; const numeral = match[1] ?? match[2] ?? match[3];
  const number = /^\d+$/.test(numeral) ? Number(numeral) : '一二三四五六七八九十'.indexOf(numeral) + 1;
  if (!number) return undefined;
  const chapter = course.chapters.find((value) => Number(value.match(/\d+/)?.[0]) === number);
  if (!chapter) return undefined;
  let remainder = title.replace(match[0], '');
  course.aliases.forEach((alias) => { remainder = remainder.replace(alias, ''); });
  remainder = remainder.replace(/\((?:全英文|英文|中文)\)/g, '');
  const explicitReview = /rev(?:iew)?|复习|自学|学习/.test(remainder);
  const onlyCourseChapter = remainder.replace(/[·:：/\\_\-—()（）]/g, '') === '';
  if (!explicitReview && !onlyCourseChapter) return undefined;
  remainder = remainder.replace(/review|rev|复习|自学|学习/g, '').replace(/[·:：/\\_\-—()（）]/g, '');
  if (remainder) return undefined;
  const done = record.done === true || record.status === '已完成' || record.progress === 100;
  const progress = done ? 100 : Math.min(99, Math.max(0, Math.round(Number(record.progress) || 0)));
  return { id: uid(), course: course.title, chapter, progress, done,
    completedDate: done ? record.completedDate || record.progressLogs?.slice().reverse().find((log) => log.progress === 100)?.date : undefined, note: '', sources: [], steps: [] };
}

export function transferStudyToPool(data: Workspace, sourceId: string, chapter: string, note: string, completedToday: boolean): ReviewItem {
  const source = data.milestones.find((node) => node.id === sourceId);
  const course = data.courses.find((item) => item.id === source?.courseId);
  if (!source || !course || source.done || !source.automationKey?.startsWith('study:') || reviewSourceKeys(data).has(`milestone:${sourceId}`)) {
    throw new Error('仅未完成且尚未归集的自动学习任务可转入复习池');
  }
  if (!data.reviewPool) data.reviewPool = { version: 1, items: [], removedSources: [] };
  const normalized = normalizeChapter(chapter);
  let item = data.reviewPool.items.find((v) => sameCourse(v.course, course.title) && sameChapter(v.chapter, normalized));
  if (item?.done) throw new Error('此章节已完成，请先在复习池中标记未完成');
  if (item && item.sources.length >= MAX_REVIEW_SOURCES) throw new Error('此章节关联记录已达上限');
  if (!item) {
    item = { id: uid(), course: course.title, chapter: normalized, progress: 0, note: '', done: false, sources: [] };
    assertReviewItem(data.reviewPool.items, item); data.reviewPool.items.push(item);
  }
  if (note.trim() && !item.note.split('\n\n').includes(note.trim())) item.note = [item.note, note.trim()].filter((v) => !!v).join('\n\n');
  item.sources.push({ kind: 'milestone', id: source.id }); item.selectedDate = undefined;
  if (completedToday) {
    item.previousProgress = item.progress; item.done = true; item.progress = 100;
    item.completedDate = localDate(); item.selectedDate = localDate();
  }
  attachReviewStages(data); assertReviewItem(data.reviewPool.items, item);
  return item;
}

/** Validate the shared version-6 contract without renaming or discarding legacy records. */
export function assertReviewPool(pool: ReviewPool): void {
  if (!pool || pool.version !== 1 || !Array.isArray(pool.items) || pool.items.length > MAX_REVIEW_ITEMS) throw new Error('复习池格式或项目数量无效');
  const ids = new Set<string>(); const sources = new Set<string>();
  const validId = (id: string): boolean => typeof id === 'string' && id.length > 0 && id.length <= 120;
  const validDay = (day: string | undefined): boolean => day === undefined || typeof day === 'string' && validDate(day);
  for (const item of pool.items) {
    if (!item || !validId(item.id) || ids.has(item.id) || typeof item.course !== 'string' || !item.course || item.course.length > 500 ||
      typeof item.chapter !== 'string' || !item.chapter || item.chapter.length > 500 || typeof item.note !== 'string' || item.note.length > 4000 ||
      typeof item.done !== 'boolean' || !Number.isInteger(item.progress) || item.progress < 0 || item.progress > 100 || item.done !== (item.progress === 100) ||
      !validDay(item.selectedDate) || !validDay(item.completedDate) || (!item.done && item.completedDate !== undefined) ||
      (item.previousProgress !== undefined && (!item.done || !Number.isInteger(item.previousProgress) || item.previousProgress < 0 || item.previousProgress > 99))) throw new Error('复习项目编号、完成状态或日期无效');
    ids.add(item.id);
    if (!Array.isArray(item.sources) || item.sources.length > MAX_REVIEW_SOURCES || (item.steps !== undefined && (!Array.isArray(item.steps) || item.steps.length > MAX_REVIEW_STEPS))) throw new Error('复习来源或小任务数量无效');
    const stepIds = new Set<string>();
    for (const step of item.steps ?? []) {
      if (!step || !validId(step.id) || stepIds.has(step.id) || typeof step.title !== 'string' || !step.title.trim() || step.title.length > 500 ||
        typeof step.done !== 'boolean' || !validDay(step.selectedDate) || !validDay(step.completedDate) || (!step.done && step.completedDate !== undefined)) throw new Error('复习小任务编号、内容或完成日期无效');
      stepIds.add(step.id);
    }
    for (const source of item.sources) {
      if (!source || !['task', 'milestone'].includes(source.kind) || !validId(source.id)) throw new Error('原复习来源缺少有效编号');
      const key = `${source.kind}:${source.id}`;
      if (sources.has(key)) throw new Error('原复习来源不能重复归集');
      sources.add(key);
    }
  }
  if (pool.removedSources !== undefined && (!Array.isArray(pool.removedSources) || pool.removedSources.length > MAX_REVIEW_REMOVED_SOURCES)) throw new Error('已移除复习来源格式或数量无效');
  for (const source of pool.removedSources ?? []) {
    if (!source || !['task', 'milestone'].includes(source.kind) || !validId(source.id)) throw new Error('已移除来源缺少有效编号');
    const key = `${source.kind}:${source.id}`;
    if (sources.has(key)) throw new Error('已移除来源不能重复归集');
    sources.add(key);
  }
}
