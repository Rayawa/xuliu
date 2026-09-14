const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export type TimetableSchool = "pku" | "bit";

export const officialPeriodTimes: Record<TimetableSchool, Record<number, readonly [string, string]>> = {
  pku: {
    1: ["08:00", "08:50"], 2: ["09:00", "09:50"], 3: ["10:10", "11:00"], 4: ["11:10", "12:00"],
    5: ["13:00", "13:50"], 6: ["14:00", "14:50"], 7: ["15:10", "16:00"], 8: ["16:10", "17:00"],
    9: ["17:10", "18:00"], 10: ["18:40", "19:30"], 11: ["19:40", "20:30"], 12: ["20:40", "21:30"],
  },
  bit: {
    1: ["08:00", "08:45"], 2: ["08:50", "09:35"], 3: ["09:55", "10:40"], 4: ["10:45", "11:30"],
    5: ["11:35", "12:20"], 6: ["13:20", "14:05"], 7: ["14:10", "14:55"], 8: ["15:15", "16:00"],
    9: ["16:05", "16:50"], 10: ["16:55", "17:40"], 11: ["18:30", "19:15"], 12: ["19:20", "20:05"],
    13: ["20:10", "20:55"],
  },
};

export type TimetableDisplayRow = { label: string; start: string; end: string };

export const officialTimetableRows: Record<TimetableSchool, TimetableDisplayRow[]> = {
  pku: [
    { label: "第1–2节", start: "08:00", end: "09:50" },
    { label: "第3–4节", start: "10:10", end: "12:00" },
    { label: "第5–6节", start: "13:00", end: "14:50" },
    { label: "第7–8节", start: "15:10", end: "17:00" },
    { label: "第9节", start: "17:10", end: "18:00" },
    { label: "第10–12节", start: "18:40", end: "21:30" },
  ],
  bit: [
    { label: "第1–2节 · 第一大节", start: "08:00", end: "09:35" },
    { label: "第3–5节 · 第二大节", start: "09:55", end: "12:20" },
    { label: "第6–7节 · 第三大节", start: "13:20", end: "14:55" },
    { label: "第8–10节 · 第四大节", start: "15:15", end: "17:40" },
    { label: "第11–13节 · 第五大节", start: "18:30", end: "20:55" },
  ],
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
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return map[token] ?? Number(token) ?? 0;
}

export function extractScheduleWeekRule(value: string) {
  const normalized = normalizeScheduleText(value);
  const matches = [...normalized.matchAll(new RegExp(weekRulePattern.source, "g"))].map((match) => match[0].replace(/\s+/g, ""));
  return [...new Set(matches)].join("、");
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

  const weekdayMatches = [...normalized.matchAll(new RegExp(weekdayTextPattern.source, "g"))];
  if (weekdayMatches.length <= 1) return [normalized];

  const weekStarts = [...normalized.matchAll(new RegExp(weekRulePattern.source, "g"))]
    .filter((match) => weekdayTextPattern.test(normalized.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 24)))
    .map((match) => match.index ?? 0);
  if (weekStarts.length > 1) return weekStarts.map((start, index) => normalized.slice(start, weekStarts[index + 1] ?? normalized.length).trim());

  const sharedWeeks = extractScheduleWeekRule(normalized.slice(0, weekdayMatches[0].index ?? 0));
  return weekdayMatches.map((match, index) => {
    const body = normalized.slice(index === 0 ? 0 : match.index, weekdayMatches[index + 1]?.index ?? normalized.length).trim();
    return index > 0 && sharedWeeks ? `${sharedWeeks} ${body}` : body;
  });
}

export function extractPeriodNumbers(value: string) {
  const normalized = normalizeScheduleText(value);
  const match = normalized.match(new RegExp(periodTextPattern.source));
  if (!match) return null;
  const numbers = match[0].match(/\d{1,2}/g)?.map(Number) ?? [];
  if (!numbers.length) return null;
  return { first: numbers[0], last: numbers[1] ?? numbers[0] };
}

export function periodTimeRange(value: string, school: TimetableSchool): [string, string] | null {
  const period = extractPeriodNumbers(value);
  if (!period) return null;
  const start = officialPeriodTimes[school][period.first]?.[0];
  const end = officialPeriodTimes[school][period.last]?.[1];
  return start && end ? [start, end] : null;
}

