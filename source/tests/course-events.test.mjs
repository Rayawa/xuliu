import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentTypeLabel, eventCourseLabel, eventDateLabel, migrateCourseEvents } from '../lib/course-events.ts';
import { createEmptyWorkspaceState, workspaceStateSchema } from '../lib/workspace-state-schema.ts';
import { aiCourseContextFromWorkspace } from '../lib/ai-course-context.ts';

const course = (id, title) => ({ id, title, term: '', teacher: '', location: '', progress: 0, requirements: '', schedule: [], blocks: [] });
const event = (id, title, patch = {}) => ({ id, title, date: '2026-10-26', time: '00:00', location: '', requirements: '', area: '课内', done: false, ...patch });
const stateFor = (milestones, courses = [course('probability', '概率论与数理统计')]) => ({ ...createEmptyWorkspaceState(), milestones, courses });

test('legacy events and course tasks retain existing midnight times and all old fields on schema roundtrip', () => {
  const state = stateFor([
    event('meeting', '小组见面', { plannedDate: '2026-10-23', requirements: '带笔记', done: true }),
    event('task', '概率论作业week4', { courseId: 'probability', mode: 'single' }),
  ]);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(state))), state);
  assert.equal(eventDateLabel(state.milestones[0]), '2026-10-26 00:00');
});

test('ordinary events accept unknown dates and date-only timing without inventing midnight or a deadline', () => {
  const state = stateFor([
    event('unknown', '课程安排待定', { date: '', time: '', linkedCourseId: 'probability', eventDateKind: 'occurs' }),
    event('date-only', '课程考试', { time: '', linkedCourseId: 'probability', assessmentType: 'exam', eventDateKind: 'occurs' }),
    event('deadline', '材料提交', { time: '', eventDateKind: 'deadline', plannedDate: '2026-10-23' }),
  ]);
  const parsed = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(parsed, state);
  assert.equal(eventDateLabel(parsed.milestones[0]), '待定');
  assert.equal(eventDateLabel(parsed.milestones[1]), '发生 2026-10-26');
  assert.equal(eventDateLabel(parsed.milestones[2]), '截止 2026-10-26');
  assert.equal(parsed.milestones[2].plannedDate, '2026-10-23');
  assert.equal(parsed.milestones[2].time, '');
});

test('course tasks still require valid dates and times; mixed associations and invalid values are rejected', () => {
  for (const patch of [
    { courseId: 'probability', date: '' },
    { courseId: 'probability', time: '' },
    { courseId: 'probability', linkedCourseId: 'probability' },
    { courseId: 'probability', assessmentType: 'exam' },
    { courseId: 'probability', eventDateKind: 'deadline' },
    { date: '', time: '12:30' },
    { date: '2026-02-30' },
    { time: '25:00' },
    { plannedDate: '2026-02-30' },
    { assessmentType: 'invented' },
    { eventDateKind: 'today' },
  ]) assert.equal(workspaceStateSchema.safeParse(stateFor([event('invalid', '待核对', patch)])).success, false);
});

