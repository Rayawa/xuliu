import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelWorkForDate, courseNodeVisibleToday, defaultTaskPlannedDate, planTaskForDate, taskDeadlineLabel, taskOverlapsRange, taskScheduledForDate, taskScheduleSummary, taskVisibleToday, withWorkCompletionDates } from '../lib/task-progress.ts';
import { studyTaskVisibleOnDate } from '../lib/study-task-automation.ts';
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
  assert.equal(courseNodeVisibleToday({ ...saved, done: true, completedDate: '2026-10-05' }, '2026-10-05'), true);
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

test('early completion stays on its completion day and does not reappear on the deadline', () => {
  for (const mode of ['single', 'multi']) {
    const task = { ...plannedTask, mode, done: true, status: '已完成', progress: 100, completedDate: '2026-10-02' };
    assert.equal(taskVisibleToday(task, '2026-10-02'), true);
    assert.equal(taskVisibleToday(task, '2026-10-10'), false);
    assert.equal(taskVisibleToday({ ...task, plannedDate: task.due }, task.due), false);
    assert.equal(taskVisibleToday({ ...task, completedDate: task.due }, task.due), true);
    assert.equal(taskVisibleToday({ ...task, done: false, status: '进行中' }, task.due), true);
  }
});

test('legacy completion logs are used without treating a deadline or old plan as completion', () => {
  const task = { ...plannedTask, done: true, status: '已完成', progress: 100, progressLogs: [
    { date: '2026-10-02', progress: 100 },
    { date: '2026-10-03', progress: 30 },
    { date: '2026-10-04', progress: 100 },
  ] };
  assert.equal(taskVisibleToday(task, '2026-10-04'), true);
  assert.equal(taskVisibleToday(task, '2026-10-02'), false);
  assert.equal(taskVisibleToday(task, task.due), false);
  assert.equal(taskVisibleToday({ ...task, progressLogs: [] }, task.due), false);
  assert.equal(taskVisibleToday({ ...task, progressLogs: [] }, task.plannedDate), false);
});

test('manual and automatic course tasks use completion day while calendar items keep their schedule', () => {
  const node = { id: 'course-paper', courseId: 'course', title: '结课论文', date: '2026-10-10', time: '00:00', location: '', requirements: '保留要求', plannedDate: '2026-10-10', area: '课内', done: true, completedDate: '2026-10-02' };
  for (const mode of ['single', 'multi']) {
    assert.equal(courseNodeVisibleToday({ ...node, mode }, '2026-10-02'), true);
    assert.equal(courseNodeVisibleToday({ ...node, mode }, node.date), false);
    assert.equal(courseNodeVisibleToday({ ...node, mode, completedDate: node.date }, node.date), true);
    assert.equal(courseNodeVisibleToday({ ...node, mode, done: false }, node.date), true);
  }
  const automatic = { ...node, automationKey: 'study:2026-10-02:review:course:2026-10-02' };
  assert.equal(studyTaskVisibleOnDate(automatic, '2026-10-02'), true);
  assert.equal(studyTaskVisibleOnDate(automatic, node.date), false);
  assert.equal(courseNodeVisibleToday({ ...node, completedDate: undefined }, node.date), false);
  assert.equal(courseNodeVisibleToday({ ...node, courseId: undefined }, node.date), true);
});

test('completion tracking covers state changes, reopening and recompletion without changing task content', () => {
  const node = { id: 'course-paper', courseId: 'course', title: '论文', date: '2026-10-10', time: '00:00', location: '', requirements: '保留要求', area: '课内', done: false, attachments: [], outcomeText: '保留成果' };
  const before = { ...createEmptyWorkspaceState(), tasks: [plannedTask], milestones: [node] };
  const completed = withWorkCompletionDates(before, { ...before, tasks: [{ ...plannedTask, done: true, status: '已完成', progress: 100 }], milestones: [{ ...node, done: true }] }, '2026-10-02');
  assert.deepEqual(completed.tasks[0], { ...plannedTask, done: true, status: '已完成', progress: 100, completedDate: '2026-10-02' });
  assert.deepEqual(completed.milestones[0], { ...node, done: true, completedDate: '2026-10-02' });
  assert.equal(before.tasks[0].completedDate, undefined);
  assert.deepEqual(workspaceStateSchema.parse(JSON.parse(JSON.stringify(completed))), completed);
  assert.deepEqual(withWorkCompletionDates(completed, completed, '2026-10-03'), completed);

  const reopened = withWorkCompletionDates(completed, { ...completed, tasks: [{ ...completed.tasks[0], done: false, status: '进行中', progress: 30 }], milestones: [{ ...completed.milestones[0], done: false }] }, '2026-10-03');
  assert.equal(Object.hasOwn(reopened.tasks[0], 'completedDate'), false);
  assert.equal(Object.hasOwn(reopened.milestones[0], 'completedDate'), false);
  assert.equal(taskVisibleToday(reopened.tasks[0], plannedTask.due), true);
  const recompleted = withWorkCompletionDates(reopened, { ...reopened, tasks: [{ ...reopened.tasks[0], status: '已完成' }], milestones: [{ ...reopened.milestones[0], done: true }] }, '2026-10-04');
  assert.equal(recompleted.tasks[0].completedDate, '2026-10-04');
  assert.equal(recompleted.milestones[0].completedDate, '2026-10-04');
});

