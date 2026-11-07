import { Workspace, ReviewPool, ReviewItem, ReviewStep, ReviewSource } from '../../models/Workspace';
import { ReviewNames, ReviewDraft, ReviewDeletion } from '../../models/ReviewModels';
import { assertReviewItem, normalizeChapter, sameChapter, sameCourse } from './ReviewDomain';
import { validDate } from './WorkspaceDomain';
import { MAX_REVIEW_ITEMS, MAX_REVIEW_STEPS, MAX_REVIEW_REMOVED_SOURCES } from '../../config/constants';

export function reviewPool(data: Workspace): ReviewPool {
  if (!data.reviewPool) data.reviewPool = { version: 1, items: [] };
  return data.reviewPool;
}
export function requireReview(data: Workspace, id: string): ReviewItem {
  const item = data.reviewPool?.items.find((value) => value.id === id);
  if (!item) throw new Error('此复习项目已移除，请返回列表重新打开');
  return item;
}
export function requireStep(item: ReviewItem, id: string): ReviewStep {
  const step = item.steps?.find((value) => value.id === id);
  if (!step) throw new Error('此小任务已移除，请重新读取');
  return step;
}
export function createReview(data: Workspace, draft: ReviewDraft, id: string): ReviewItem {
  const pool = reviewPool(data); const course = draft.course.trim(); const chapter = normalizeChapter(draft.chapter);
  const existing = pool.items.find((item) => item.id === id);
  if (existing) {
    if (sameCourse(existing.course, course) && sameChapter(existing.chapter, chapter) && existing.note === draft.note.trim()) return existing;
    throw new Error('这个复习项目编号已经使用');
  }
  const item: ReviewItem = { id, course: pool.items.find((value) => sameCourse(value.course, course))?.course ?? course,
    chapter, note: draft.note.trim(), progress: 0, done: false, sources: [] };
  assertReviewItem(pool.items, item); pool.items.push(item); return item;
}
export function renameReview(data: Workspace, id: string, names: ReviewNames, expected: ReviewNames): void {
  const item = requireReview(data, id); const course = names.course.trim(); const chapter = normalizeChapter(names.chapter);
  if ((item.course !== expected.course || item.chapter !== expected.chapter) && !(sameCourse(item.course, course) && sameChapter(item.chapter, chapter))) {
    throw new Error('项目名称已在别处修改，请重新读取后核对');
  }
  item.course = data.reviewPool?.items.find((other) => other.id !== id && sameCourse(other.course, course))?.course ?? course;
  item.chapter = chapter; assertReviewItem(reviewPool(data).items, item);
}
export function changeReviewNote(item: ReviewItem, note: string, expected: string): void {
  if (note.length > 4000) throw new Error('备注最多4000字');
  if (item.note !== expected && item.note !== note) throw new Error('备注已在别处修改，当前输入已保留，请先核对原文');
  item.note = note;
}
export function completeReview(item: ReviewItem, done: boolean, day: string): void {
  if (!validDate(day)) throw new Error('完成日期无效');
  if (done && !item.done) { item.previousProgress = item.progress; item.completedDate = day; }
  item.done = done;
  if (done) item.progress = 100;
  else { if (item.progress === 100) item.progress = item.previousProgress ?? 0; item.completedDate = undefined; item.previousProgress = undefined; }
}
export function completeReviewStep(step: ReviewStep, done: boolean, day: string): void {
  if (!validDate(day)) throw new Error('完成日期无效');
  if (done && !step.done) step.completedDate = day;
  step.done = done; if (!done) step.completedDate = undefined;
}
export function selectReview(item: ReviewItem | ReviewStep, selected: boolean, day: string): void {
  if (!validDate(day)) throw new Error('安排日期无效');
  if (selected && item.done && item.selectedDate !== day) throw new Error('已完成的项目不能重新安排，请先标记未完成');
  item.selectedDate = selected ? day : undefined;
}
export function addReviewStep(item: ReviewItem, title: string, id: string): void {
  const name = title.trim(); if (!name || name.length > 500) throw new Error('小任务内容需为1–500字');
  const steps = item.steps ?? []; const existing = steps.find((step) => step.id === id);
  if (existing) { if (existing.title === name) return; throw new Error('这个小任务编号已经使用'); }
  if (steps.length >= MAX_REVIEW_STEPS) throw new Error('每个项目最多50个小任务');
  item.steps = steps.concat([{ id, title: name, done: false } as ReviewStep]);
}
export function renameReviewStep(item: ReviewItem, id: string, title: string, expected: string): void {
  const name = title.trim(); if (!name || name.length > 500) throw new Error('小任务内容需为1–500字');
  const step = requireStep(item, id);
  if (step.title !== expected && step.title !== name) throw new Error('小任务已在别处修改，请重新读取后核对');
  step.title = name;
}
export function deleteReviewStep(item: ReviewItem, stepId: string): ReviewDeletion {
  const steps = item.steps ?? []; const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new Error('小任务已移除');
  const deletion: ReviewDeletion = { kind: 'step', parentId: item.id, index, step: JSON.parse(JSON.stringify(steps[index])) as ReviewStep };
  item.steps = steps.filter((step) => step.id !== stepId); return deletion;
}
function sourceKey(source: ReviewSource): string { return `${source.kind}:${source.id}`; }
export function deleteReview(data: Workspace, id: string): ReviewDeletion {
  const pool = reviewPool(data); const item = requireReview(data, id); const index = pool.items.findIndex((value) => value.id === id);
  const removed = new Map<string, ReviewSource>();
  (pool.removedSources ?? []).concat(item.sources).forEach((source) => removed.set(sourceKey(source), source));
  if (removed.size > MAX_REVIEW_REMOVED_SOURCES) throw new Error('已移除来源记录达到上限，未删除项目');
  const deletion: ReviewDeletion = { kind: 'chapter', parentId: '', index, item: JSON.parse(JSON.stringify(item)) as ReviewItem };
  pool.items = pool.items.filter((value) => value.id !== id); pool.removedSources = Array.from(removed.values()); return deletion;
}
export function restoreReview(data: Workspace, deletion: ReviewDeletion): void {
  const pool = reviewPool(data);
  if (deletion.kind === 'step' && deletion.step) {
    const item = requireReview(data, deletion.parentId); const steps = item.steps ?? [];
    if (steps.some((step) => step.id === deletion.step?.id)) throw new Error('同编号小任务已经存在，未覆盖现有内容');
    if (steps.length >= MAX_REVIEW_STEPS) throw new Error('小任务数量已达上限，未覆盖现有内容');
    steps.splice(Math.max(0, Math.min(deletion.index, steps.length)), 0, JSON.parse(JSON.stringify(deletion.step)) as ReviewStep);
    item.steps = steps; assertReviewItem(pool.items, item, false);
  } else if (deletion.kind === 'chapter' && deletion.item) {
    const item = JSON.parse(JSON.stringify(deletion.item)) as ReviewItem;
    if (pool.items.length >= MAX_REVIEW_ITEMS || pool.items.some((value) => value.id === item.id)) throw new Error('同编号项目已存在或复习池已满，未覆盖现有内容');
    const others = new Set(pool.items.flatMap((value) => value.sources.map(sourceKey)));
    if (item.sources.some((source) => others.has(sourceKey(source)))) throw new Error('原来源已关联其他项目，未重复恢复');
    assertReviewItem(pool.items, item);
    pool.items.splice(Math.max(0, Math.min(deletion.index, pool.items.length)), 0, item);
    const sources = new Set(item.sources.map(sourceKey)); pool.removedSources = pool.removedSources?.filter((source) => !sources.has(sourceKey(source)));
  } else throw new Error('没有可恢复的删除记录');
}
