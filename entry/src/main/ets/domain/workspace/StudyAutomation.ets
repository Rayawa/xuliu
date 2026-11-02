import { courseTitleCandidate } from '../courses/TimetableRules';
import { Workspace, WorkspaceEntry, CourseSlot } from '../../models/Workspace';
import { STUDY_RULE_VERSION, DAILY_STUDY_DURATION, STUDY_EXCLUDED_COURSES } from '../../config/constants';
import { localDate, uid, runsInWeek, timetableWeekNumber, validDate } from './WorkspaceDomain';
import { LEGACY_STUDY_METHOD_LINES, LEGACY_STUDY_SOURCE } from '../../config/studyMethods';

export interface StudyPlanResult {
  changed: boolean;
  added: number;
  restored: number;
  preserved: number;
  planned: number;
}

interface StudyGroup {
  date: string;
  courseId: string;
  nodes: WorkspaceEntry[];
  postponed: boolean;
}

function cloneEntry(item: WorkspaceEntry): WorkspaceEntry {
  return JSON.parse(JSON.stringify(item)) as WorkspaceEntry;
}

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function excluded(title: string): boolean {
  return STUDY_EXCLUDED_COURSES.some((name) => normalizedTitle(title).includes(name));
}

function dailyKey(date: string, courseId: string): string {
  return `study:${date}:review:${courseId}:${date}`;
}

function dailyTitle(course: string): string {
  return `${normalizedTitle(course).includes('会计学基础') ? '复习' : '自学'} · ${course}`.slice(0, 500);
}

function personalRequirements(value: string): string {
  return value.split('\n').filter((line) => line !== LEGACY_STUDY_SOURCE && line !== DAILY_STUDY_DURATION &&
    !LEGACY_STUDY_METHOD_LINES.includes(line) && !/^对应课程：\d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}/.test(line)).join('\n').trim();
}

export function dailyStudyPlan(data: Workspace, date: string): WorkspaceEntry[] {
  if (!validDate(date)) return [];
  const week = timetableWeekNumber(data.timetableSettings.termStartDate, date);
  if (week === undefined) return [];
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7;
  const result: WorkspaceEntry[] = [];
  for (const course of data.courses) {
    if (!courseTitleCandidate(course.title) || excluded(course.title)) continue;
    const slots = (course.schedule ?? []) as CourseSlot[];
    if (!slots.some((slot) => slot.weekday === weekday && runsInWeek(slot.weeks ?? '', week))) continue;
    result.push({ id: '', automationKey: dailyKey(date, course.id), courseId: course.id,
      title: dailyTitle(course.title), date, time: '20:00', location: '', requirements: DAILY_STUDY_DURATION,
      mode: 'single', parentCandidate: false, area: '课内', done: false });
  }
  return result;
}

