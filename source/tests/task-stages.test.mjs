import test from 'node:test';
import assert from 'node:assert/strict';
import { withPlannedTaskStages } from '../lib/task-stages.ts';
import { planTaskForDate, taskVisibleToday } from '../lib/task-progress.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';

const today = '2026-10-12';
const tomorrow = '2026-10-13';
const parent = {
  id: 'paper', title: '完成论文', area: '课内', source: '课程',
  due: '2026-10-20', dueTime: '23:00', startDate: '2026-10-15', plannedDate: today,
  mode: 'multi', done: false, today: false, elapsed: 45, status: '进行中', progress: 30,
  requirements: '保留提纲和附件', attachments: [], blocks: [],
  progressLogs: [{ id: 'log', date: '2026-10-11', progress: 30, status: '进行中', note: '完成提纲' }],
};
const stateFor = (tasks = [parent], milestones = []) => ({ ...createEmptyWorkspaceState(), tasks, milestones });
let id = 0;
const createId = () => String(++id);

test('planning a long task creates a linked short stage without changing the parent or its deadline', () => {
  const original = stateFor();
  const result = withPlannedTaskStages(original, today, createId);
  const stage = result.tasks[1];
  assert.equal(result.tasks[0], parent);
  assert.equal(original.tasks.length, 1);
  assert.equal(stage.parentId, parent.id);
  assert.equal(stage.mode, 'single');
  assert.equal(stage.plannedDate, today);
  assert.equal(stage.due, undefined);
  assert.equal(taskVisibleToday(stage, today), true);
  assert.equal(taskVisibleToday(stage, tomorrow), false);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result))), result);
});

test('repeating the plan or loading it again retains exactly one stage and its edited content', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const edited = { ...first, tasks: first.tasks.map((task) => task.parentId ? { ...task, title: '整理第一章', requirements: '自己的阶段内容', progress: 40, elapsed: 20 } : task) };
  assert.equal(withPlannedTaskStages(edited, today, createId), edited);
  const replanned = { ...edited, tasks: edited.tasks.map((task) => task.id === parent.id ? planTaskForDate(task, today) : task) };
  assert.equal(withPlannedTaskStages(replanned, today, createId, edited).tasks.length, 2);
  assert.deepEqual(replanned.tasks[1], edited.tasks[1]);
});

test('completing a stage does not complete or change the long task and does not recreate the stage', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const completed = { ...first, tasks: first.tasks.map((task) => task.parentId ? { ...task, done: true, status: '已完成', progress: 100 } : task) };
  const result = withPlannedTaskStages(completed, today, createId, first);
  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.tasks[0], parent);
  assert.equal(result.tasks[1].done, true);
  assert.equal(result.tasks[0].progress, 30);
});

test('an existing short branch scheduled today serves as the stage without an extra generic reminder', () => {
  for (const schedule of [{ plannedDate: today }, { due: today }]) {
    const branch = { id: 'draft', title: '完成初稿', parentId: parent.id, area: parent.area, source: parent.title, done: false, today: false, elapsed: 0, ...schedule };
    const original = stateFor([parent, branch]);
    assert.equal(withPlannedTaskStages(original, today, createId), original);
  }
});

test('long course tasks create short stages linked to the course node and retain course grouping', () => {
  const node = { id: 'course-paper', courseId: 'course', title: '结课论文', mode: 'multi', date: '2026-10-20', time: '18:00', plannedDate: today, location: '', requirements: '论文要求', attachments: [], area: '课内', done: false };
  const original = stateFor([], [node]);
  const result = withPlannedTaskStages(original, today, createId);
  assert.equal(result.milestones[0], node);
  assert.equal(result.tasks[0].parentMilestoneId, node.id);
  assert.equal(result.tasks[0].courseId, node.courseId);
  assert.equal(result.tasks[0].due, undefined);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(result))), result);
});

test('unplanned, future, completed and short tasks do not get additional stages', () => {
  for (const task of [
    { ...parent, plannedDate: undefined }, { ...parent, plannedDate: tomorrow },
    { ...parent, done: true }, { ...parent, status: '已完成' }, { ...parent, mode: 'single' },
  ]) {
    const original = stateFor([task]);
    assert.equal(withPlannedTaskStages(original, today, createId), original);
  }
  const event = { id: 'event', title: '事项', mode: 'multi', date: tomorrow, time: '12:00', plannedDate: today, location: '', requirements: '', area: '生活', done: false };
  const original = stateFor([], [event]);
  assert.equal(withPlannedTaskStages(original, today, createId), original);
});

