type CalendarTask = {
  id: string;
  due?: string;
  dueTime?: string;
  plannedDate?: string;
  automationKey?: string;
};
type CalendarNode = { id: string; date: string; time: string; automationKey?: string };

export function manualCalendarItems<T extends CalendarTask, N extends CalendarNode>(data: { tasks: T[]; milestones: N[] }) {
  return [
    ...data.milestones.filter((node) => !node.automationKey && node.date)
      .map((item) => ({ kind: "milestone" as const, item, date: item.date, time: item.time })),
    ...data.tasks.flatMap((item) => {
      const date = item.due || item.plannedDate;
      if (item.automationKey || item.id.startsWith("stage:") || !date) return [];
      return [{ kind: "task" as const, item, date, time: item.due ? item.dueTime || "" : "" }];
    }),
  ];
}
