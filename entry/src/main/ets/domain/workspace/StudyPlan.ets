import { pureReviewMatch, reviewSourceKeys, sameCourse, sameChapter } from './ReviewDomain';
import { Workspace, WorkspaceEntry } from '../../models/Workspace';
import { createEntry, localDate, uid } from './WorkspaceDomain';

export function collectReviewSources(data: Workspace): number {
  if (!data.reviewPool) data.reviewPool = { version: 1, items: [], removedSources: [] };
  const sourceKeys = reviewSourceKeys(data);
  let count = 0;
  for (const source of data.tasks.concat(data.milestones)) {
    const matched = pureReviewMatch(source, data);
    if (!matched) continue;
    const kind = data.tasks.some((v) => v.id === source.id) ? 'task' : 'milestone';
    if (sourceKeys.has(`${kind}:${source.id}`)) continue;
    let item = data.reviewPool.items.find((v) => sameCourse(v.course, matched.course) && sameChapter(v.chapter, matched.chapter));
    if (!item) { item = matched; data.reviewPool.items.push(item); }
    item.sources.push({ kind, id: source.id }); sourceKeys.add(`${kind}:${source.id}`); count++;
  }
  return count;
}

interface StageParent {
  kind: string;
  item: WorkspaceEntry;
}

export function plannedStages(data: Workspace, date: string): WorkspaceEntry[] {
  const stages: WorkspaceEntry[] = [];
  const sources = reviewSourceKeys(data);
  const parents: StageParent[] = data.tasks.filter((v) => v.mode === 'multi').map((item): StageParent => ({ kind: 'task', item }));
  data.milestones.filter((v) => v.courseId && v.mode === 'multi').forEach((item) => parents.push({ kind: 'milestone', item }));
  parents.forEach((parent) => {
    const item = parent.item;
    if (item.done || item.status === '已完成' || item.progressedDates?.length || item.plannedDate !== date ||
      item.dismissedTodayDate === date || sources.has(`${parent.kind}:${item.id}`)) return;
    const linked = data.tasks.concat(stages).some((task) =>
      (parent.kind === 'task' ? task.parentId === item.id : task.parentMilestoneId === item.id) &&
      task.mode !== 'multi' && (task.plannedDate === date || task.due === date || (!task.due && !task.plannedDate && task.today)));
    if (linked) return;
    const task = createEntry('tasks'); task.id = `stage:${uid()}`; task.title = `${item.title} · 阶段推进`.slice(0, 500);
    if (parent.kind === 'task') task.parentId = item.id; else task.parentMilestoneId = item.id;
    task.area = item.area ?? '生活'; task.source = item.title;
    task.plannedDate = date; task.today = date === localDate(); task.courseId = item.courseId;
    stages.push(task);
  });
  return stages;
}
