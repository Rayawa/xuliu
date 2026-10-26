import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReviewPoolItem, createReviewPoolItem, initializeCourseReviewPool, reviewPoolItemVisibleOnDate, reviewPoolReadProjection, updateReviewPoolItem, withoutReviewPoolSources } from '../lib/course-review-pool.ts';
import { aiCourseContextFromWorkspace } from '../lib/ai-course-context.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';
import { withPlannedTaskStages } from '../lib/task-stages.ts';
import { upcomingDeadlines } from '../lib/upcoming-deadlines.ts';

const today = '2026-10-23';
const tomorrow = '2026-10-24';

test('adding within the pool creates an undated checklist item and preserves other work', () => {
  const original = initializeCourseReviewPool(stateFor([task('formal', '线代作业week3', { due: tomorrow })]));
  const before = JSON.stringify(original);
  const item = createReviewPoolItem(original.reviewPool.items, { course: ' 经济学基础 ', chapter: ' L5 ', note: ' 看到第二节，下次继续例题 ' }, 'review-added');
  assert.equal(JSON.stringify(original), before);
  assert.equal(item.course, '经济学基础');
  assert.equal(item.chapter, 'L5');
  assert.equal(item.note, '看到第二节，下次继续例题');
  assert.equal(item.done, false);
  for (const key of ['selectedDate', 'plannedDate', 'due', 'date']) assert.equal(key in item, false);
  let state = { ...original, reviewPool: { ...original.reviewPool, items: [...original.reviewPool.items, item] } };
  assert.equal(reviewPoolItemVisibleOnDate(item, today), false);
  state = chooseReviewPoolItem(state, item.id, today);
  assert.equal(reviewPoolItemVisibleOnDate(itemById(state, item.id), today), true);
  state = updateReviewPoolItem(state, item.id, { done: true }, today);
  state = updateReviewPoolItem(state, item.id, { done: false, selectedDate: undefined }, today);
  assert.equal(itemById(state, item.id).note, item.note);
  assert.equal(reviewPoolItemVisibleOnDate(itemById(state, item.id), tomorrow), false);
  assert.equal(state.tasks, original.tasks);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
});

test('pool additions reject duplicate chapters, missing names and invalid sizes', () => {
  const items = initializeCourseReviewPool(stateFor()).reviewPool.items;
  assert.throws(() => createReviewPoolItem(items, { course: '经济学基础', chapter: 'ｌ １', note: '' }, 'unique'));
  assert.throws(() => createReviewPoolItem(items, { course: ' ', chapter: 'L5', note: '' }, 'unique'));
  assert.throws(() => createReviewPoolItem(items, { course: '经济学基础', chapter: ' ', note: '' }, 'unique'));
  assert.throws(() => createReviewPoolItem(items, { course: '经济学基础', chapter: 'L5', note: '' }, items[0].id));
  assert.throws(() => createReviewPoolItem(items, { course: '经济学基础', chapter: 'L5', note: '长'.repeat(4001) }, 'unique'));
});
const task = (id, title, extra = {}) => ({ id, title, area: '课内', source: '', done: false, today: false, elapsed: 0, ...extra });
const milestone = (id, title, extra = {}) => ({ id, title, area: '课内', courseId: 'linear', date: today, time: '20:00', location: '', requirements: '', done: false, ...extra });
const stateFor = (tasks = [], milestones = []) => ({ ...createEmptyWorkspaceState(), tasks, milestones });
const itemById = (state, id) => state.reviewPool.items.find(item => item.id === id);
const economicsId = 'review:economics:L1';

test('initializes seventeen internal chapters with only economics L1 chosen on the fixed request date', () => {
  const original = stateFor();
  const state = initializeCourseReviewPool(original);
  assert.equal(state.reviewPool.items.length, 17);
  assert.deepEqual(state.reviewPool.items.filter(item => reviewPoolItemVisibleOnDate(item, today)).map(item => item.id), [economicsId]);
  assert.equal(state.reviewPool.items.some(item => item.id === 'review:big-data:L1'), false);
  assert.deepEqual([...new Set(state.reviewPool.items.map(item => item.course))], ['大数据分析', '概率论', '会计学基础', '经济学基础', '税收理论与实务', '线性代数']);
  assert.equal(state.tasks, original.tasks);
  assert.equal(state.milestones, original.milestones);
  assert.deepEqual(upcomingDeadlines(state.tasks, state.milestones, today), []);
  assert.equal(state.reviewPool.items.some(item => 'due' in item || 'plannedDate' in item), false);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
});

