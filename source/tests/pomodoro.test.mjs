import test from 'node:test';
import assert from 'node:assert/strict';
import { pomodoroElapsed, pomodoroStorageKey, restorePomodoroSession } from '../lib/pomodoro.ts';

test('standalone pomodoro accounts for pause, background time, clock rollback and completed rounds without a task', () => {
  const session = { id: 'round-1', duration: 1800, elapsed: 20, startedAt: 100000 };
  assert.equal(pomodoroElapsed(session, 130000), 50);
  assert.equal(pomodoroElapsed(session, 99999), 20);
  assert.equal(pomodoroElapsed(session, 9999999), 1800);
  const paused = { ...session, elapsed: 50, startedAt: null };
  assert.equal(pomodoroElapsed(paused, 9999999), 50);
  assert.equal(pomodoroElapsed({ ...paused, startedAt: 200000 }, 210000), 60);
});

test('timer restore validates snapshots, isolates accounts and does not consume old task-linked sessions', () => {
  const session = { id: 'round-1', duration: 1800, elapsed: 50.5, startedAt: null };
  assert.deepEqual(restorePomodoroSession(JSON.parse(JSON.stringify(session))), session);
  for (const invalid of [null, [], {}, { ...session, target: { kind: 'task', id: 'old' } }, { ...session, duration: 0 }, { ...session, elapsed: 1801 }, { ...session, startedAt: 'now' }]) assert.equal(restorePomodoroSession(invalid), null);
  assert.notEqual(pomodoroStorageKey('owner'), pomodoroStorageKey('partner'));
  assert.notEqual(pomodoroStorageKey('owner'), 'xuliu:focus-session:v1:owner');
});
