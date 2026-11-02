import { CourseSlot, WorkspaceEntry } from '../../models/Workspace';
import { uid, createEntry, validTime } from '../workspace/WorkspaceDomain';
import { extractScheduleLocation, extractScheduleWeekRule, extractScheduleWeekday, courseTitleCandidate,
  periodTimeRange, splitScheduleEntries, repairImportedSlot, courseSchool } from './TimetableRules';

export interface ImportedCourse { key: string; title: string; teacher: string; location: string; weeks: string; school: string; schedule: CourseSlot[]; }
export interface CourseImportRow { title: string; teacher: string; location: string; weeks: string; school: string; slot: CourseSlot; }
interface HeaderAliases { title: string[]; teacher: string[]; weekday: string[]; time: string[]; location: string[]; weeks: string[]; }
interface CellParts { title: string; teacher: string; location: string; weeks: string; scheduleText: string; }
interface CellEntry { title: string; lines: string[]; }
interface DayColumn { index: number; weekday: number; }

const HEADER_ALIASES: HeaderAliases = {
  title: ['课程名称', '课程名', '教学班名称', '课程', 'subject', 'summary'], teacher: ['任课教师', '授课教师', '教师', '老师', 'teacher'],
  weekday: ['星期', '周几', '上课星期', '上课日期', 'day', 'weekday'], time: ['上课时间', '时间', '节次', '上课节次', '课程时间', 'time'],
  location: ['上课地点', '上课教室', '教室', '地点', '校区地点', 'location'], weeks: ['上课周次', '周次', '教学周', 'weeks']
};

