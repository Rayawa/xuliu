import { pureReviewMatch, reviewSourceKeys, sameCourse, sameChapter, attachReviewStages } from './ReviewDomain';
import { Workspace, WorkspaceEntry } from '../../models/Workspace';

interface ReviewCandidate { kind: string; record: WorkspaceEntry; }

export function collectReviewSources(data: Workspace): number {
  if (!data.reviewPool) data.reviewPool = { version: 1, items: [], removedSources: [] };
  const sourceKeys = reviewSourceKeys(data);
  let count = 0;
  const candidates: ReviewCandidate[] = data.tasks.map((record): ReviewCandidate => ({ kind: 'task', record }))
    .concat(data.milestones.map((record): ReviewCandidate => ({ kind: 'milestone', record })));
  for (const candidate of candidates) {
    const source = candidate.record;
    const matched = pureReviewMatch(source, data);
    if (!matched) continue;
    const kind = candidate.kind;
    if (sourceKeys.has(`${kind}:${source.id}`)) continue;
    let item = data.reviewPool.items.find((v) => sameCourse(v.course, matched.course) && sameChapter(v.chapter, matched.chapter));
    if (!item) { item = matched; data.reviewPool.items.push(item); }
    item.sources.push({ kind, id: source.id }); sourceKeys.add(`${kind}:${source.id}`); count++;
  }
  return count + attachReviewStages(data);
}
