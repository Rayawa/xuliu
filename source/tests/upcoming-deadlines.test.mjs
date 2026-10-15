import test from "node:test";
import assert from "node:assert/strict";
import { upcomingDeadlines } from "../lib/upcoming-deadlines.ts";

const today = "2026-10-15";
const task = (id, due, extra = {}) => ({ id, title: id, due, done: false, ...extra });
const node = (id, date, extra = {}) => ({ id, title: id, date, time: "14:00", done: false, ...extra });

test("upcoming reminders include short and long tasks, course work and events but exclude daily automated study", () => {
  const result = upcomingDeadlines([task("short", today), task("long", "2026-10-18", { mode: "multi", startDate: "2026-09-01" })],
    [node("course", "2026-10-16", { courseId: "course" }), node("event", "2026-10-17"), node("study", today, { courseId: "course", automationKey: `study:${today}:review:course:${today}` })], today);
  assert.deepEqual(result.map((item) => [item.id, item.kind, item.entity]), [["short", "task", "task"], ["course", "milestone", "task"], ["event", "milestone", "event"], ["long", "task", "task"]]);
});

test("planned action dates and long-task start dates never replace real deadlines", () => {
  const result = upcomingDeadlines([
    task("plan-only", undefined, { plannedDate: today }),
    task("start-only", undefined, { mode: "multi", startDate: today }),
    task("later-deadline", "2026-11-01", { plannedDate: today }),
    task("real-deadline", "2026-10-18", { plannedDate: "2026-11-01" }),
  ], [node("course-plan", "2026-11-01", { courseId: "course", plannedDate: today })], today);
  assert.deepEqual(result.map((item) => item.id), ["real-deadline"]);
});

test("completed, overdue, distant and invalid records are omitted without changing the source data", () => {
  const tasks = [task("done", today, { done: true }), task("status-done", today, { status: "已完成" }), task("old", "2026-10-14"), task("later", "2026-10-23"), task("invalid", "2026-10-16bad")];
  const nodes = [node("done-node", today, { done: true }), node("old-node", "2026-10-14"), node("invalid-node", "2026-10-16bad")];
  const original = structuredClone({ tasks, nodes });
  assert.deepEqual(upcomingDeadlines(tasks, nodes, today), []);
  assert.deepEqual({ tasks, nodes }, original);
});

test("reminders sort by deadline date and time while undated times remain unspecified", () => {
  const result = upcomingDeadlines([task("date-only", today), task("afternoon", today, { dueTime: "16:00" }), task("tomorrow", "2026-10-16", { dueTime: "00:00" })], [node("morning", today, { time: "09:00" })], today);
  assert.deepEqual(result.map((item) => item.id), ["morning", "afternoon", "date-only", "tomorrow"]);
  assert.equal(result.find((item) => item.id === "date-only").time, undefined);
});

test("the seven-day window includes today and its end date across month and year boundaries", () => {
  assert.deepEqual(upcomingDeadlines([task("today", "2026-12-29"), task("end", "2027-01-05"), task("outside", "2027-01-06")], [], "2026-12-29").map((item) => item.id), ["today", "end"]);
  assert.deepEqual(upcomingDeadlines([task("leap-day", "2028-02-29"), task("end", "2028-03-06"), task("outside", "2028-03-07")], [], "2028-02-28").map((item) => item.id), ["leap-day", "end"]);
});
