import { academicCourseKey, academicCourseTitle, type AcademicImportPreset, type CourseSlot, type ImportedCourse } from "./academic-import.ts";

type ExistingCourse = { id: string; title: string; school?: AcademicImportPreset; schedule: CourseSlot[] };
const schoolOf = (course: ExistingCourse) => course.school ?? (course.schedule.some((slot) => slot.source === "bit") ? "bit" : "pku");
const slotKey = (slot: Omit<CourseSlot, "id">) => JSON.stringify([slot.weekday, slot.start, slot.end, slot.location.trim(), slot.weeks?.trim() ?? ""]);

export function updateAcademicCourses<T extends ExistingCourse>(
  original: T[], drafts: ImportedCourse[],
  options: { replaceSchedules: boolean; id: () => string; create: (draft: ImportedCourse, schedule: CourseSlot[]) => T },
): T[] {
  const courses = [...original];
  for (const draft of drafts) {
    const key = academicCourseKey(draft.title);
    if (!key || !draft.schedule.length) continue;
    const indexes = courses.map((course, index) => ({ course, index }))
      .filter(({ course }) => schoolOf(course) === draft.school && academicCourseKey(course.title) === key)
      .map(({ index }) => index);
    if (!indexes.length) {
      courses.push(options.create({ ...draft, title: academicCourseTitle(draft.title) }, draft.schedule.map((slot) => ({ ...slot, id: options.id() }))));
      continue;
    }
    // Keep all existing course IDs and their notes, even if older imports made duplicate subjects.
    // Place the consolidated timetable on the first subject; retain manual slots on every subject.
    const primaryIndex = indexes[0];
    const previousSlots = indexes.flatMap((index) => courses[index].schedule);
    for (const index of indexes) {
      const existing = courses[index];
      const retained = options.replaceSchedules
        ? existing.schedule.filter((slot) => slot.source === "manual" || (slot.source && slot.source !== draft.school && slot.source !== "ics"))
        : [...existing.schedule];
      if (index === primaryIndex) {
        const seen = new Set(retained.map(slotKey));
        for (const slot of draft.schedule) {
          if (seen.has(slotKey(slot))) continue;
          const oldSlot = previousSlots.find((item) => slotKey(item) === slotKey(slot));
          retained.push({ ...slot, id: oldSlot?.id ?? options.id() });
          seen.add(slotKey(slot));
        }
      }
      courses[index] = { ...existing, title: academicCourseTitle(draft.title), schedule: retained };
    }
  }
  return courses;
}

export function courseContentPreserved<T extends ExistingCourse>(before: T[], after: T[]) {
  return before.every((course) => {
    const current = after.find((item) => item.id === course.id);
    if (!current) return false;
    const { title: _oldTitle, schedule: _oldSchedule, ...oldContent } = course;
    const { title: _newTitle, schedule: _newSchedule, ...newContent } = current;
    return JSON.stringify(oldContent) === JSON.stringify(newContent);
  });
}
