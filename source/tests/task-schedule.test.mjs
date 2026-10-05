import test from 'node:test';
import assert from 'node:assert/strict';
import { courseNodeVisibleToday, planTaskForDate, taskDeadlineLabel, taskOverlapsRange, taskScheduledForDate, taskScheduleSummary, taskVisibleToday } from '../lib/task-progress.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';

const plannedTask = {
  id: 'paper', title: '完成论文', area: '课内', source: '课程',
  due: '2026-10-10', dueTime: '23:00', plannedDate: '2026-10-02',
  done: false, today: true, elapsed: 0, mode: 'single', status: '进行中', progress: 30,
  progressLogs: [{ id: 'log', date: '2026-10-02', progress: 30, status: '进行中', note: '完成提纲' }],
};

test('a short task can be worked on today and remain incomplete until its later deadline', () => {
  assert.equal(taskVisibleToday(plannedTask, '2026-10-02'), true);
  assert.equal(taskScheduledForDate(plannedTask, '2026-10-10'), true);
  assert.equal(taskScheduledForDate(plannedTask, '2026-10-03'), false);
  assert.equal(taskOverlapsRange(plannedTask, '2026-10-02', '2026-10-03'), true);
  assert.equal(taskDeadlineLabel(plannedTask), '2026-10-10 23:00');
  assert.equal(taskScheduleSummary(plannedTask, '2026-10-02'), '2026-10-02 计划推进 · 截止 2026-10-10 23:00');
  assert.equal(plannedTask.done, false);
});

test('a task without deadline can be planned for today, without reappearing every day', () => {
  const task = { ...plannedTask, due: undefined, dueTime: undefined, progressLogs: [] };
  assert.equal(taskVisibleToday(task, '2026-10-02'), true);
  assert.equal(taskVisibleToday(task, '2026-10-03'), false);
  assert.equal(taskScheduleSummary(task, '2026-10-02'), '2026-10-02 计划推进 · 未设截止');
});

test('deadline time and planned work date survive saved workspace validation', () => {
  const state = { ...createEmptyWorkspaceState(), tasks: [plannedTask] };
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
  const invalidTime = { ...state, tasks: [{ ...plannedTask, due: undefined }] };
  assert.equal(workspaceStateSchema.safeParse(invalidTime).success, false);
});

test('quick planning preserves the deadline, task content and partial progress', () => {
  const original = { ...plannedTask, requirements: '保留提纲', parentId: 'parent', today: false };
  const result = planTaskForDate(original, '2026-10-05');
  assert.deepEqual(result, { ...original, plannedDate: '2026-10-05' });
  assert.equal(original.plannedDate, '2026-10-02');
  assert.equal(taskVisibleToday(result, '2026-10-05'), true);
  assert.equal(taskVisibleToday(result, '2026-10-06'), false);
  assert.equal(taskScheduledForDate(result, original.due), true);
  assert.deepEqual(planTaskForDate(result, '2026-10-05'), result);
});

test('overdue tasks can be planned for today and saved without postponing their deadlines', () => {
  const task = planTaskForDate({ ...plannedTask, due: '2026-10-01', progressLogs: [] }, '2026-10-05');
  const saved = workspaceStateSchema.parse({ ...createEmptyWorkspaceState(), tasks: [task] }).tasks[0];
  assert.equal(saved.due, '2026-10-01');
  assert.equal(saved.dueTime, '23:00');
  assert.equal(saved.done, false);
  assert.equal(taskVisibleToday(saved, '2026-10-05'), true);
  assert.equal(taskOverlapsRange(saved, '2026-10-05', '2026-10-12'), true);
});

test('quick planning a task with no deadline creates only a planned work date', () => {
  const task = { ...plannedTask, due: undefined, dueTime: undefined, plannedDate: undefined, progressLogs: [] };
  const result = planTaskForDate(task, '2026-10-05');
  assert.equal(result.due, undefined);
  assert.equal(taskVisibleToday(result, '2026-10-05'), true);
  assert.equal(taskVisibleToday(result, '2026-10-06'), false);
});

test('explicitly planned long tasks appear today even outside their original date range', () => {
  const task = planTaskForDate({ ...plannedTask, mode: 'multi', startDate: '2026-10-08', progressLogs: [] }, '2026-10-05');
  assert.equal(task.startDate, '2026-10-08');
  assert.equal(taskVisibleToday(task, '2026-10-05'), true);
  assert.equal(taskScheduledForDate(task, '2026-10-05'), true);
  assert.equal(taskOverlapsRange(task, '2026-10-05', '2026-10-06'), true);
  assert.deepEqual(workspaceStateSchema.parse({ ...createEmptyWorkspaceState(), tasks: [task] }).tasks[0], task);
});

test('legacy course tasks retain their deadlines and attachments when their plan is saved', () => {
  const node = { id: 'course-paper', courseId: 'course', title: '结课论文', date: '2026-10-18', time: '12:00', location: '', requirements: '提交论文', attachments: [], area: '课内', done: false };
  const result = planTaskForDate(node, '2026-10-05');
  const saved = workspaceStateSchema.parse({ ...createEmptyWorkspaceState(), milestones: [result] }).milestones[0];
  assert.deepEqual(saved, { ...node, plannedDate: '2026-10-05' });
  assert.equal(courseNodeVisibleToday(saved, '2026-10-05'), true);
  assert.equal(courseNodeVisibleToday(saved, '2026-10-06'), false);
  assert.equal(courseNodeVisibleToday(saved, '2026-10-18'), true);
  assert.equal(courseNodeVisibleToday({ ...saved, done: true }, '2026-10-05'), true);
});

test('planning does not reopen completed tasks', () => {
  const done = { ...plannedTask, done: true, progress: 100 };
  assert.equal(planTaskForDate(done, '2026-10-05'), done);
  const completed = { ...plannedTask, status: '已完成' };
  assert.equal(planTaskForDate(completed, '2026-10-05'), completed);
});

test('task attachments survive save/export/restore alongside subject assignment', () => {
  const attachment = {
    id: 'paper-file', url: 'https://example.blob.vercel-storage.com/attachments/owner/task-paper/file.pdf',
    fileName: '作业要求.pdf', fileSize: 1200, mimeType: 'application/pdf', uploadedAt: '2026-10-02T10:00:00.000Z',
  };
  const task = { ...plannedTask, courseId: 'tax-course', attachments: [attachment] };
  const state = { ...createEmptyWorkspaceState(), tasks: [task] };
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))).tasks[0], task);
});