/** Preserve personal records and reconnect references when consolidating legacy generated phases. */
export function migrateStudyPlan(data: Workspace, date: string): boolean {
  const before = JSON.stringify(data);
  const todayCourseIds = new Set(dailyStudyPlan(data, date).map((v) => v.courseId ?? ''));
  const referenced = new Set<string>();
  data.tasks.forEach((task) => { if (task.parentMilestoneId) referenced.add(task.parentMilestoneId); });
  data.timeEntries.forEach((entry) => { if (entry.targetKind === 'milestone') referenced.add(entry.taskId); });
  const hasRecords = (node: WorkspaceEntry): boolean => !!(personalRequirements(node.requirements ?? '') ||
    node.attachments?.length || node.outcomeText || node.outcomeAttachments?.length || node.blocks?.length ||
    node.elapsed || referenced.has(node.id) || node.mode === 'multi');
  const groups: Map<string, StudyGroup> = new Map();
  const removals: Set<string> = new Set();
  const replacements: Map<string, WorkspaceEntry> = new Map();
  const processed = new Set(data.studyAutomation.processedKeys);
  for (const node of data.milestones) {
    const course = data.courses.find((v) => v.id === node.courseId);
    if (!node.done && course && node.automationKey?.startsWith('study:') && excluded(course.title)) {
      if (hasRecords(node)) {
        const record = cloneEntry(node); record.automationKey = undefined;
        record.title = `学习资料 · ${course.title}`.slice(0, 500);
        record.requirements = personalRequirements(node.requirements ?? '');
        replacements.set(node.id, record);
      } else removals.add(node.id);
      continue;
    }
    const match = /^study:(\d{4}-\d{2}-\d{2}):(before|during|after):(.+):(\d{4}-\d{2}-\d{2})$/.exec(node.automationKey ?? '');
    if (!match || node.done || !node.courseId || !course) continue;
    const postponed = !!node.plannedDate || node.date !== match[1];
    const day = node.plannedDate || (postponed ? node.date ?? match[4] : match[4]);
    const key = dailyKey(day, node.courseId);
    const group: StudyGroup = groups.get(key) ?? { date: day, courseId: node.courseId, nodes: [], postponed: false };
    group.nodes.push(node); group.postponed = group.postponed || postponed; groups.set(key, group);
    removals.add(node.id);
    if (postponed) processed.add(dailyKey(match[4], node.courseId));
  }
  if (!groups.size && !removals.size && !replacements.size) return false;
  const references: Map<string, string> = new Map();
  groups.forEach((group, key) => {
    const existing = data.milestones.find((node) => node.automationKey === key && !removals.has(node.id));
    const nodes = existing ? [existing].concat(group.nodes) : group.nodes;
    const records = nodes.filter(hasRecords);
    if (!existing && !records.length && !group.postponed && (group.date !== date || !todayCourseIds.has(group.courseId))) return;
    const keeper = existing ?? nodes.find((node) => !!node.plannedDate) ?? records[0] ??
      nodes.find((node) => node.automationKey?.includes(':after:')) ?? nodes[0];
    const requirements = [DAILY_STUDY_DURATION].concat(nodes.map((v) => personalRequirements(v.requirements ?? '')).filter((v) => !!v)).join('\n');
    const attachments = nodes.flatMap((v) => v.attachments ?? []);
    const outcomes = nodes.flatMap((v) => v.outcomeAttachments ?? []);
    const blocks = nodes.flatMap((v) => v.blocks ?? []);
    const outcomeText = nodes.map((v) => v.outcomeText ?? '').filter((v) => !!v).join('\n');
    const elapsed = nodes.reduce((sum, v) => sum + (v.elapsed ?? 0), 0);
    const courseTitle = data.courses.find((v) => v.id === group.courseId)?.title ?? '';
    if (requirements.length > 4000 || outcomeText.length > 4000 || attachments.length > 50 || outcomes.length > 50 || blocks.length > 2000 || elapsed > 10000000) {
      group.nodes.filter(hasRecords).forEach((node) => {
        const record = cloneEntry(node); record.automationKey = undefined;
        record.title = `学习资料 · ${courseTitle}`.slice(0, 500);
        record.requirements = personalRequirements(node.requirements ?? ''); replacements.set(node.id, record);
      });
      return;
    }
    const merged = cloneEntry(keeper); merged.automationKey = key;
    merged.title = existing?.title ?? dailyTitle(courseTitle);
    merged.date = existing?.date ?? (keeper.plannedDate ? keeper.date : group.date);
    merged.time = existing?.time ?? (group.postponed ? keeper.time : '20:00'); merged.requirements = requirements;
    if (attachments.length) merged.attachments = attachments;
    if (outcomes.length) merged.outcomeAttachments = outcomes;
    if (blocks.length) merged.blocks = blocks;
    if (outcomeText) merged.outcomeText = outcomeText;
    if (elapsed) merged.elapsed = elapsed;
    replacements.set(keeper.id, merged); processed.add(key);
    nodes.forEach((node) => references.set(node.id, keeper.id));
  });
  data.milestones = data.milestones.flatMap((node) => {
    const replacement = replacements.get(node.id);
    return replacement ? [replacement] : removals.has(node.id) ? [] : [node];
  });
  data.tasks.forEach((task) => { if (task.parentMilestoneId && references.has(task.parentMilestoneId)) task.parentMilestoneId = references.get(task.parentMilestoneId); });
  data.timeEntries.forEach((entry) => { if (entry.targetKind === 'milestone' && references.has(entry.taskId)) entry.taskId = references.get(entry.taskId) ?? entry.taskId; });
  data.studyAutomation.processedKeys = Array.from(processed).slice(-20000);
  data.studyAutomation.ruleVersion = STUDY_RULE_VERSION;
  return before !== JSON.stringify(data);
}

