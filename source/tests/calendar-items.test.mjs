import test from 'node:test';
import assert from 'node:assert/strict';
import { manualCalendarItems } from '../lib/calendar-items.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';

test('calendar excludes generated study history and derived stages, preserving manual tasks and events without altering records', () => {
  const data = {
    tasks: [
      { id: 'manual', title: '自学笔记整理', due: '2026-10-27', plannedDate: '2026-10-25', done: false },
      { id: 'stage:derived', parentId: 'manual', plannedDate: '2026-10-26' },
      { id: 'manual-child', parentId: 'manual', due: '2026-10-28' },
    ],
    milestones: [
      { id: 'event', date: '2026-10-26', time: '19:00', title: '音乐课' },
      { id: 'assignment', courseId: 'tax', date: '2026-10-27', time: '', title: '税法作业2' },
      ...['before', 'during', 'after', 'review'].map((stage) => ({ id: stage, automationKey: `study:2026-10-26:${stage}:tax:2026-10-26`, date: '2026-10-26', time: '20:00', done: true, requirements: '已有个人备注' })),
    ],
  };
  const before = structuredClone(data);
  const entries = manualCalendarItems(data);
  assert.deepEqual(entries.map(({ kind, item }) => `${kind}:${item.id}`), ['milestone:event', 'milestone:assignment', 'task:manual', 'task:manual-child']);
  assert.equal(entries.find(({ item }) => item.id === 'manual').date, '2026-10-27');
  assert.deepEqual(data, before);
});

test('manual calendar tasks use deadline time, explicit planning only without a deadline, and no invented dates', () => {
  const tasks = [
    { id: 'due', due: '2026-11-01', dueTime: '16:00', plannedDate: '2026-10-30' },
    { id: 'planned', plannedDate: '2026-10-29', dueTime: '12:00' },
    { id: 'undated', today: true, mode: 'multi' },
    { id: 'generated', automationKey: 'future-rule', due: '2026-11-01' },
    { id: 'done', due: '2026-10-24', done: true },
  ];
  assert.deepEqual(manualCalendarItems({ tasks, milestones: [] }).map(({ item, date, time }) => ({ id: item.id, date, time })), [
    { id: 'due', date: '2026-11-01', time: '16:00' },
    { id: 'planned', date: '2026-10-29', time: '' },
    { id: 'done', date: '2026-10-24', time: '' },
  ]);
});

test('calendar visibility is explicit per record, preserves legacy entries, and never admits generated work or undated items', () => {
  const data = {
    tasks: [
      { id: 'daily', due: '2026-10-30', plannedDate: '2026-10-29', showOnCalendar: false, done: false, requirements: '保留日常学习要求' },
      { id: 'weekly-homework', due: '2026-10-31', showOnCalendar: true, done: true },
      { id: 'legacy-task', due: '2026-11-01' },
      { id: 'chosen-plan', plannedDate: '2026-10-29', showOnCalendar: true },
      { id: 'stage:chosen', plannedDate: '2026-10-29', showOnCalendar: true },
      { id: 'undated', showOnCalendar: true },
    ],
    milestones: [
      { id: 'hidden-course-task', courseId: 'math', date: '2026-10-29', time: '20:00', showOnCalendar: false },
      { id: 'hidden-event', date: '2026-10-29', time: '', showOnCalendar: false },
      { id: 'legacy-exam', date: '2026-11-02', time: '10:00', assessmentType: 'exam' },
      { id: 'chosen-study', date: '2026-10-29', time: '20:00', automationKey: 'study:current', showOnCalendar: true },
      { id: 'stage:node', date: '2026-10-29', time: '20:00', showOnCalendar: true },
      { id: 'pending-date', date: '', time: '', showOnCalendar: true },
    ],
  };
  const before = structuredClone(data);
  const entries = manualCalendarItems(data);
  assert.deepEqual(entries.map(({ item }) => item.id), ['legacy-exam', 'weekly-homework', 'legacy-task', 'chosen-plan']);
  assert.equal(entries.find(({ item }) => item.id === 'weekly-homework').date, '2026-10-31');
  assert.deepEqual(data, before);
  data.tasks[0].showOnCalendar = true;
  assert.equal(manualCalendarItems(data).find(({ item }) => item.id === 'daily').date, '2026-10-30');
  assert.equal(data.tasks[0].plannedDate, '2026-10-29');
});

test('all assessment deadlines share one calendar category, distinct from ordinary plans and events', () => {
  const data = {
    tasks: [{ id: 'homework', due: '2026-10-31' }, { id: 'plan', plannedDate: '2026-10-29' }],
    milestones: [
      ...['exam', 'quiz', 'submission', 'presentation'].map((assessmentType) => ({ id: assessmentType, assessmentType, date: '2026-10-31', time: '18:00' })),
      { id: 'course-task', courseId: 'math', date: '2026-10-31', time: '18:00' },
      { id: 'deadline', eventDateKind: 'deadline', date: '2026-10-31', time: '' },
      { id: 'appointment', eventDateKind: 'occurs', date: '2026-10-31', time: '19:00' },
    ],
  };
  const categories = Object.fromEntries(manualCalendarItems(data).map(({ item, category }) => [item.id, category]));
  assert.deepEqual(categories, {
    exam: 'deadline', quiz: 'deadline', submission: 'deadline', presentation: 'deadline',
    'course-task': 'deadline', deadline: 'deadline', appointment: 'event', homework: 'deadline', plan: 'task',
  });
});

test('calendar preferences survive strict save and export readback without changing record identity or legacy data', () => {
  const state = createEmptyWorkspaceState();
  for (const [index, showOnCalendar] of [false, true, undefined].entries()) {
    const preference = showOnCalendar === undefined ? {} : { showOnCalendar };
    state.tasks.push({ id: `task-${index}`, title: '每周数学作业', area: '课内', source: '数学', due: '2026-10-31', plannedDate: '2026-10-29', done: false, today: true, elapsed: 30, requirements: '原要求', ...preference });
    state.milestones.push({ id: `event-${index}`, title: '考核节点', area: '课内', date: '2026-11-02', time: '18:00', location: '', requirements: '原备注', done: true, assessmentType: 'quiz', ...preference });
  }
  const reloaded = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded, state);
  assert.deepEqual(manualCalendarItems(reloaded).map(({ item }) => item.id), ['event-1', 'event-2', 'task-1', 'task-2']);
  for (const collection of ['tasks', 'milestones']) {
    for (const invalid of ['false', 0, null]) {
      const wrong = structuredClone(state);
      wrong[collection][0].showOnCalendar = invalid;
      assert.equal(workspaceStateSchema.safeParse(wrong).success, false);
    }
  }
});
