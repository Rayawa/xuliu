export function isCalendarMonth(value: string) {
  return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parts(value: string) {
  if (!isCalendarMonth(value)) throw new RangeError("Invalid calendar month");
  return value.split("-").map(Number);
}

export function shiftCalendarMonth(value: string, offset: number) {
  const [year, month] = parts(value);
  if (!Number.isInteger(offset)) throw new RangeError("Invalid month offset");
  const index = Math.max(12, Math.min(9999 * 12 + 11, year * 12 + month - 1 + offset));
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

export function calendarMonthDays(value: string): Date[] {
  const [year, month] = parts(value);
  const first = new Date(2000, month - 1, 1, 12);
  first.setFullYear(year);
  const last = new Date(first);
  last.setMonth(month, 0);
  const count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}