test('cancelling or revisiting on a later day never recreates the initial selection or rolls it forward', () => {
  const first = initializeCourseReviewPool(stateFor());
  assert.equal(first.reviewPool.items.filter(item => reviewPoolItemVisibleOnDate(item, tomorrow)).length, 0);
  const cancelled = updateReviewPoolItem(first, economicsId, { selectedDate: undefined, progress: 35, note: '已读到第二节' }, today);
  assert.equal(initializeCourseReviewPool(cancelled, tomorrow), cancelled);
  assert.equal(itemById(cancelled, economicsId).selectedDate, undefined);
  assert.equal(itemById(cancelled, economicsId).progress, 35);
  assert.equal(itemById(cancelled, economicsId).note, '已读到第二节');
  const chosen = chooseReviewPoolItem(cancelled, economicsId, tomorrow);
  assert.equal(reviewPoolItemVisibleOnDate(itemById(chosen, economicsId), tomorrow), true);
  assert.equal(itemById(chosen, economicsId).progress, 35);
  assert.equal(chosen.tasks.length, 0);
});

test('merges known review titles, preserving original notes, attachments, progress and time references verbatim', () => {
  const attachment = { id: 'attachment', url: 'https://example.com/review.pdf', fileName: '复习.pdf', fileSize: 25, mimeType: 'application/pdf', uploadedAt: '2026-10-22T10:00:00Z' };
  const linear = task('linear-review', '线代第二章rev', { progress: 45, status: '进行中', elapsed: 20, requirements: '先看自己的笔记', attachments: [attachment], blocks: [{ id: 'note', type: 'text', text: '矩阵例题还没弄懂' }], progressLogs: [{ id: 'progress', date: today, progress: 45, status: '进行中', note: '完成第一节' }], due: today, plannedDate: today });
  const tax = task('tax-review', '税务第一章rev', { progress: 20 });
  const economics = task('economics-review', '经济学基础L1', { plannedDate: today });
  const original = { ...stateFor([linear, tax, economics]), timeEntries: [{ id: 'time', taskId: linear.id, date: today, minutes: 20, mode: 'manual' }] };
  const before = JSON.stringify(original);
  const state = initializeCourseReviewPool(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(state.tasks, original.tasks);
  assert.equal(state.timeEntries, original.timeEntries);
  assert.equal(itemById(state, 'review:linear-algebra:2').progress, 45);
  assert.deepEqual(itemById(state, 'review:linear-algebra:2').sources, [{ kind: 'task', id: linear.id }]);
  assert.deepEqual(itemById(state, 'review:tax:1').sources, [{ kind: 'task', id: tax.id }]);
  assert.deepEqual(itemById(state, economicsId).sources, [{ kind: 'task', id: economics.id }]);
  const visible = withoutReviewPoolSources(state);
  assert.equal(visible.tasks.length, 0);
  assert.equal(visible.timeEntries, original.timeEntries);
  assert.deepEqual(upcomingDeadlines(visible.tasks, visible.milestones, today), []);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
});

test('formal homework and uncertain titles remain separate with their original requirements and dates', () => {
  const originals = [
    task('linear-homework', '线代作业week3', { due: '2026-10-25', plannedDate: today, requirements: '第2章习题' }),
    task('probability-homework', '概率论作业week4', { due: '2026-10-26' }),
    task('tax-homework', '税法作业2', { due: '2026-10-27' }),
    task('mixed', '税务第一章rev', { requirements: '复习后提交作业2' }),
    task('exam', '会计学基础L1复习', { requirements: 'quiz on Friday' }),
    task('extra', '经济学基础L1复习与整理报告'),
    task('ambiguous', '概率论第1章第2章复习'),
    task('completed-l1', '大数据分析L1复习', { done: true }),
    task('unspecific', '线代第二章'),
    task('ambiguous-content', '经济学基础L1看例题'),
  ];
  const state = initializeCourseReviewPool(stateFor(originals));
  const visible = withoutReviewPoolSources(state);
  assert.deepEqual(visible.tasks, originals.filter(item => item.id !== 'unspecific'));
  assert.equal(state.tasks, originals);
  assert.deepEqual(itemById(state, 'review:linear-algebra:2').sources, [{ kind: 'task', id: 'unspecific' }]);
});

test('course IDs support short chapter titles while automation records stay separate', () => {
  const original = stateFor([], [milestone('short', '第2章复习'), milestone('auto', '第1章复习', { automationKey: 'study:auto' })]);
  original.courses = [{ id: 'linear', title: '线性代数B', term: '', teacher: '', location: '', progress: 0, requirements: '', schedule: [], blocks: [] }];
  const state = initializeCourseReviewPool(original);
  assert.deepEqual(itemById(state, 'review:linear-algebra:2').sources, [{ kind: 'milestone', id: 'short' }]);
  assert.deepEqual(withoutReviewPoolSources(state).milestones.map(item => item.id), ['auto']);
});

test('combines multiple references under one chapter and preserves a completed economics selection', () => {
  const original = stateFor([
    task('tax1', '税务第一章rev', { progress: 15 }),
    task('tax2', '税收理论与实务第1章复习', { progress: 70 }),
    task('econ', '经济学基础L1复习', { done: true, completedDate: '2026-10-22', progress: 100 }),
  ], [milestone('tax-node', '税法第1章复习', { courseId: undefined, outcomeText: '我的成果', outcomeAttachments: [] })]);
  const state = initializeCourseReviewPool(original);
  const tax = itemById(state, 'review:tax:1');
  assert.equal(tax.progress, 70);
  assert.equal(tax.sources.length, 3);
  assert.equal(itemById(state, economicsId).done, true);
  assert.equal(itemById(state, economicsId).completedDate, '2026-10-22');
  assert.equal(itemById(state, economicsId).selectedDate, undefined);
  assert.equal(chooseReviewPoolItem(state, economicsId, today), state);
  assert.equal(state.milestones, original.milestones);
});

test('review completion and partial progress are retained without recreating independent tasks', () => {
  const initial = initializeCourseReviewPool(stateFor());
  const progress = updateReviewPoolItem(initial, economicsId, { progress: 55, note: '下次继续需求弹性' }, today);
  const completed = updateReviewPoolItem(progress, economicsId, { done: true }, today);
  assert.equal(itemById(completed, economicsId).progress, 100);
  assert.equal(reviewPoolItemVisibleOnDate(itemById(completed, economicsId), today), true);
  assert.equal(reviewPoolItemVisibleOnDate(itemById(completed, economicsId), tomorrow), false);
  assert.equal(itemById(completed, economicsId).previousProgress, 55);
  const restored = workspaceStateSchema.parse(JSON.parse(JSON.stringify(completed)));
  const undone = updateReviewPoolItem(restored, economicsId, { done: false }, tomorrow);
  assert.equal(itemById(undone, economicsId).progress, 55);
  assert.equal(itemById(undone, economicsId).previousProgress, undefined);
  assert.equal(itemById(undone, economicsId).completedDate, undefined);
  const sliderCompleted = updateReviewPoolItem(undone, economicsId, { progress: 100 }, tomorrow);
  assert.equal(itemById(sliderCompleted, economicsId).previousProgress, 55);
  const reopened = updateReviewPoolItem(completed, economicsId, { progress: 55 }, tomorrow);
  assert.equal(itemById(reopened, economicsId).completedDate, undefined);
  assert.equal(itemById(reopened, economicsId).note, '下次继续需求弹性');
  assert.equal(reviewPoolItemVisibleOnDate(itemById(reopened, economicsId), tomorrow), false);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(reopened))), reopened);
});