export function repairImportedTimetableSlot<T extends { start: string; end: string; location: string; weeks?: string }>(slot: T, school: TimetableSchool): T {
  const combined = [slot.weeks, slot.location].filter(Boolean).join(" ");
  const extractedWeeks = extractScheduleWeekRule(combined);
  const weeks = extractedWeeks || slot.weeks?.trim() || undefined;
  const range = periodTimeRange(combined, school);
  const structuredSource = [slot.weeks, slot.location].find((value) => Boolean(value && (extractScheduleWeekday(value) || periodTimeRange(value, school)))) ?? "";
  const extractedLocation = extractScheduleLocation(structuredSource);
  const fallbackLocation = structuredSource === slot.location ? extractedLocation : slot.location;
  return {
    ...slot,
    start: range?.[0] ?? slot.start,
    end: range?.[1] ?? slot.end,
    weeks,
    location: extractedLocation || fallbackLocation,
  };
}

export function timetableRowIndex(start: string, school: TimetableSchool) {
  const rows = officialTimetableRows[school];
  const exact = rows.findIndex((row, index) => start >= row.start && (index === rows.length - 1 || start < rows[index + 1].start));
  return exact >= 0 ? exact : 0;
}

function utcDate(dateKey: string) {
  const match = dateKey.match(localDatePattern);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(dateKey: string, days: number) {
  const date = utcDate(dateKey);
  if (!date) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function timetableWeekInfo(dateKey: string, termStartDate: string) {
  const date = utcDate(dateKey);
  const start = utcDate(termStartDate);
  if (!date || !start) return null;
  const elapsedDays = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const actualWeek = Math.floor(elapsedDays / 7) + 1;
  if (actualWeek < 1) return null;
  const timetableWeek = actualWeek <= 3 ? actualWeek - 4 : actualWeek - 3;
  const weekStartDate = addDays(termStartDate, (actualWeek - 1) * 7);
  return {
    actualWeek,
    timetableWeek,
    miniTerm: actualWeek <= 3,
    weekStartDate,
    weekEndDate: addDays(weekStartDate, 6),
  };
}

function weekSegments(rule: string) {
  return rule
    .normalize("NFKC")
    .replace(/[−－]/g, "-")
    .replace(/第/g, "")
    .replace(/[()（）]/g, " ")
    .replace(/[单双]\s*周?/g, "")
    .replace(/周次?|教学/g, "")
    .split(/[,，、;；/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function courseRunsInTimetableWeek(weeks: string | undefined, timetableWeek: number) {
  const rawRule = weeks?.trim();
  const rule = rawRule ? extractScheduleWeekRule(rawRule) || rawRule : "";
  if (!rule) return true;
  const parity = /单/.test(rule) ? "odd" : /双/.test(rule) ? "even" : null;
  const segments = weekSegments(rule);
  const hasNumbers = segments.some((segment) => /-?\d+/.test(segment));
  const included = !hasNumbers || segments.some((segment) => {
    const range = segment.match(/^(-?\d+)\s*(?:至|[—–~～-])\s*(-?\d+)$/);
    if (range) {
      const first = Number(range[1]);
      const last = Number(range[2]);
      return timetableWeek >= Math.min(first, last) && timetableWeek <= Math.max(first, last);
    }
    return (segment.match(/-?\d+/g) ?? []).some((value) => Number(value) === timetableWeek);
  });
  if (!included || !parity) return included;
  const odd = Math.abs(timetableWeek) % 2 === 1;
  return parity === "odd" ? odd : !odd;
}

export function isCourseTitleCandidate(title: string) {
  const value = title.normalize("NFKC").trim();
  if (!value) return false;
  return !/^(?:第\s*)?\d{1,2}\s*节\s*(?:[-—–~～至]\s*(?:第\s*)?\d{1,2}\s*节)?$/.test(value)
    && !/^\d{1,2}:\d{2}\s*[-—–~～至]\s*\d{1,2}:\d{2}$/.test(value)
    && !/^(?:上午|下午|晚上|早晨|中午|节次|时间)$/.test(value);
}
