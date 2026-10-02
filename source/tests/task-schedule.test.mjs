import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDeadlineLabel, taskOverlapsRange, taskScheduledForDate, taskScheduleSummary, taskVisibleToday } from '../lib/task-progress.ts';
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
  const invalidPlan = { ...state, tasks: [{ ...plannedTask, plannedDate: '2026-10-11' }] };
  const invalidTime = { ...state, tasks: [{ ...plannedTask, due: undefined }] };
  assert.equal(workspaceStateSchema.safeParse(invalidPlan).success, false);
  assert.equal(workspaceStateSchema.safeParse(invalidTime).success, false);
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
