import { Workspace, ReviewItem, ReviewStep, WorkspaceEntry } from '../../models/Workspace';
import { localDate, uid } from './WorkspaceDomain';

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

export function assertReviewItem(items: ReviewItem[], item: ReviewItem): void {
  if (!item.course.trim() || !item.chapter.trim()) throw new Error('请填写课程和复习项目');
  if (item.course.length > 500 || item.chapter.length > 500 || item.note.length > 4000) throw new Error('课程或项目最多500字，备注最多4000字');
  if (items.some((v) => v.id !== item.id && sameCourse(v.course, item.course) && sameChapter(v.chapter, item.chapter))) throw new Error('池中已有这个复习项目');
  if (!items.some((v) => v.id === item.id) && items.length >= 500) throw new Error('复习池最多保存500个项目');
  const steps = item.steps ?? [];
  if (steps.length > 50) throw new Error('每章最多50个小任务');
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
  return { id: uid(), course: course.title, chapter, progress: Number(record.progress ?? 0), done: record.done ?? false,
    completedDate: record.completedDate, note: '', sources: [], steps: [] };
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
  if (item && item.sources.length >= 2000) throw new Error('此章节关联记录已达上限');
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
  assertReviewItem(data.reviewPool.items, item);
  return item;
}