test('postponing a stage moves only the parent work plan and preserves its deadline and progress', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const postponed = { ...first, tasks: first.tasks.map((task) => task.parentId ? { ...task, plannedDate: tomorrow, today: false } : task) };
  const result = withPlannedTaskStages(postponed, today, createId, first);
  assert.deepEqual(result.tasks[0], { ...parent, plannedDate: tomorrow });
  assert.equal(result.tasks.length, 2);
  assert.equal(taskVisibleToday(result.tasks[1], today), false);
  assert.equal(withPlannedTaskStages(result, tomorrow, createId).tasks.length, 2);
});

test('changing or clearing the parent work plan reschedules the pending stage while retaining its records', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  for (const plannedDate of [tomorrow, undefined]) {
    const changed = { ...first, tasks: first.tasks.map((task) => task.id === parent.id ? { ...task, plannedDate } : task) };
    const result = withPlannedTaskStages(changed, today, createId, first);
    assert.deepEqual(result.tasks[1], { ...first.tasks[1], plannedDate, today: false });
    assert.equal(taskVisibleToday(result.tasks[1], today), false);
    assert.equal(result.tasks[0].due, parent.due);
  }
});

test('deleting a generated stage clears the matching parent plan so it does not return on reload', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const removed = { ...first, tasks: [first.tasks[0]] };
  const result = withPlannedTaskStages(removed, today, createId, first);
  assert.deepEqual(result.tasks, [{ ...parent, plannedDate: undefined }]);
  assert.equal(withPlannedTaskStages(result, today, createId), result);
});

test('planning another day keeps the completed previous stage as history and creates one new stage', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const completed = { ...first, tasks: first.tasks.map((task) => task.parentId ? { ...task, done: true, status: '已完成', progress: 100 } : task) };
  const replanned = { ...completed, tasks: completed.tasks.map((task) => task.id === parent.id ? planTaskForDate(task, tomorrow) : task) };
  const result = withPlannedTaskStages(replanned, tomorrow, createId, completed);
  assert.equal(result.tasks.length, 3);
  assert.equal(result.tasks[1], completed.tasks[1]);
  assert.equal(result.tasks[2].plannedDate, tomorrow);
  assert.equal(result.tasks[2].parentId, parent.id);
  assert.equal(result.tasks[0].due, parent.due);
});

test('deleting a completed generated stage also cancels the parent plan without recreating an unfinished reminder', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const completed = { ...first, tasks: first.tasks.map((task) => task.parentId ? { ...task, done: true, status: '已完成', progress: 100 } : task) };
  const removed = { ...completed, tasks: [completed.tasks[0]] };
  const result = withPlannedTaskStages(removed, today, createId, completed);
  assert.deepEqual(result.tasks, [{ ...parent, plannedDate: undefined }]);
  assert.equal(withPlannedTaskStages(result, today, createId), result);
});

test('cancelling and replanning reuses the unfinished stage and preserves its personal records', () => {
  const first = withPlannedTaskStages(stateFor(), today, createId);
  const edited = { ...first, tasks: first.tasks.map((task) => task.parentId ? { ...task, title: '整理第一章', progress: 40, requirements: '保留自己的内容', elapsed: 20 } : task) };
  const cleared = { ...edited, tasks: edited.tasks.map((task) => task.id === parent.id ? { ...task, plannedDate: undefined } : task) };
  const cancelled = withPlannedTaskStages(cleared, today, createId, edited);
  const replanned = { ...cancelled, tasks: cancelled.tasks.map((task) => task.id === parent.id ? planTaskForDate(task, today) : task) };
  const result = withPlannedTaskStages(replanned, today, createId, cancelled);
  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.tasks[1], edited.tasks[1]);
});

test('postponing or deleting a course stage keeps the course deadline and completion state independent', () => {
  const node = { id: 'course-paper', courseId: 'course', title: '结课论文', mode: 'multi', date: '2026-10-20', time: '18:00', plannedDate: today, location: '', requirements: '论文要求', area: '课内', done: false };
  const first = withPlannedTaskStages(stateFor([], [node]), today, createId);
  const postponed = { ...first, tasks: first.tasks.map((task) => ({ ...task, plannedDate: tomorrow, today: false })) };
  const moved = withPlannedTaskStages(postponed, today, createId, first);
  assert.deepEqual(moved.milestones[0], { ...node, plannedDate: tomorrow });
  assert.equal(withPlannedTaskStages(moved, tomorrow, createId).tasks.length, 1);
  const removed = withPlannedTaskStages({ ...first, tasks: [] }, today, createId, first);
  assert.deepEqual(removed.milestones[0], { ...node, plannedDate: undefined });
  assert.equal(withPlannedTaskStages(removed, today, createId).tasks.length, 0);
});
