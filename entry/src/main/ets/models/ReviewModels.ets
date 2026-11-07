import { ReviewItem, ReviewStep } from './Workspace';

export interface ReviewNames { course: string; chapter: string; }
export interface ReviewDraft extends ReviewNames { note: string; }
export interface ReviewAction { kind: string; itemId: string; stepId?: string; value?: boolean; }
export interface ReviewDeletion { kind: string; parentId: string; index: number; item?: ReviewItem; step?: ReviewStep; }
export interface ReviewRow { id: string; kind: string; title: string; item?: ReviewItem; }
export function emptyReviewItem(): ReviewItem { return { id: '', course: '', chapter: '', note: '', progress: 0, done: false, sources: [] }; }

export class ReviewListSource implements IDataSource {
  private rows: ReviewRow[] = [];
  private listeners: DataChangeListener[] = [];
  version: number = 0;
  totalCount(): number { return this.rows.length; }
  getData(index: number): ReviewRow { return this.rows[index]; }
  replace(rows: ReviewRow[]): void { this.rows = rows; this.version++; this.listeners.forEach((listener) => listener.onDataReloaded()); }
  registerDataChangeListener(listener: DataChangeListener): void { if (!this.listeners.includes(listener)) this.listeners.push(listener); }
  unregisterDataChangeListener(listener: DataChangeListener): void { this.listeners = this.listeners.filter((value) => value !== listener); }
}