function clean(value: string | undefined): string { return (value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim(); }

export function academicCourseTitle(value: string): string {
  return clean(value).replace(/^[（(]\s*本\s*[）)]\s*/, '').replace(/^(?:[A-Za-z]+\d{3,}|\d{5,})\s*[-－—]\s*/, '')
    .replace(/\s*[\[［]\s*\d+[A-Za-z0-9-]*\s*[\]］]\s*$/, '').trim();
}
export function academicCourseKey(value: string): string { return academicCourseTitle(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }

export function importWeekday(value: string): number {
  const text = clean(value).normalize('NFKC');
  if (/^[1-7]$/.test(text)) return Number(text);
  if (/^[一二三四五六日天]$/.test(text)) return extractScheduleWeekday(`周${text}`);
  return extractScheduleWeekday(text);
}

function timeRange(value: string, school: string): [string, string] | null {
  const match = clean(value).match(/(\d{1,2})[:：](\d{2})\s*(?:-|—|–|~|～|至)\s*(\d{1,2})[:：](\d{2})/);
  if (match) return [`${match[1].padStart(2, '0')}:${match[2]}`, `${match[3].padStart(2, '0')}:${match[4]}`];
  return periodTimeRange(value, school);
}

function cellParts(value: string): CellParts {
  const lines = value.split(/\r?\n|\s{2,}|\|/).map(clean).filter((line) => !!line);
  const title = lines.find((line) => courseTitleCandidate(line) && !/(教师|老师|地点|教室|校区|周次|教学周|星期)/.test(line)) ?? '';
  const teacher = lines.find((line) => /(教师|老师|任课)/.test(line))?.replace(/^.*?(?:教师|老师|任课)[:：]?\s*/, '') ?? '';
  const text = lines.filter((line) => line !== title && line !== teacher).join(' ');
  return { title, teacher, location: extractScheduleLocation(text), weeks: extractScheduleWeekRule(text), scheduleText: text };
}

function cellEntries(value: string): CellParts[] {
  const entries: CellEntry[] = [];
  value.split(/\r?\n|\|/).map(clean).filter((line) => !!line).forEach((line) => {
    const schedule = !!(extractScheduleWeekday(line) || periodTimeRange(line, 'bit') || extractScheduleWeekRule(line));
    const metadata = /^(?:任课教师|授课教师|教师|老师|地点|教室|周次|教学周)\s*[:：]/.test(line);
    if (!schedule && !metadata && courseTitleCandidate(line)) entries.push({ title: academicCourseTitle(line), lines: [] });
    else if (entries.length) entries[entries.length - 1].lines.push(line);
  });
  return entries.map((entry): CellParts => {
    const parts = cellParts([entry.title].concat(entry.lines).join('\n')); parts.title = entry.title; parts.scheduleText = entry.lines.join('\n'); return parts;
  });
}

function slotKey(slot: CourseSlot): string { return JSON.stringify([slot.weekday, slot.start, slot.end, slot.location.trim(), slot.weeks?.trim() ?? '']); }

export function groupImportedCourses(rows: CourseImportRow[]): ImportedCourse[] {
  const grouped: Map<string, ImportedCourse> = new Map();
  rows.forEach((row) => {
    const title = academicCourseTitle(row.title); if (!courseTitleCandidate(title)) return;
    const key = `${row.school}::${academicCourseKey(title)}`;
    const current: ImportedCourse = grouped.get(key) ?? { key, title, teacher: row.teacher, location: row.location, weeks: row.weeks, school: row.school, schedule: [] };
    if (!current.teacher && row.teacher) current.teacher = row.teacher;
    if (!current.location && row.location) current.location = row.location;
    if (!current.weeks && row.weeks) current.weeks = row.weeks;
    if (!current.schedule.some((slot) => slotKey(slot) === slotKey(row.slot))) current.schedule.push(row.slot);
    grouped.set(key, current);
  });
  return Array.from(grouped.values());
}

export function flattenImports(courses: ImportedCourse[]): CourseImportRow[] {
  return courses.flatMap((course) => course.schedule.map((slot): CourseImportRow => ({
    title: course.title, teacher: course.teacher, location: course.location, weeks: course.weeks, school: course.school, slot
  })));
}

export function parseAcademicRows(rawRows: string[][], school: string, cancelled: () => boolean = () => false): ImportedCourse[] {
  if (!['pku', 'bit'].includes(school)) throw new Error('请选择北京大学或北京理工大学课表');
  const rows = rawRows.map((row) => row.map(clean));
  const results: CourseImportRow[] = [];
  const add = (title: string, teacher: string, location: string, weeks: string, weekday: number, range: [string, string]): void => {
    if (!validTime(range[0]) || !validTime(range[1]) || range[0] >= range[1] || weekday < 1 || weekday > 7) return;
    results.push({ title, teacher, location, weeks, school, slot: { id: uid(), weekday, start: range[0], end: range[1], location, weeks, source: school } });
  };
  const weekdayHeader = rows.findIndex((row) => row.filter((cell) => extractScheduleWeekday(cell) > 0 || /^[一二三四五六日天]$/.test(clean(cell))).length >= 2 ||
    new Set(row.filter((cell) => /^[1-7]$/.test(clean(cell)))).size >= 5);
  if (weekdayHeader >= 0) {
    const days = rows[weekdayHeader].map((cell, index): DayColumn => ({ index, weekday: importWeekday(cell) })).filter((day) => day.weekday > 0);
    for (const row of rows.slice(weekdayHeader + 1)) {
      if (cancelled()) throw new Error('课表解析已取消');
      const rowTime = timeRange(row.slice(0, Math.max(1, days[0]?.index ?? 1)).join(' '), school); if (!rowTime) continue;
      days.forEach((day) => {
        const cell = clean(row[day.index]); if (!cell || /^(无|暂无|--|-)$/.test(cell)) return;
        cellEntries(cell).forEach((parts) => {
          const schedules = splitScheduleEntries(parts.scheduleText);
          (schedules.length ? schedules : [parts.scheduleText]).forEach((entry) => {
            const range = timeRange(entry, school) ?? rowTime; const weekday = importWeekday(entry) || day.weekday;
            add(parts.title, parts.teacher, extractScheduleLocation(entry) || parts.location, extractScheduleWeekRule(entry) || parts.weeks, weekday, range);
          });
        });
      });
    }
  }
  if (results.length) return groupImportedCourses(results);
  const headerIndex = rows.findIndex((row) => row.some((cell) => HEADER_ALIASES.title.some((alias) => cell.includes(alias))) &&
    row.some((cell) => HEADER_ALIASES.weekday.concat(HEADER_ALIASES.time).some((alias) => cell.includes(alias))));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex];
  const column = (aliases: string[]): number => headers.findIndex((header) => aliases.some((alias) => header.toLowerCase() === alias.toLowerCase() || header.includes(alias)));
  const titleColumn = column(HEADER_ALIASES.title); const teacherColumn = column(HEADER_ALIASES.teacher);
  const dayColumn = column(HEADER_ALIASES.weekday); const timeColumn = column(HEADER_ALIASES.time);
  const locationColumn = column(HEADER_ALIASES.location); const weeksColumn = column(HEADER_ALIASES.weeks);
  const startColumn = column(['开始时间', 'start']); const endColumn = column(['结束时间', 'end']);
  for (const row of rows.slice(headerIndex + 1)) {
    if (cancelled()) throw new Error('课表解析已取消');
    const title = clean(row[titleColumn]); if (!courseTitleCandidate(title)) continue;
    const teacher = clean(row[teacherColumn]); const rawLocation = locationColumn !== timeColumn ? clean(row[locationColumn]) : '';
    const rawWeeks = clean(row[weeksColumn]);
    const explicitTimes = startColumn >= 0 && endColumn >= 0 ? `${row[startColumn]}-${row[endColumn]}` : clean(row[timeColumn]);
    const day = importWeekday(row[dayColumn] ?? '');
    if (day && explicitTimes && startColumn >= 0 && endColumn >= 0) {
      const range = timeRange(explicitTimes, school); if (range) add(title, teacher, extractScheduleLocation(rawLocation), extractScheduleWeekRule(rawWeeks) || rawWeeks, day, range);
      continue;
    }
    const scheduleCells = Array.from(new Set(row.filter((cell) => importWeekday(cell) > 0 && !!timeRange(cell, school))));
    const text = scheduleCells.length ? scheduleCells.join('\n') : [rawWeeks, day ? `周${day}` : row[dayColumn] ?? '', explicitTimes, rawLocation].join(' ');
    splitScheduleEntries(text).forEach((part) => {
      const weekday = importWeekday(part); const combined = `${rawWeeks} ${part} ${rawLocation}`; const range = timeRange(combined, school);
      if (weekday && range) add(title, teacher, extractScheduleLocation(combined), extractScheduleWeekRule(combined), weekday, range);
    });
  }
  return groupImportedCourses(results);
}

export function assertImportedCourses(courses: ImportedCourse[]): void {
  if (!courses.length) throw new Error('没有可导入的课程时段');
  if (courses.length > 2000) throw new Error('课程数量超过2000门');
  courses.forEach((course) => {
    if (!courseTitleCandidate(academicCourseTitle(course.title)) || course.title.length > 500 || course.teacher.length > 500 || course.location.length > 500 || course.weeks.length > 500) throw new Error('课程名称或说明格式无效，最多500字');
    if (!['pku', 'bit'].includes(course.school) || !course.schedule.length || course.schedule.length > 1000) throw new Error('课程时段数量无效');
    course.schedule.forEach((slot) => {
      if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7 || !validTime(slot.start) || !validTime(slot.end) || slot.start >= slot.end || slot.location.length > 500 || (slot.weeks?.length ?? 0) > 500) throw new Error('课程星期、时间、地点或周次无效');
    });
  });
}

