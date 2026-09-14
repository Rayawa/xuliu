import { extractScheduleLocation, extractScheduleWeekRule, extractScheduleWeekday, isCourseTitleCandidate, periodTimeRange, splitScheduleEntries, type TimetableSchool } from "./timetable.ts";

export type AcademicImportPreset = TimetableSchool;
export type CourseSlot = { id: string; weekday: number; start: string; end: string; location: string; weeks?: string; source?: "manual" | "pku" | "bit" | "ics" };
export type ImportedCourse = { key: string; title: string; teacher: string; location: string; weeks: string; school: AcademicImportPreset; schedule: Omit<CourseSlot, "id">[] };

const timePattern = /(\d{1,2})[:：](\d{2})\s*(?:-|—|–|~|～|至)\s*(\d{1,2})[:：](\d{2})/;
const headerAliases = {
  title: ["课程名称", "课程名", "教学班名称", "课程", "subject", "summary"],
  teacher: ["任课教师", "授课教师", "教师", "老师", "teacher"],
  weekday: ["星期", "周几", "上课星期", "上课日期", "day", "weekday"],
  time: ["上课时间", "时间", "节次", "上课节次", "课程时间", "time"],
  location: ["上课地点", "上课教室", "教室", "地点", "校区地点", "location"],
  weeks: ["上课周次", "周次", "教学周", "weeks"],
};

const cleanImportCell = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();

export function academicCourseTitle(value: string) {
  return cleanImportCell(value)
    .replace(/^[（(]\s*本\s*[）)]\s*/, "")
    .replace(/^(?:[A-Za-z]+\d{3,}|\d{5,})\s*[-－—]\s*/, "")
    .replace(/\s*[\[［]\s*\d+[A-Za-z0-9-]*\s*[\]］]\s*$/, "")
    .trim();
}

export const academicCourseKey = (title: string) => academicCourseTitle(title).normalize("NFKC").replace(/\s+/g, "").toLowerCase();

// A grid cell may contain several courses, and a long lesson can appear in two rows.
// Pair each course heading with its own schedule before grouping and deduplicating.
function courseCellEntries(value: string) {
  const lines = value.split(/\r?\n|\|/).map(cleanImportCell).filter(Boolean);
  const entries: Array<{ title: string; lines: string[] }> = [];
  for (const line of lines) {
    const isSchedule = Boolean(extractScheduleWeekday(line) || periodTimeRange(line, "bit") || extractScheduleWeekRule(line));
    const isMetadata = /^(?:任课教师|授课教师|教师|老师|地点|教室|周次|教学周)\s*[:：]/.test(line);
    if (!isSchedule && !isMetadata && isCourseTitleCandidate(line)) entries.push({ title: academicCourseTitle(line), lines: [] });
    else if (entries.length) entries[entries.length - 1].lines.push(line);
  }
  return entries.map((entry) => ({ ...courseCellParts([entry.title, ...entry.lines].join("\n")), title: entry.title, scheduleText: entry.lines.join("\n") }));
}

export function importWeekday(value: string) {
  return extractScheduleWeekday(cleanImportCell(value));
}

function importTimeRange(value: string, preset: AcademicImportPreset): [string, string] | null {
  const normalized = cleanImportCell(value);
  const explicit = normalized.match(timePattern);
  if (explicit) {
    return [`${explicit[1].padStart(2, "0")}:${explicit[2]}`, `${explicit[3].padStart(2, "0")}:${explicit[4]}`];
  }
  return periodTimeRange(normalized, preset);
}

function importColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.some((alias) => header.toLowerCase() === alias.toLowerCase() || header.includes(alias)));
}