test('migration adds only an unambiguous complete course-name link and preserves source records', () => {
  const attachment = { id: 'file', url: 'https://example.com/material.pdf', fileName: '材料.pdf', fileSize: 100, mimeType: 'application/pdf', uploadedAt: '2026-10-22T10:00:00Z' };
  const original = stateFor([
    event('exam', '概率论与数理统计 期中考试', { requirements: '原始备注', attachments: [attachment], outcomeText: '保留已有成果', blocks: [{ id: 'note', type: 'text', text: '原始正文' }], elapsed: 18, done: true, completedDate: '2026-10-22', plannedDate: '2026-10-23' }),
    event('short', '概率论期中考试'),
    event('course-task', '概率论与数理统计作业', { courseId: 'probability' }),
    event('linked', '概率论与数理统计考核', { linkedCourseId: 'accounting' }),
    event('ambiguous', '概率论与数理统计和会计学基础（全英文）考试安排'),
    event('accounting', '会计学基础 ( 全英文 ) 报告', { date: '', time: '' }),
  ], [course('probability', '概率论与数理统计'), course('accounting', '会计学基础（全英文）')]);
  const before = JSON.stringify(original);
  const migrated = migrateCourseEvents(original);
  assert.deepEqual(migrated.milestones[0], { ...original.milestones[0], linkedCourseId: 'probability' });
  assert.equal(migrated.milestones[0].attachments, original.milestones[0].attachments);
  assert.equal(migrated.milestones[0].blocks, original.milestones[0].blocks);
  assert.equal(migrated.milestones[0].assessmentType, undefined);
  assert.equal(migrated.milestones[0].eventDateKind, undefined);
  for (const index of [1, 2, 3, 4]) assert.equal(migrated.milestones[index], original.milestones[index]);
  assert.equal(migrated.milestones[5].linkedCourseId, 'accounting');
  assert.equal(migrated.milestones[5].date, '');
  assert.equal(migrated.courses, original.courses);
  assert.equal(JSON.stringify(original), before);
  assert.equal(migrateCourseEvents(migrated), migrated);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(migrated))), migrated);
});

test('duplicate course names and absent names do not create guessed links', () => {
  const original = stateFor([event('ambiguous', '概率论与数理统计期末考试'), event('plain', '考试')], [course('p1', '概率论与数理统计'), course('p2', '概率论与数理统计'), course('empty', '')]);
  assert.equal(migrateCourseEvents(original), original);
});

test('explicitly cleared or reviewed course associations stay unchanged after migration and reload', () => {
  const state = stateFor([event('unlinked', '概率论与数理统计考试', { courseLinkReviewed: true })]);
  assert.equal(migrateCourseEvents(state), state);
  const reloaded = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(migrateCourseEvents(reloaded), reloaded);
  assert.equal(reloaded.milestones[0].linkedCourseId, undefined);
});

test('linked event identity survives course renaming while labels always use the live course title', () => {
  const node = event('exam', '期中考试', { linkedCourseId: 'probability', assessmentType: 'quiz', eventDateKind: 'occurs', time: '10:30' });
  assert.equal(eventCourseLabel(node, [course('probability', '概率论与数理统计')]), '课内学习 / 概率论与数理统计');
  assert.equal(eventCourseLabel(node, [course('probability', '概率统计')]), '课内学习 / 概率统计');
  assert.equal(node.linkedCourseId, 'probability');
  assert.equal(assessmentTypeLabel(node.assessmentType), '测验');
  assert.equal(eventDateLabel(node), '发生 2026-10-26 10:30');
  assert.equal(eventCourseLabel(event('plain', '普通事项'), []), '');
  assert.equal(assessmentTypeLabel(undefined), '');
  const removedCourseState = stateFor([node], []);
  assert.deepEqual(workspaceStateSchema.parse(removedCourseState).milestones[0], node);
  assert.equal(eventCourseLabel(node, []), '课内学习 / 课程已移除');
});

test('course read context keeps linked assessments distinct from homework and preserves unknown times', () => {
  const state = stateFor([
    event('exam', '期中考试', { linkedCourseId: 'probability', eventDateKind: 'occurs', time: '' }),
    event('homework', '正式作业', { courseId: 'probability' }),
    event('other', '其他课程考核', { linkedCourseId: 'accounting' }),
  ]);
  const context = aiCourseContextFromWorkspace(state, 'probability');
  assert.equal(context.upcomingMilestones.length, 2);
  assert.equal(context.upcomingMilestones.find(item => item.title === '期中考试').kind, 'event');
  assert.equal(context.upcomingMilestones.find(item => item.title === '期中考试').eventDateKind, 'occurs');
  assert.equal(context.upcomingMilestones.find(item => item.title === '期中考试').time, '');
  assert.equal(context.upcomingMilestones.find(item => item.title === '正式作业').kind, 'task');
});
