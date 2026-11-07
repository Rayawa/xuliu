import { Workspace, WorkspaceEntry } from '../../models/Workspace';
import { reviewSourceKeys } from './ReviewDomain';
import { localDate, createEntry, uid, defaultPlannedDate, workScheduledForDate, isToday, workCompleted, planWorkForDate } from './WorkspaceDomain';

interface StageParent { kind: string; item: WorkspaceEntry; }
interface RequestedPlan { plannedDate?: string; dismissedTodayDate?: string; }

/** Match the upstream reducer: a continuation does not create stages and formal/manual tasks keep their own deadlines. */
export function reconcileTaskStages(data: Workspace, date: string, previous?: Workspace): void {
  const sources = reviewSourceKeys(data); const tasks = new Map(data.tasks.map((item): [string, WorkspaceEntry] => [item.id, item]));
  const nodes = new Map(data.milestones.map((item): [string, WorkspaceEntry] => [item.id, item]));
  const oldTasks = new Map((previous?.tasks ?? []).map((item): [string, WorkspaceEntry] => [item.id, item]));
  const oldNodes = new Map((previous?.milestones ?? []).map((item): [string, WorkspaceEntry] => [item.id, item]));
  const requested = new Map<string, RequestedPlan>();
  data.tasks.forEach((item) => requested.set(`task:${item.id}`, { plannedDate: item.plannedDate, dismissedTodayDate: item.dismissedTodayDate }));
  data.milestones.forEach((item) => requested.set(`milestone:${item.id}`, { plannedDate: item.plannedDate, dismissedTodayDate: item.dismissedTodayDate }));
  for (const oldStage of previous?.tasks ?? []) {
    if (oldStage.mode === 'multi' || workCompleted(oldStage)) continue;
    const kind = oldStage.parentId ? 'task' : 'milestone'; const parentId = oldStage.parentId || oldStage.parentMilestoneId;
    if (!parentId || sources.has(`task:${oldStage.id}`) || sources.has(`${kind}:${parentId}`)) continue;
    const oldParent = (kind === 'task' ? oldTasks : oldNodes).get(parentId); const parent = (kind === 'task' ? tasks : nodes).get(parentId);
    const stage = tasks.get(oldStage.id); const requestedParent = requested.get(`${kind}:${parentId}`);
    if (!oldParent || !parent || !stage || parent.progressedDates?.length || parent.mode !== 'multi' || workCompleted(parent)) continue;
    const matches = !!oldParent.plannedDate && defaultPlannedDate(oldStage) === oldParent.plannedDate;
    if (!matches && !workScheduledForDate(oldStage, date) && !isToday(oldStage, date)) continue;
    if (stage.dismissedTodayDate !== oldStage.dismissedTodayDate && stage.dismissedTodayDate === date) parent.dismissedTodayDate = date;
    else if (oldStage.dismissedTodayDate && !stage.dismissedTodayDate && stage.plannedDate) planWorkForDate(parent, stage.plannedDate);
    else if (oldStage.id.startsWith('stage:') && requestedParent && requestedParent.dismissedTodayDate !== oldParent.dismissedTodayDate) {
      if (requestedParent.dismissedTodayDate === date) stage.dismissedTodayDate = date;
      else if (requestedParent.plannedDate) planWorkForDate(stage, requestedParent.plannedDate);
    }
  }
  for (const oldStage of previous?.tasks ?? []) {
    if (!oldStage.id.startsWith('stage:')) continue;
    const kind = oldStage.parentId ? 'task' : 'milestone'; const parentId = oldStage.parentId || oldStage.parentMilestoneId;
    if (!parentId || sources.has(`task:${oldStage.id}`) || sources.has(`${kind}:${parentId}`)) continue;
    const oldParent = (kind === 'task' ? oldTasks : oldNodes).get(parentId); const parent = (kind === 'task' ? tasks : nodes).get(parentId);
    if (!oldParent || !parent || parent.progressedDates?.length || parent.mode !== 'multi' || !oldStage.plannedDate || oldParent.plannedDate !== oldStage.plannedDate) continue;
    const stage = tasks.get(oldStage.id); if (oldStage.done && stage) continue;
    if (parent.plannedDate !== oldParent.plannedDate) {
      if (stage && !stage.done && stage.plannedDate === oldStage.plannedDate) { stage.plannedDate = parent.plannedDate; stage.today = parent.plannedDate === date; }
    } else if (!stage || stage.plannedDate !== oldStage.plannedDate) parent.plannedDate = stage?.plannedDate;
  }
  const parents: StageParent[] = data.tasks.filter((item) => item.mode === 'multi').map((item): StageParent => ({ kind: 'task', item }));
  data.milestones.filter((item) => !!item.courseId && item.mode === 'multi').forEach((item) => parents.push({ kind: 'milestone', item }));
  for (const parent of parents) {
    const item = parent.item;
    if (item.progressedDates?.length || sources.has(`${parent.kind}:${item.id}`) || item.plannedDate !== date || item.dismissedTodayDate === date || workCompleted(item)) continue;
    const linked = (task: WorkspaceEntry): boolean => parent.kind === 'task' ? task.parentId === item.id : task.parentMilestoneId === item.id;
    if (data.tasks.some((task) => linked(task) && task.mode !== 'multi' && (workScheduledForDate(task, date) || isToday(task, date)))) continue;
    const reusable = data.tasks.find((task) => task.id.startsWith('stage:') && linked(task) && task.mode !== 'multi' && !task.done && !task.plannedDate && !task.due);
    if (reusable) { planWorkForDate(reusable, date); reusable.today = true; continue; }
    const stage = createEntry('tasks'); stage.id = `stage:${uid()}`; stage.title = `${item.title} · 阶段推进`.slice(0, 500);
    stage.area = item.area; stage.source = item.title; stage.courseId = item.courseId;
    if (parent.kind === 'task') stage.parentId = item.id; else stage.parentMilestoneId = item.id;
    stage.plannedDate = date; stage.today = true; data.tasks.push(stage);
  }
}

export function reconcileCompletionDates(data: Workspace, previous: Workspace, day: string = localDate()): void {
  for (const kind of ['tasks', 'milestones']) {
    const current = kind === 'tasks' ? data.tasks : data.milestones; const before = kind === 'tasks' ? previous.tasks : previous.milestones;
    const originals = new Map(before.map((item): [string, WorkspaceEntry] => [item.id, item]));
    for (const item of current) {
      if (!workCompleted(item)) { item.completedDate = undefined; continue; }
      const original = originals.get(item.id); if (original && !workCompleted(original)) item.completedDate = day;
    }
  }
}
