const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  const rule = weeks?.trim();
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
