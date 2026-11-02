import { i18n } from '@kit.LocalizationKit';
import { CourseSlot } from '../../models/Workspace';
import { MS_PER_DAY, COURSE_TIME_ZONE } from '../../config/constants';
import { uid, addDays, timetableWeekNumber, validDate, runsInWeek } from '../workspace/WorkspaceDomain';
import { ImportedCourse, CourseImportRow, groupImportedCourses } from './AcademicImport';
import { extractScheduleWeekRule, courseTitleCandidate } from './TimetableRules';

export interface IcsCourseResult { courses: ImportedCourse[]; skipped: number; notices: string[]; }
interface IcsProperty { value: string; zone: string; dateOnly: boolean; }
interface IcsDate { date: string; time: string; zone: string; utc: number; }
interface OccurrenceGroup { weekday: number; start: string; end: string; weeks: Set<number>; }

function dateText(date: Date): string { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function timeText(date: Date): string { return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`; }
function decode(value: string): string { return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim(); }
function weekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay() || 7; }

class IcsClock {
  private zones: Map<string, i18n.TimeZone> = new Map();
  private available: Set<string> = new Set(i18n.TimeZone.getAvailableIDs());
  zone(id: string): i18n.TimeZone {
    const name = id === 'GMT' || id === 'Etc/UTC' ? 'UTC' : id;
    if (!this.available.has(name) && name !== 'UTC') throw new Error('不支持该日历时区，请导出标准IANA时区文件');
    let zone = this.zones.get(name);
    if (!zone) { zone = i18n.getTimeZone(name); this.zones.set(name, zone); }
    return zone;
  }
  instant(date: string, time: string, zone: string): number {
    const wall = new Date(`${date}T${time}:00Z`).getTime(); if (!Number.isFinite(wall)) throw new Error('日历时间无效');
    const clock = this.zone(zone); let utc = wall - clock.getRawOffset();
    for (let index = 0; index < 3; index++) utc = wall - clock.getOffset(utc);
    const roundtrip = new Date(utc + clock.getOffset(utc));
    if (`${dateText(roundtrip)} ${timeText(roundtrip)}` !== `${date} ${time}`) throw new Error('日历时间位于无效时区转换区间');
    return utc;
  }
  campus(utc: number): Date { return new Date(utc + this.zone(COURSE_TIME_ZONE).getOffset(utc)); }
}

function property(event: string, key: string): IcsProperty {
  const line = event.split(/\r?\n/).find((value) => value.toUpperCase().startsWith(`${key}:`) || value.toUpperCase().startsWith(`${key};`));
  if (!line) return { value: '', zone: '', dateOnly: false };
  const separator = line.indexOf(':'); const parameters = line.slice(0, separator);
  return { value: decode(line.slice(separator + 1)), zone: parameters.match(/(?:^|;)TZID=([^;]+)/i)?.[1]?.replace(/^"|"$/g, '') ?? '', dateOnly: /(?:^|;)VALUE=DATE(?:;|$)/i.test(parameters) };
}

function parseDate(value: IcsProperty, clock: IcsClock): IcsDate {
  const match = value.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
  if (!match || value.dateOnly) throw new Error('全天或缺少时间的事件不能作为课程时段');
  const date = `${match[1]}-${match[2]}-${match[3]}`; const time = `${match[4]}:${match[5]}`;
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('日历日期或时间无效');
  if (match[6] && Number(match[6]) > 59) throw new Error('日历秒数无效');
  const zone = match[7] ? 'UTC' : value.zone || COURSE_TIME_ZONE;
  return { date, time, zone, utc: clock.instant(date, time, zone) };
}

function weekList(values: Set<number>): string {
  const numbers = Array.from(values).sort((left, right) => left - right); const parts: string[] = [];
  let start = numbers[0]; let end = start;
  for (const number of numbers.slice(1)) {
    if (number === end + 1) end = number;
    else { parts.push(start === end ? String(start) : `${start}-${end}`); start = number; end = number; }
  }
  if (start !== undefined) parts.push(start === end ? String(start) : `${start}-${end}`);
  return parts.join(',');
}

export function parseAcademicIcs(text: string, school: string, termStart: string, cancelled: () => boolean = () => false): IcsCourseResult {
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('不是有效的ICS课表');
  const events = text.replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1).map((chunk) => chunk.split('END:VEVENT')[0]);
  const clock = new IcsClock(); const rows: CourseImportRow[] = []; const notices: Set<string> = new Set(); let skipped = 0;
  for (const event of events) {
    if (cancelled()) throw new Error('课表解析已取消');
    try {
      const title = property(event, 'SUMMARY').value; if (!courseTitleCandidate(title)) { skipped++; continue; }
      const start = parseDate(property(event, 'DTSTART'), clock); const end = parseDate(property(event, 'DTEND'), clock);
      const duration = end.utc - start.utc; if (duration <= 0 || duration >= MS_PER_DAY) throw new Error('跨日或无效课程时段未导入');
      const description = property(event, 'DESCRIPTION').value;
      const teacher = description.match(/(?:任课教师|教师|老师)[:：]\s*([^,;，；\n]+)/)?.[1]?.trim() ?? '';
      const location = property(event, 'LOCATION').value;
      const describedWeeks = extractScheduleWeekRule(description) || description.match(/(?:周次|教学周)[:：]\s*([^;；\n]+)/)?.[1]?.trim() || '';
      const ruleText = property(event, 'RRULE').value; const rule: Map<string, string> = new Map();
      ruleText.split(';').filter((value) => !!value).forEach((value) => { const pair = value.split('='); rule.set(pair[0].toUpperCase(), pair[1]?.toUpperCase() ?? ''); });
      if (ruleText && rule.get('FREQ') !== 'WEEKLY') throw new Error('仅每周重复的课程事件可导入');
      if (Array.from(rule.keys()).some((key) => !['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST'].includes(key))) throw new Error('该重复规则需要先转换为每周课程');
      const interval = Number(rule.get('INTERVAL') ?? '1'); const count = rule.has('COUNT') ? Number(rule.get('COUNT')) : undefined;
      if (!Number.isInteger(interval) || interval < 1 || interval > 52 || (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 2000))) throw new Error('课程重复数量或间隔超出支持范围');
      const labels = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
      const days = rule.has('BYDAY') ? rule.get('BYDAY')?.split(',').map((label) => labels.indexOf(label) + 1) ?? [] : [weekday(start.date)];
      if (!days.length || days.some((day) => day < 1)) throw new Error('日历重复星期无效');
      const until = rule.get('UNTIL'); let untilUtc: number | undefined;
      if (until) {
        if (/^\d{8}$/.test(until)) untilUtc = clock.instant(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`, '23:59', start.zone) + 59999;
        else untilUtc = parseDate({ value: until, zone: start.zone, dateOnly: false }, clock).utc + 59999;
      }
      const exclusions: Set<number> = new Set();
      event.split(/\r?\n/).filter((line) => /^EXDATE[:;]/i.test(line)).forEach((line) => {
        const zone = line.match(/TZID=([^;:]+)/i)?.[1] ?? start.zone;
        line.slice(line.indexOf(':') + 1).split(',').forEach((value) => exclusions.add(parseDate({ value, zone, dateOnly: false }, clock).utc));
      });
      const metadataPattern = !ruleText && !!describedWeeks;
      const unbounded = !!ruleText && count === undefined && untilUtc === undefined;
      if (unbounded && exclusions.size) throw new Error('含例外日期的重复课程请带结束日期导出');
      if (unbounded && interval > 2) throw new Error('无结束日期的课程只支持每周或隔周');
      const groups: Map<string, OccurrenceGroup> = new Map();
      const add = (utc: number): void => {
        if (exclusions.has(utc)) return;
        const first = clock.campus(utc); const last = clock.campus(utc + duration);
        if (dateText(first) !== dateText(last)) throw new Error('转换后跨日的课程时段未导入');
        const week = timetableWeekNumber(termStart, dateText(first)); if (week === undefined && !metadataPattern) return;
        if (!metadataPattern && !unbounded && describedWeeks && !runsInWeek(describedWeeks, week ?? 0)) return;
        const day = first.getUTCDay() || 7; const from = timeText(first); const to = timeText(last);
        const key = `${day}:${from}:${to}`;
        const group: OccurrenceGroup = groups.get(key) ?? { weekday: day, start: from, end: to, weeks: new Set<number>() };
        group.weeks.add(week ?? 0); groups.set(key, group);
      };
      if (!ruleText) add(start.utc);
      else {
        const firstDay = labels.indexOf(rule.get('WKST') ?? 'MO') + 1;
        if (firstDay < 1) throw new Error('日历起始星期无效');
        const monday = addDays(start.date, -((weekday(start.date) - firstDay + 7) % 7)); let emitted = 0; let finished = false;
        const relative = Math.floor((new Date(`${termStart}T12:00:00Z`).getTime() - new Date(`${monday}T12:00:00Z`).getTime()) / MS_PER_DAY / 7);
        const firstWeek = unbounded ? Math.max(0, Math.floor(relative / interval) * interval) : 0;
        const maxWeeks = unbounded ? firstWeek + interval * 3 : 520;
        for (let week = firstWeek; week < maxWeeks && !finished; week += interval) {
          for (const day of Array.from(new Set(days)).sort((left, right) => (left - firstDay + 7) % 7 - (right - firstDay + 7) % 7)) {
            const date = addDays(monday, week * 7 + (day - firstDay + 7) % 7); const utc = clock.instant(date, start.time, start.zone);
            if (utc < start.utc) continue;
            if ((count !== undefined && emitted >= count) || (untilUtc !== undefined && utc > untilUtc)) { finished = true; break; }
            add(utc); emitted++;
          }
        }
        if (!unbounded && !finished && (count === undefined || emitted < count)) throw new Error('课程重复范围超过10年，请按学期导出');
      }
      if (!groups.size) { skipped++; notices.add('有事件未落入所选教学周范围'); continue; }
      const eventRows: CourseImportRow[] = [];
      groups.forEach((group) => {
        let weeks = metadataPattern ? describedWeeks : weekList(group.weeks);
        if (unbounded) {
          weeks = describedWeeks;
          if (interval === 2) {
            const first = Array.from(group.weeks)[0]; const parity = Math.abs(first) % 2 === 0 ? '双周' : '单周';
            if ((weeks.includes('单') && parity === '双周') || (weeks.includes('双') && parity === '单周')) throw new Error('课程周次与隔周规则不一致');
            if (!/[单双]/.test(weeks)) weeks = `${weeks}${parity}`;
          }
        }
        if (weeks.length > 500) throw new Error('课程周次过多，请按学期导出');
        eventRows.push({ title, teacher, location, weeks, school, slot: { id: uid(), weekday: group.weekday,
          start: group.start, end: group.end, location, weeks, source: 'ics' } });
      });
      eventRows.forEach((row) => rows.push(row));
    } catch (error) { skipped++; notices.add((error as Error).message); }
  }
  return { courses: groupImportedCourses(rows), skipped, notices: Array.from(notices) };
}
