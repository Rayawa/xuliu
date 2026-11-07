import { ASSESSMENT_LABELS, ASSESSMENT_TYPES, EVENT_DATE_KINDS, EVENT_DATE_LABELS } from '../../config/constants';
import { Workspace, WorkspaceEntry } from '../../models/Workspace';
import { courseTitleCandidate } from '../courses/TimetableRules';

export function eventCourses(courses: WorkspaceEntry[]): WorkspaceEntry[] {
  return courses.filter((course) => courseTitleCandidate(course.title));
}

export function assessmentLabel(value?: string): string {
  return ASSESSMENT_LABELS[ASSESSMENT_TYPES.indexOf(value ?? '')] ?? '';
}

export function eventDateKindLabel(value?: string): string {
  return EVENT_DATE_LABELS[EVENT_DATE_KINDS.indexOf(value ?? '')] ?? '';
}

export function eventDateLabel(item: WorkspaceEntry): string {
  if (!item.date) return '待定';
  const meaning = item.eventDateKind === 'deadline' ? '截止 ' : item.eventDateKind === 'occurs' ? '发生 ' : '';
  return `${meaning}${item.date}${item.time ? ' ' + item.time : ''}`;
}

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export function migrateCourseEvents(data: Workspace): void {
  const courses = eventCourses(data.courses);
  const names = courses.map((course) => normalizedTitle(course.title));
  for (const item of data.milestones) {
    if (item.courseId || item.linkedCourseId || item.courseLinkReviewed) continue;
    const title = normalizedTitle(item.title);
    let match = -1;
    for (let index = 0; index < names.length; index++) {
      if (!names[index] || !title.includes(names[index])) continue;
      if (match !== -1) {
        match = -1;
        break;
      }
      match = index;
    }
    if (match !== -1) item.linkedCourseId = courses[match].id;
  }
}