test('generated review stages are retained as sources while formal child assignments remain visible', () => {
  const parent = task('review-parent', '线代第二章rev', { mode: 'multi', plannedDate: today, due: tomorrow });
  const stage = task('stage:review', '线代第二章rev · 阶段推进', { parentId: parent.id, plannedDate: today, requirements: '做到例3', elapsed: 12 });
  const child = task('child-homework', '线代作业week3', { parentId: parent.id, due: tomorrow });
  const formalStage = task('stage:homework', '线代作业week3', { parentId: parent.id, plannedDate: today });
  const state = initializeCourseReviewPool(stateFor([parent, stage, child, formalStage]));
  assert.deepEqual(itemById(state, 'review:linear-algebra:2').sources, [{ kind: 'task', id: parent.id }, { kind: 'task', id: stage.id }]);
  assert.deepEqual(withoutReviewPoolSources(state).tasks, [child, formalStage]);
  const next = { ...state, tasks: state.tasks.map(item => item.id === stage.id ? { ...item, plannedDate: tomorrow } : item) };
  const staged = withPlannedTaskStages(next, today, () => assert.fail('must not create a review stage'), state);
  assert.equal(staged.tasks[0], parent);
  assert.equal(staged.tasks[1].requirements, '做到例3');
  assert.equal(staged.tasks[1].elapsed, 12);
  const noStage = initializeCourseReviewPool(stateFor([parent]));
  assert.equal(withPlannedTaskStages(noStage, today, () => assert.fail('must not generate a stage')), noStage);
});