function poolSourceKeys(data: Workspace): Set<string> {
  const keys: Set<string> = new Set();
  data.reviewPool?.items.forEach((item) => item.sources.forEach((source) => keys.add(`${source.kind}:${source.id}`)));
  data.reviewPool?.removedSources?.forEach((source) => keys.add(`${source.kind}:${source.id}`));
  return keys;
}

function studyVisible(node: WorkspaceEntry, date: string, ignoreDismissal: boolean = false): boolean {
  if (!ignoreDismissal && node.dismissedTodayDate === date) return false;
  if (node.done) return node.completedDate === date;
  if (node.progressedDates?.includes(date)) return true;
  if (node.plannedDate) return node.plannedDate === date;
  return node.date === date;
}

export function applyStudyPlan(data: Workspace, date: string = localDate(), regenerate: boolean = false): StudyPlanResult {
  const result: StudyPlanResult = { changed: false, added: 0, restored: 0, preserved: 0, planned: 0 };
  if (!data.studyAutomation.enabled && !regenerate) return result;
  result.changed = migrateStudyPlan(data, date);
  const plan = dailyStudyPlan(data, date); result.planned = plan.length;
  const processed = new Set(data.studyAutomation.processedKeys);
  const sources = poolSourceKeys(data);
  for (const draft of plan) {
    const key = draft.automationKey ?? '';
    if (regenerate) {
      const candidates = data.milestones.filter((node) => node.courseId === draft.courseId &&
        node.automationKey?.startsWith('study:') && node.automationKey.split(':')[2] === 'review' && !sources.has(`milestone:${node.id}`));
      if (candidates.some((node) => studyVisible(node, date))) { result.preserved++; continue; }
      const cancelled = candidates.find((node) => !node.done && node.dismissedTodayDate === date && studyVisible(node, date, true));
      if (cancelled) { cancelled.dismissedTodayDate = undefined; result.restored++; result.changed = true; continue; }
    } else {
      if (processed.has(key)) continue;
      const existing = data.milestones.some((node) => node.automationKey === key ||
        (node.courseId === draft.courseId && node.automationKey?.split(':')[2] === 'review' && (node.plannedDate || node.date) === date));
      if (existing) { processed.add(key); continue; }
    }
    draft.id = uid();
    if (data.milestones.some((node) => node.automationKey === key)) draft.automationKey = `${key}:reset:${draft.id}`;
    data.milestones.push(draft); processed.add(key); result.added++; result.changed = true;
  }
  const markers = Array.from(processed).slice(-20000);
  if (JSON.stringify(markers) !== JSON.stringify(data.studyAutomation.processedKeys)) result.changed = true;
  if (regenerate && !data.studyAutomation.enabled) result.changed = true;
  if (data.studyAutomation.ruleVersion !== STUDY_RULE_VERSION) result.changed = true;
  data.studyAutomation.enabled = true; data.studyAutomation.processedKeys = markers; data.studyAutomation.ruleVersion = STUDY_RULE_VERSION;
  return result;
}
