import { CourseSlot, WorkspaceEntry } from '../../models/Workspace';

interface PeriodNumbers { first: number; last: number; }
const OFFICIAL_PERIOD_TIMES: Record<string, string[][]> = {
  "pku": [
    [
      "08:00",
      "08:50"
    ],
    [
      "09:00",
      "09:50"
    ],
    [
      "10:10",
      "11:00"
    ],
    [
      "11:10",
      "12:00"
    ],
    [
      "13:00",
      "13:50"
    ],
    [
      "14:00",
      "14:50"
    ],
    [
      "15:10",
      "16:00"
    ],
    [
      "16:10",
      "17:00"
    ],
    [
      "17:10",
      "18:00"
    ],
    [
      "18:40",
      "19:30"
    ],
    [
      "19:40",
      "20:30"
    ],
    [
      "20:40",
      "21:30"
    ]
  ],
  "bit": [
    [
      "08:00",
      "08:45"
    ],
    [
      "08:50",
      "09:35"
    ],
    [
      "09:55",
      "10:40"
    ],
    [
      "10:45",
      "11:30"
    ],
    [
      "11:35",
      "12:20"
    ],
    [
      "13:20",
      "14:05"
    ],
    [
      "14:10",
      "14:55"
    ],
    [
      "15:15",
      "16:00"
    ],
    [
      "16:05",
      "16:50"
    ],
    [
      "16:55",
      "17:40"
    ],
    [
      "18:30",
      "19:15"
    ],
    [
      "19:20",
      "20:05"
    ],
    [
      "20:10",
      "20:55"
    ]
  ]
};

const weekdayTextPattern = /(?:星期|周)\s*[一二三四五六日天1-7]/;
const periodTextPattern = /(?:第\s*)?\d{1,2}\s*(?:节\s*(?:-|—|–|~|～|至)\s*(?:第\s*)?\d{1,2}\s*节|(?:-|—|–|~|～|至)\s*(?:第\s*)?\d{1,2}\s*节|节)/;
const weekRulePattern = /-?\d+(?:\s*(?:-|—|–|~|～|至)\s*-?\d+)?(?:\s*[,，、]\s*-?\d+(?:\s*(?:-|—|–|~|～|至)\s*-?\d+)?)*\s*周(?:\s*[（(]?\s*[单双]\s*周?\s*[）)]?)?/g;

function normalizeScheduleText(value: string) {
  return value.normalize("NFKC").replace(/[−－]/g, "-").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function extractScheduleWeekday(value: string) {
  const match = normalizeScheduleText(value).match(weekdayTextPattern);
  if (!match) return 0;
  const token = match[0].match(/[一二三四五六日天1-7]/)?.[0] ?? "";
  const map: Record<string, number> = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7 };
  return map[token] ?? Number(token) ?? 0;
}

export function extractScheduleWeekRule(value: string) {
  const normalized = normalizeScheduleText(value);
  const matches = Array.from(normalized.matchAll(new RegExp(weekRulePattern.source, "g"))).map((match) => match[0].replace(/\s+/g, ""));
  return Array.from(new Set(matches)).join("、");
}

export function extractScheduleLocation(value: string) {
  let location = normalizeScheduleText(value)
    .replace(new RegExp(weekRulePattern.source, "g"), " ")
    .replace(new RegExp(weekdayTextPattern.source, "g"), " ")
    .replace(new RegExp(periodTextPattern.source, "g"), " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:-|—|–|~|～|至)\s*\d{1,2}:\d{2}\b/g, " ")
    .replace(/(?:上课时间地点|上课地点|地点|教室|校区地点|周次|教学周)\s*[:：]?/g, " ")
    .replace(/^[,，、;；|:\s]+|[,，、;；|:\s]+$/g, "")
    .replace(/\s*[,，、;；|]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:无|暂无|未填写|地点未填写|-+)$/.test(location)) location = "";
  return location;
}

export function splitScheduleEntries(value: string) {
  const normalized = normalizeScheduleText(value);
  if (!normalized) return [];
  const separated = normalized.split(/\r?\n|[;；]+/).map((part) => part.trim()).filter((part) => weekdayTextPattern.test(part) && periodTextPattern.test(part));
  if (separated.length > 1) return separated;

  const weekdayMatches = Array.from(normalized.matchAll(new RegExp(weekdayTextPattern.source, "g")));
  if (weekdayMatches.length <= 1) return [normalized];

  const weekStarts = Array.from(normalized.matchAll(new RegExp(weekRulePattern.source, "g")))
    .filter((match) => weekdayTextPattern.test(normalized.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 24)))
    .map((match) => match.index ?? 0);
  if (weekStarts.length > 1) return weekStarts.map((start, index) => normalized.slice(start, weekStarts[index + 1] ?? normalized.length).trim());

  const sharedWeeks = extractScheduleWeekRule(normalized.slice(0, weekdayMatches[0].index ?? 0));
  return weekdayMatches.map((match, index) => {
    const body = normalized.slice(index === 0 ? 0 : match.index, weekdayMatches[index + 1]?.index ?? normalized.length).trim();
    return index > 0 && sharedWeeks ? `${sharedWeeks} ${body}` : body;
  });
}

export function extractPeriodNumbers(value: string): PeriodNumbers | null {
  const normalized = normalizeScheduleText(value);
  const match = normalized.match(new RegExp(periodTextPattern.source));
  if (!match) return null;
  const numbers = match[0].match(/\d{1,2}/g)?.map(Number) ?? [];
  if (!numbers.length) return null;
  return { first: numbers[0], last: numbers[1] ?? numbers[0] };
}

export function periodTimeRange(value: string, school: string): [string, string] | null {
  const period = extractPeriodNumbers(value);
  if (!period) return null;
  const start = OFFICIAL_PERIOD_TIMES[school]?.[period.first - 1]?.[0];
  const end = OFFICIAL_PERIOD_TIMES[school]?.[period.last - 1]?.[1];
  return start && end ? [start, end] : null;
}


export function repairImportedSlot(slot: CourseSlot, school: string): CourseSlot {
  const combined = [slot.weeks, slot.location].filter((value) => !!value).join(' ');
  const weeks = extractScheduleWeekRule(combined) || slot.weeks?.trim() || undefined;
  const range = periodTimeRange(combined, school);
  const source = [slot.weeks, slot.location].find((value) => !!value && !!(extractScheduleWeekday(value) || periodTimeRange(value, school))) ?? '';
  const location = extractScheduleLocation(source);
  const next = JSON.parse(JSON.stringify(slot)) as CourseSlot;
  next.start = range?.[0] ?? slot.start; next.end = range?.[1] ?? slot.end; next.weeks = weeks;
  next.location = location || (source === slot.location ? location : slot.location);
  return next;
}

export function courseTitleCandidate(title: string): boolean {
  const value = title.normalize('NFKC').trim();
  return !!value && !/^(?:第\s*)?\d{1,2}\s*节\s*(?:[-—–~～至]\s*(?:第\s*)?\d{1,2}\s*节)?$/.test(value) &&
    !/^\d{1,2}:\d{2}\s*[-—–~～至]\s*\d{1,2}:\d{2}$/.test(value) && !/^(?:上午|下午|晚上|早晨|中午|节次|时间)$/.test(value);
}

export function courseSchool(course: WorkspaceEntry): string {
  return course.school || (((course.schedule ?? []) as CourseSlot[]).some((slot) => slot.source === 'bit') ? 'bit' : 'pku');
}
