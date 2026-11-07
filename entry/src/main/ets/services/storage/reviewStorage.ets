import { Workspace, ReviewItem } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from './storage';
import { assertReviewItem } from '../../domain/workspace/ReviewDomain';
import { requireReview } from '../../domain/workspace/ReviewMutation';

export async function changeReview(change: (data: Workspace) => void): Promise<void> {
  const data = getWorkspace(); change(data); await saveWorkspace(data);
}
export async function changeReviewItem(id: string, change: (item: ReviewItem, data: Workspace) => void): Promise<void> {
  await changeReview((data) => {
    const item = requireReview(data, id); change(item, data); assertReviewItem(data.reviewPool?.items ?? [], item, false);
  });
}