test('strict schema rejects duplicate IDs/references, invalid dates and extra scheduling fields', () => {
  const state = initializeCourseReviewPool(stateFor([task('tax', '税务第一章rev')]));
  const index = state.reviewPool.items.findIndex(item => item.id === 'review:tax:1');
  const invalid = (patch) => ({ ...state, reviewPool: { ...state.reviewPool, items: state.reviewPool.items.map((item, i) => i === index ? { ...item, ...patch } : item) } });
  for (const patch of [
    { id: state.reviewPool.items[0].id },
    { selectedDate: '2026-02-30' },
    { completedDate: '2026-10-22' },
    { progress: 100, done: false },
    { sources: [{ kind: 'task', id: 'tax' }, { kind: 'task', id: 'tax' }] },
    { due: tomorrow },
    { plannedDate: today },
  ]) assert.equal(workspaceStateSchema.safeParse(invalid(patch)).success, false);
  assert.equal(workspaceStateSchema.safeParse(createEmptyWorkspaceState()).success, true);
  const collision = { ...state, reviewPool: { ...state.reviewPool, items: state.reviewPool.items.map((item, i) => i === 0 ? { ...item, sources: [{ kind: 'task', id: 'tax' }] } : item) } };
  assert.equal(workspaceStateSchema.safeParse(collision).success, false);
});

test('AI read projection hides review sources and their stages without changing stored or unknown legacy data', () => {
  const original = initializeCourseReviewPool(stateFor([
    task('review', '线代第二章rev'),
    task('stage:review', '阶段推进', { parentId: 'review' }),
    task('homework', '线代作业week3', { parentId: 'review', due: tomorrow }),
  ], [milestone('review-node', '税务第一章rev', { courseId: undefined })]));
  original.legacyCustomField = { note: '不能丢弃旧字段' };
  original.tasks.push(null, { oldField: '旧记录' });
  const before = JSON.stringify(original);
  const view = reviewPoolReadProjection(original);
  assert.deepEqual(view.tasks, original.tasks.slice(2));
  assert.deepEqual(view.milestones, []);
  assert.equal(view.reviewPool, original.reviewPool);
  assert.equal(view.legacyCustomField, original.legacyCustomField);
  assert.equal(JSON.stringify(original), before);
  for (const invalidPool of [null, { version: 1, items: [null] }, { version: 1, items: [{ ...original.reviewPool.items[0], sources: [{ kind: 'event', id: 'homework' }] }] }]) {
    const old = { ...original, reviewPool: invalidPool };
    assert.equal(reviewPoolReadProjection(old), old);
  }
  const legacy = { tasks: [{ legacy: true }], arbitrary: '保留' };
  assert.equal(reviewPoolReadProjection(legacy), legacy);
});

test('AI course context includes homework but no pool sources as upcoming milestones', () => {
  const original = stateFor([], [milestone('review', '第2章复习'), milestone('homework', '线代作业week3', { date: tomorrow })]);
  original.courses = [{ id: 'linear', title: '线性代数B', term: '', teacher: '', location: '', progress: 0, requirements: '', schedule: [], blocks: [] }];
  const state = initializeCourseReviewPool(original);
  const context = aiCourseContextFromWorkspace(state, 'linear');
  assert.equal(context.title, '线性代数B');
  assert.deepEqual(context.upcomingMilestones.map(item => item.title), ['线代作业week3']);
  assert.equal(state.milestones.length, 2);
  assert.equal(aiCourseContextFromWorkspace(null, 'linear'), null);
});