export function updateAcademicCourses(original: WorkspaceEntry[], drafts: ImportedCourse[], replace: boolean, term: string): WorkspaceEntry[] {
  assertImportedCourses(drafts);
  const courses = JSON.parse(JSON.stringify(original)) as WorkspaceEntry[];
  for (const draft of drafts) {
    const key = academicCourseKey(draft.title);
    const indexes: number[] = [];
    courses.forEach((course, index) => { if (courseSchool(course) === draft.school && academicCourseKey(course.title) === key) indexes.push(index); });
    if (!indexes.length) {
      const course = createEntry('courses'); course.title = academicCourseTitle(draft.title); course.teacher = draft.teacher;
      course.term = term; course.location = draft.location; course.school = draft.school;
      course.requirements = draft.weeks ? `上课周次：${draft.weeks}` : '';
      course.schedule = draft.schedule.map((slot) => { const next = JSON.parse(JSON.stringify(slot)) as CourseSlot; next.id = uid(); return next; });
      courses.push(course); continue;
    }
    const previousSlots = indexes.flatMap((index) => (courses[index].schedule ?? []) as CourseSlot[]);
    indexes.forEach((index) => {
      const existing = courses[index]; const slots = (existing.schedule ?? []) as CourseSlot[];
      const retained = replace ? slots.filter((slot) => slot.source === 'manual' || (!!slot.source && slot.source !== draft.school && slot.source !== 'ics')) : slots.slice();
      if (index === indexes[0]) {
        const seen = new Set(retained.map(slotKey));
        draft.schedule.forEach((slot) => {
          const value = slotKey(slot); if (seen.has(value)) return;
          const next = JSON.parse(JSON.stringify(slot)) as CourseSlot; next.id = previousSlots.find((old) => slotKey(old) === value)?.id ?? uid();
          retained.push(next); seen.add(value);
        });
      }
      existing.title = academicCourseTitle(draft.title); existing.schedule = retained;
    });
  }
  if (courses.length > 2000) throw new Error('导入后课程数量将超过2000门');
  return courses;
}

export function courseContentPreserved(before: WorkspaceEntry[], after: WorkspaceEntry[]): boolean {
  return before.every((entry) => {
    const next = after.find((value) => value.id === entry.id); if (!next) return false;
    const oldContent = JSON.parse(JSON.stringify(entry)) as WorkspaceEntry; const newContent = JSON.parse(JSON.stringify(next)) as WorkspaceEntry;
    oldContent.title = ''; newContent.title = ''; oldContent.schedule = []; newContent.schedule = [];
    return JSON.stringify(oldContent) === JSON.stringify(newContent);
  });
}