test('importing completed history does not invent a new completion date', () => {
  const previous = createEmptyWorkspaceState();
  const next = { ...previous, tasks: [{ ...plannedTask, done: true, status: '已完成' }] };
  assert.deepEqual(withWorkCompletionDates(previous, next, '2026-10-10'), next);
  for (const completedDate of ['2026-02-30', 'not-a-date']) {
    assert.equal(workspaceStateSchema.safeParse({ ...next, tasks: [{ ...next.tasks[0], completedDate }] }).success, false);
  }
});

test('manual short tasks default to two calendar days before their deadline across month and year boundaries', () => {
  for (const [due, plannedDate] of [
    ['2026-10-25', '2026-10-23'], ['2026-11-01', '2026-10-30'],
    ['2027-01-01', '2026-12-30'], ['2028-03-01', '2028-02-28'],
    ['2028-03-02', '2028-02-29'], ['2027-03-01', '2027-02-27'],
  ]) {
    const task = { ...plannedTask, due, plannedDate: undefined, progressLogs: [] };
    assert.equal(defaultTaskPlannedDate(task), plannedDate);
    assert.equal(taskVisibleToday(task, plannedDate), true);
    assert.equal(taskScheduledForDate(task, due), true);
    assert.equal(taskOverlapsRange(task, plannedDate, plannedDate), true);
    assert.equal(task.due, due);
    assert.equal(task.plannedDate, undefined);
  }
  assert.equal(defaultTaskPlannedDate({ due: '2026-02-30' }), undefined);
});

test('default scheduling preserves explicit plans and does not add plans to long tasks or undated work', () => {
  assert.equal(defaultTaskPlannedDate(plannedTask), plannedTask.plannedDate);
  assert.equal(taskVisibleToday(plannedTask, '2026-10-08'), false);
  assert.equal(defaultTaskPlannedDate({ due: '2026-10-25', mode: 'multi' }), undefined);
  const undated = { due: undefined, plannedDate: undefined, today: true };
  assert.equal(defaultTaskPlannedDate(undated), undefined);
  assert.equal(taskVisibleToday(undated, '2026-10-23'), true);
});

test('only manual course tasks receive a default early plan, not automatic learning or calendar events', () => {
  const manual = { courseId: 'course', date: '2026-10-25', done: false };
  assert.equal(defaultTaskPlannedDate(manual), '2026-10-23');
  assert.equal(courseNodeVisibleToday(manual, '2026-10-23'), true);
  assert.equal(studyTaskVisibleOnDate(manual, '2026-10-23'), true);
  assert.equal(courseNodeVisibleToday(manual, '2026-10-25'), true);
  const automatic = { ...manual, automationKey: 'study:2026-10-25:review:course:2026-10-25' };
  assert.equal(defaultTaskPlannedDate(automatic), undefined);
  assert.equal(courseNodeVisibleToday(automatic, '2026-10-23'), false);
  assert.equal(studyTaskVisibleOnDate(automatic, '2026-10-23'), false);
  assert.equal(studyTaskVisibleOnDate(automatic, '2026-10-25'), true);
  const event = { date: manual.date, linkedCourseId: 'course', done: false };
  assert.equal(defaultTaskPlannedDate(event), undefined);
  assert.equal(courseNodeVisibleToday(event, '2026-10-23'), false);
  assert.equal(courseNodeVisibleToday(event, '2026-10-25'), true);
});

test('cancel today hides a task even on its deadline without erasing its original dates, content or progress', () => {
  for (const mode of ['single', 'multi']) {
    const task = { ...plannedTask, mode, plannedDate: plannedTask.due };
    const cancelled = cancelWorkForDate(task, task.due);
    assert.equal(taskVisibleToday(cancelled, task.due), false);
    assert.equal(taskScheduledForDate(cancelled, task.due), true);
    assert.deepEqual(cancelled, { ...task, dismissedTodayDate: task.due });
    assert.deepEqual(planTaskForDate(cancelled, task.due), task);
    assert.equal(taskVisibleToday(planTaskForDate(cancelled, task.due), task.due), true);
  }
  const automatic = { courseId: 'course', date: '2026-10-25', plannedDate: '2026-10-23', done: false, automationKey: 'study:2026-10-25:review:course:2026-10-25' };
  assert.equal(studyTaskVisibleOnDate(cancelWorkForDate(automatic, '2026-10-23'), '2026-10-23'), false);
});

