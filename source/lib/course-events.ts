import { isCourseTitleCandidate } from "./timetable.ts";

export type AssessmentType = "exam" | "quiz" | "submission" | "presentation";
export type EventDateKind = "occurs" | "deadline";
export type CourseEventFields = { linkedCourseId?: string; assessmentType?: AssessmentType; eventDateKind?: EventDateKind; courseLinkReviewed?: boolean };
type CourseIdentity = { id: string; title: string };

export function eventCourseChoices<T extends CourseIdentity>(courses: T[]) {
  return courses.filter((course) => isCourseTitleCandidate(course.title));
}
type EventLike = CourseEventFields & { courseId?: string; title: string; date: string; time: string };

export const assessmentTypeOptions: { value: AssessmentType; label: string }[] = [
  { value: "exam", label: "考试" },
  { value: "quiz", label: "测验" },
  { value: "submission", label: "作业提交" },
  { value: "presentation", label: "报告 / 展示" },
];

export function assessmentTypeLabel(value?: AssessmentType) {
  return assessmentTypeOptions.find((option) => option.value === value)?.label ?? "";
}

export function eventCourseLabel(node: Pick<CourseEventFields, "linkedCourseId">, courses: CourseIdentity[]) {
  if (!node.linkedCourseId) return "";
  const course = courses.find((item) => item.id === node.linkedCourseId);
  return course ? `课内学习 / ${course.title}` : "课内学习 / 课程已移除";
}

export function eventDateLabel(node: Pick<EventLike, "date" | "time" | "eventDateKind">) {
  if (!node.date) return "待定";
  const kind = node.eventDateKind === "deadline" ? "截止 " : node.eventDateKind === "occurs" ? "发生 " : "";
  return `${kind}${node.date}${node.time ? ` ${node.time}` : ""}`;
}

const normalizedTitle = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export function migrateCourseEvents<T extends { courses: CourseIdentity[]; milestones: EventLike[] }>(state: T): T {
  let changed = false;
  const courses = eventCourseChoices(state.courses).map((course) => ({ ...course, name: normalizedTitle(course.title) }));
  const milestones = state.milestones.map((node) => {
    if (node.courseId || node.linkedCourseId || node.courseLinkReviewed) return node;
    const title = normalizedTitle(node.title);
    const matches = courses.filter((course) => title.includes(course.name));
    if (matches.length !== 1) return node;
    changed = true;
    return { ...node, linkedCourseId: matches[0].id };
  });
  return changed ? { ...state, milestones } : state;
}
