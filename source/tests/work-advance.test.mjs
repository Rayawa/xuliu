import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWorkForDate, cancelWorkForDate, courseNodeVisibleToday, nextWorkDate, taskVisibleToday, withWorkCompletionDates, workProgressedOn } from '../lib/task-progress.ts';
import { studyTaskVisibleOnDate } from '../lib/study-task-automation.ts';
import { withPlannedTaskStages } from '../lib/task-stages.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';

const today = '2026-10-29';
const task = { id: 'homework', title: '数学作业', area: '课内', source: '数学', due: '2026-10-31', dueTime: '23:59', plannedDate: today, done: false, today: true, elapsed: 35, progress: 40, status: '进行中', requirements: '保留要求', attachments: [], blocks: [], progressLogs: [{ id: 'log', date: today, progress: 40, status: '进行中', note: '完成第一部分' }] };
const node = { id: 'course-task', courseId: 'math', title: '数学作业', date: task.due, time: task.dueTime, plannedDate: today, done: false, area: '课内', location: '', requirements: '保留原内容' };

test('advancing keeps one unfinished task, its deadline, content and logs, and defaults to tomorrow', () => {
  const result = advanceWorkForDate(task, today);
  assert.deepEqual(result, { ...task, plannedDate: '2026-10-30', progressedDates: [today] });
  assert.equal(result.blocks, task.blocks);
  assert.equal(result.attachments, task.attachments);
  assert.equal(result.progressLogs, task.progressLogs);
  assert.equal(task.progressedDates, undefined);
  assert.equal(taskVisibleToday(result, today), true);
  assert.equal(taskVisibleToday(result, '2026-10-30'), true);
  assert.equal(workProgressedOn(result, today), true);
  assert.equal(workProgressedOn(result, '2026-10-30'), false);
  const repeat = advanceWorkForDate(result, today, '2026-11-02');
  assert.deepEqual(repeat.progressedDates, [today]);
  const nextDay = advanceWorkForDate(repeat, '2026-11-02');
  assert.deepEqual(nextDay.progressedDates, [today, '2026-11-02']);
  assert.equal(nextDay.plannedDate, '2026-11-03');
});

test('later continuation suppresses intervening days for ordinary, long, course and automatic tasks', () => {
  for (const original of [task, { ...task, mode: 'multi', startDate: today }]) {
    const continued = advanceWorkForDate(original, today, '2026-11-02');
    assert.equal(taskVisibleToday(continued, today), true);
    assert.equal(taskVisibleToday(continued, '2026-10-30'), false);
    assert.equal(taskVisibleToday(continued, '2026-10-31'), false);
    assert.equal(taskVisibleToday(continued, '2026-11-02'), true);
  }
  for (const original of [node, { ...node, mode: 'multi' }, { ...node, automationKey: 'study:2026-10-29:review:math' }, { ...node, automationKey: 'study:2026-10-29:daily:math' }, { ...node, courseId: undefined, alsoTask: true }]) {
    const continued = advanceWorkForDate(original, today, '2026-11-02');
    for (const visible of [courseNodeVisibleToday, studyTaskVisibleOnDate]) {
      assert.equal(visible(continued, today), true);
      assert.equal(visible(continued, '2026-10-30'), false);
      assert.equal(visible(continued, '2026-10-31'), false);
      assert.equal(visible(continued, '2026-11-02'), true);
    }
  }
});

test('completion and cancellation stay independent from daily progress and completed work cannot advance', () => {
  const continued = advanceWorkForDate({ ...task, dismissedTodayDate: today }, today);
  assert.equal(continued.dismissedTodayDate, undefined);
  const cancelled = cancelWorkForDate(continued, today);
  assert.equal(taskVisibleToday(cancelled, today), false);
  assert.deepEqual(cancelled.progressedDates, [today]);
  const previous = { tasks: [continued], milestones: [] };
  const finished = withWorkCompletionDates(previous, { ...previous, tasks: [{ ...continued, done: true }] }, today).tasks[0];
  assert.equal(finished.completedDate, today);
  assert.equal(advanceWorkForDate(finished, today), finished);
  assert.equal(taskVisibleToday(finished, '2026-10-30'), false);
  const reopened = withWorkCompletionDates({ tasks: [finished], milestones: [] }, previous, today).tasks[0];
  assert.deepEqual(reopened, continued);
});

test('continuation validates dates and computes tomorrow across month, year and leap-day boundaries', () => {
  assert.equal(nextWorkDate('2026-12-31'), '2027-01-01');
  assert.equal(nextWorkDate('2028-02-28'), '2028-02-29');
  assert.equal(nextWorkDate('2026-10-31'), '2026-11-01');
  for (const date of [today, '2026-10-28', '2026-02-30', '', 'bad-date']) assert.equal(advanceWorkForDate(task, today, date), task);
  assert.equal(advanceWorkForDate(task, 'bad-date'), task);
});

test('continuing a long task creates no subtasks and preserves existing child records', () => {
  const original = { ...createEmptyWorkspaceState(), tasks: [{ ...task, mode: 'multi' }], milestones: [{ ...node, mode: 'multi' }] };
  const next = { ...original, tasks: original.tasks.map((item) => advanceWorkForDate(item, today)), milestones: original.milestones.map((item) => advanceWorkForDate(item, today)) };
  const createId = () => { throw new Error('Continuation must not create a stage'); };
  assert.deepEqual(withPlannedTaskStages(next, '2026-10-30', createId, original), next);
  const stage = { ...task, id: 'stage:existing', parentId: task.id, due: undefined, dueTime: undefined, progressLogs: [] };
  const before = { ...original, tasks: [...original.tasks, stage] };
  const after = { ...next, tasks: [...next.tasks, stage] };
  assert.equal(withPlannedTaskStages(after, today, createId, before).tasks[1], stage);
});

test('daily progress survives strict save and export validation for all task kinds', () => {
  const state = { ...createEmptyWorkspaceState(), tasks: [advanceWorkForDate(task, today)], milestones: [advanceWorkForDate(node, today)] };
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
  for (const bad of [['2026-02-30'], [true], '2026-10-29', null]) {
    assert.equal(workspaceStateSchema.safeParse({ ...state, tasks: [{ ...state.tasks[0], progressedDates: bad }] }).success, false);
    assert.equal(workspaceStateSchema.safeParse({ ...state, milestones: [{ ...state.milestones[0], progressedDates: bad }] }).success, false);
  }
});