test('cancelling manual course work is date scoped and survives workspace save and reload', () => {
  const node = { id: 'course-paper', courseId: 'course', title: '论文', date: '2026-10-25', time: '00:00', location: '', requirements: '保留要求', area: '课内', done: false };
  const cancelled = cancelWorkForDate(node, '2026-10-23');
  const state = { ...createEmptyWorkspaceState(), milestones: [cancelled], tasks: [cancelWorkForDate(plannedTask, '2026-10-02')] };
  const saved = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(saved, state);
  assert.equal(courseNodeVisibleToday(saved.milestones[0], '2026-10-23'), false);
  assert.equal(courseNodeVisibleToday(saved.milestones[0], '2026-10-25'), true);
  assert.equal(courseNodeVisibleToday(cancelWorkForDate(node, node.date), node.date), false);
  assert.equal(courseNodeVisibleToday(planTaskForDate(cancelled, '2026-10-23'), '2026-10-23'), true);
  assert.equal(taskVisibleToday(saved.tasks[0], '2026-10-02'), false);
  assert.equal(taskVisibleToday(saved.tasks[0], plannedTask.due), true);
  assert.equal(workspaceStateSchema.safeParse({ ...state, tasks: [{ ...state.tasks[0], dismissedTodayDate: '2026-02-30' }] }).success, false);
});

test('cancelled manual short plans fall back to two days before the deadline without rewriting saved dates', () => {
  const today = '2026-10-27';
  const ordinary = { ...plannedTask, plannedDate: today, due: '2026-11-01', progressLogs: [] };
  const manualCourse = { id: 'course-review', courseId: 'course', title: '课程作业', date: '2026-11-01', time: '12:00', location: '', requirements: '保留要求', plannedDate: today, area: '课内', done: false };
  const state = { ...createEmptyWorkspaceState(), tasks: [cancelWorkForDate(ordinary, today)], milestones: [cancelWorkForDate(manualCourse, today)] };
  const saved = workspaceStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(saved, state);
  for (const task of [...saved.tasks, ...saved.milestones]) {
    assert.equal(task.plannedDate, today);
    assert.equal(defaultTaskPlannedDate(task), '2026-10-30');
    assert.equal(defaultTaskPlannedDate(planTaskForDate(task, '2026-10-29')), '2026-10-29');
  }
  assert.match(taskScheduleSummary(saved.tasks[0], today), /^2026-10-30 计划推进/);
  assert.equal(taskVisibleToday(saved.tasks[0], today), false);
  assert.equal(taskVisibleToday(saved.tasks[0], '2026-10-30'), true);
  assert.equal(taskOverlapsRange(saved.tasks[0], today, today), false);
  assert.equal(taskOverlapsRange(saved.tasks[0], '2026-10-30', '2026-10-30'), true);
  assert.equal(courseNodeVisibleToday(saved.milestones[0], today), false);
  assert.equal(courseNodeVisibleToday(saved.milestones[0], '2026-10-30'), true);
  assert.equal(saved.tasks[0].due, ordinary.due);
  assert.equal(saved.milestones[0].date, manualCourse.date);
});

test('cancellation does not replace other explicit plans, long-task schedules or automatic dates', () => {
  const today = '2026-10-27';
  assert.equal(defaultTaskPlannedDate(cancelWorkForDate({ due: '2026-11-01', plannedDate: '2026-10-29' }, today)), '2026-10-29');
  assert.equal(defaultTaskPlannedDate(cancelWorkForDate({ due: '2026-11-01', plannedDate: today, mode: 'multi' }, today)), today);
  assert.equal(defaultTaskPlannedDate(cancelWorkForDate({ due: '2026-11-01', plannedDate: today, automationKey: 'study:automatic' }, today)), today);
  assert.equal(defaultTaskPlannedDate(cancelWorkForDate({ plannedDate: today }, today)), today);
  const onDefaultDay = cancelWorkForDate({ due: '2026-10-29', done: false }, today);
  assert.equal(defaultTaskPlannedDate(onDefaultDay), today);
  assert.equal(taskVisibleToday(onDefaultDay, today), false);
  assert.equal(taskVisibleToday(onDefaultDay, '2026-10-28'), false);
  assert.equal(taskVisibleToday(onDefaultDay, '2026-10-29'), true);
});
