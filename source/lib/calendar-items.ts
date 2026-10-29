type CalendarTask = {
  id: string;
  due?: string;
  dueTime?: string;
  plannedDate?: string;
  showOnCalendar?: boolean;
  automationKey?: string;
};
type CalendarNode = { id: string; date: string; time: string; courseId?: string; assessmentType?: string; eventDateKind?: string; showOnCalendar?: boolean; automationKey?: string };

export function manualCalendarItems<T extends CalendarTask, N extends CalendarNode>(data: { tasks: T[]; milestones: N[] }) {
  return [
    ...data.milestones.filter((node) => !node.automationKey && !node.id.startsWith("stage:") && node.showOnCalendar !== false && node.date)
      .map((item) => ({ kind: "milestone" as const, item, date: item.date, time: item.time, category: item.courseId || item.assessmentType || item.eventDateKind === "deadline" ? "deadline" as const : "event" as const })),
    ...data.tasks.flatMap((item) => {
      const date = item.due || item.plannedDate;
      if (item.automationKey || item.id.startsWith("stage:") || item.showOnCalendar === false || !date) return [];
      return [{ kind: "task" as const, item, date, time: item.due ? item.dueTime || "" : "", category: item.due ? "deadline" as const : "task" as const }];
    }),
  ];
}