function courseCellParts(value: string) {
  const lines = value.split(/\r?\n|\s{2,}|\|/).map(cleanImportCell).filter(Boolean);
  const title = lines.find((line) => isCourseTitleCandidate(line) && !/(教师|老师|地点|教室|校区|周次|教学周|星期)/.test(line)) ?? "";
  const teacher = lines.find((line) => /(教师|老师|任课)/.test(line))?.replace(/^.*?(?:教师|老师|任课)[:：]?\s*/, "") ?? "";
  const scheduleText = lines.filter((line) => line !== title && line !== teacher).join(" ");
  const weeks = extractScheduleWeekRule(scheduleText);
  const location = extractScheduleLocation(scheduleText);
  return { title, teacher, location, weeks };
}

export function groupImportedCourses(rows: Array<Omit<ImportedCourse, "key" | "schedule"> & { slot: Omit<CourseSlot, "id"> }>) {
  const grouped = new Map<string, ImportedCourse>();
  for (const row of rows) {
    const title = academicCourseTitle(row.title);
    if (!isCourseTitleCandidate(title)) continue;
    const key = `${row.school}::${academicCourseKey(title)}`;
    const current = grouped.get(key) ?? { key, title, teacher: row.teacher, location: row.location, weeks: row.weeks, school: row.school, schedule: [] };
    if (!current.teacher && row.teacher) current.teacher = row.teacher;
    if (!current.location && row.location) current.location = row.location;
    if (!current.weeks && row.weeks) current.weeks = row.weeks;
    const duplicate = current.schedule.some((slot) => slot.weekday === row.slot.weekday && slot.start === row.slot.start && slot.end === row.slot.end && slot.location === row.slot.location && slot.weeks === row.slot.weeks);
    if (!duplicate) current.schedule.push(row.slot);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function parseAcademicRows(rawRows: unknown[][], preset: AcademicImportPreset) {
  const rows = rawRows.map((row) => row.map(cleanImportCell));
  const weekdayHeaderIndex = rows.findIndex((row) => row.filter((cell) => importWeekday(cell) > 0).length >= 2);
  const importedRows: Array<Omit<ImportedCourse, "key" | "schedule"> & { slot: Omit<CourseSlot, "id"> }> = [];

  if (weekdayHeaderIndex >= 0) {
    const header = rows[weekdayHeaderIndex];
    const dayColumns = header.map((cell, index) => ({ index, weekday: importWeekday(cell) })).filter((item) => item.weekday > 0);
    for (const row of rows.slice(weekdayHeaderIndex + 1)) {
      const rowLabel = row.slice(0, Math.max(1, dayColumns[0]?.index ?? 1)).join(" ");
      const rowTime = importTimeRange(rowLabel, preset);
      if (!rowTime) continue;
      for (const day of dayColumns) {
        const cell = cleanImportCell(row[day.index]);
        if (!cell || /^(无|暂无|--|-)$/.test(cell)) continue;
        for (const parts of courseCellEntries(cell)) {
          if (!parts.title) continue;
          const scheduleParts = splitScheduleEntries(parts.scheduleText);
          for (const entry of scheduleParts.length ? scheduleParts : [parts.scheduleText]) {
            const range = importTimeRange(entry, preset) ?? rowTime;
            const weekday = importWeekday(entry) || day.weekday;
            const weeks = extractScheduleWeekRule(entry) || parts.weeks;
            const location = extractScheduleLocation(entry) || parts.location;
            importedRows.push({ title: parts.title, teacher: parts.teacher, location, weeks, school: preset,
              slot: { weekday, start: range[0], end: range[1], location, weeks, source: preset } });
          }
        }
      }
    }
  }

  if (importedRows.length) return groupImportedCourses(importedRows);

  const headerIndex = rows.findIndex((row) => row.some((cell) => headerAliases.title.some((alias) => cell.includes(alias))) && row.some((cell) => [...headerAliases.weekday, ...headerAliases.time].some((alias) => cell.includes(alias))));
  if (headerIndex >= 0) {
    const headers = rows[headerIndex];
    const indexes = {
      title: importColumn(headers, headerAliases.title), teacher: importColumn(headers, headerAliases.teacher),
      weekday: importColumn(headers, headerAliases.weekday), time: importColumn(headers, headerAliases.time),
      location: importColumn(headers, headerAliases.location), weeks: importColumn(headers, headerAliases.weeks),
    };
    for (const row of rows.slice(headerIndex + 1)) {
      const title = cleanImportCell(row[indexes.title]);
      if (!isCourseTitleCandidate(title)) continue;
      const teacher = indexes.teacher >= 0 ? cleanImportCell(row[indexes.teacher]) : "";
      const rawLocation = indexes.location >= 0 && indexes.location !== indexes.time ? cleanImportCell(row[indexes.location]) : "";
      const rawWeeks = indexes.weeks >= 0 ? cleanImportCell(row[indexes.weeks]) : "";
      const scheduleCells = [...new Set(row.filter((cell) => importWeekday(cell) > 0 && Boolean(importTimeRange(cell, preset))))];
      const scheduleText = scheduleCells.length ? scheduleCells.join("\n") : [rawWeeks, indexes.weekday >= 0 ? row[indexes.weekday] : "", indexes.time >= 0 ? row[indexes.time] : "", rawLocation].join(" ");
      const scheduleParts = splitScheduleEntries(scheduleText);
      for (const part of scheduleParts) {
        const weekday = importWeekday(part);
        const combined = `${rawWeeks} ${part} ${rawLocation}`;
        const range = importTimeRange(combined, preset);
        if (!weekday || !range) continue;
        const weeks = extractScheduleWeekRule(combined);
        const location = extractScheduleLocation(combined);
        importedRows.push({ title, teacher, location, weeks, school: preset, slot: { weekday, start: range[0], end: range[1], location, weeks, source: preset } });
      }
    }
  }
  return groupImportedCourses(importedRows);
}

function decodeIcsValue(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

export function parseAcademicIcs(text: string, preset: AcademicImportPreset) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.split("BEGIN:VEVENT").slice(1).map((chunk) => chunk.split("END:VEVENT")[0]);
  const rows: Array<Omit<ImportedCourse, "key" | "schedule"> & { slot: Omit<CourseSlot, "id"> }> = [];
  for (const event of events) {
    const value = (name: string) => decodeIcsValue(event.match(new RegExp(`(?:^|\\n)${name}(?:;[^:]*)?:(.*)`, "i"))?.[1] ?? "");
    const title = value("SUMMARY");
    const location = value("LOCATION");
    const description = value("DESCRIPTION");
    const startText = event.match(/(?:^|\n)DTSTART(?:;[^:]*)?:(\d{8})T(\d{2})(\d{2})/i);
    const endText = event.match(/(?:^|\n)DTEND(?:;[^:]*)?:(\d{8})T(\d{2})(\d{2})/i);
    if (!title || !startText || !endText) continue;
    const rruleDay = event.match(/BYDAY=(MO|TU|WE|TH|FR|SA|SU)/i)?.[1]?.toUpperCase();
    const dayMap: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
    const date = new Date(`${startText[1].slice(0, 4)}-${startText[1].slice(4, 6)}-${startText[1].slice(6, 8)}T12:00:00`);
    const nativeDay = date.getDay();
    const weekday = rruleDay ? dayMap[rruleDay] : nativeDay === 0 ? 7 : nativeDay;
    const teacher = description.match(/(?:教师|老师|任课教师)[:：]\s*([^,;，；]+)/)?.[1]?.trim() ?? "";
    const weeks = description.match(/(?:周次|教学周)[:：]\s*([^,;，；]+)/)?.[1]?.trim() ?? "";
    rows.push({
      title, teacher, location, weeks, school: preset,
      slot: { weekday, start: `${startText[2]}:${startText[3]}`, end: `${endText[2]}:${endText[3]}`, location, weeks, source: "ics" },
    });
  }
  return groupImportedCourses(rows);
}

export function parseDelimitedRows(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", "\t", ";"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
