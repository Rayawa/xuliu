import test from 'node:test';
import assert from 'node:assert/strict';
import { manualCalendarItems } from '../lib/calendar-items.ts';

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
