"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { reviewPoolItemVisibleOnDate, type ReviewPoolItem } from "../lib/course-review-pool";
import "./course-review-pool.css";

type ReviewPoolChange = (id: string, patch: Partial<Pick<ReviewPoolItem, "progress" | "note" | "done" | "selectedDate">>) => void;

type ReviewPoolProps = {
  items: ReviewPoolItem[];
  today: string;
  readOnly: boolean;
  onChange: ReviewPoolChange;
};

export function ReviewPoolEntry({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="panel reviewPoolEntry" onClick={onOpen} aria-haspopup="dialog">
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5.5C9 3.5 5.5 3.5 3 4.5v14c2.5-1 6-1 9 1 3-2 6.5-2 9-1v-14c-2.5-1-6-1-9 1Zm0 0v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span>课程复习池</span>
    <span className="reviewPoolEntryArrow" aria-hidden="true">↗</span>
  </button>;
}

function ReviewPoolCheck({ item, readOnly, onChange }: { item: ReviewPoolItem; readOnly: boolean; onChange: ReviewPoolChange }) {
  return <button type="button" role="checkbox" aria-checked={item.done}
    aria-label={`${item.done ? "标记未完成" : "标记完成"}：${item.course} ${item.chapter}`}
    className="checkButton reviewPoolCheck" disabled={readOnly}
    onClick={() => onChange(item.id, { done: !item.done })}>{item.done ? "✓" : ""}</button>;
}

function ReviewPoolRow({ item, today, readOnly, onChange, expanded, onToggle, initialFocusRef, renderSources }: {
  item: ReviewPoolItem;
  today: string;
  readOnly: boolean;
  onChange: ReviewPoolChange;
  expanded: boolean;
  onToggle: () => void;
  initialFocusRef?: RefObject<HTMLButtonElement | null>;
  renderSources?: (item: ReviewPoolItem) => ReactNode;
}) {
  const detailId = useId();
  const selectedToday = item.selectedDate === today;
  return <li className={`reviewPoolItem${item.done ? " reviewPoolDone" : ""}`}>
    <div className="reviewPoolRow">
      <ReviewPoolCheck item={item} readOnly={readOnly} onChange={onChange} />
      <button type="button" className="reviewPoolChapter" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
        aria-label={`${item.course} ${item.chapter}，${expanded ? "收起" : "展开"}详情`} ref={initialFocusRef} onClick={onToggle}>
        <span>{item.chapter}</span>
        {item.done ? <span className="reviewPoolProgressLabel">已完成</span> : item.progress > 0 ? <span className="reviewPoolProgressLabel">{item.progress}%</span> : null}
        <span className={`reviewPoolDisclosure${expanded ? " reviewPoolDisclosureOpen" : ""}`} aria-hidden="true">›</span>
      </button>
      {selectedToday ? <button type="button" className="softButton reviewPoolChoose reviewPoolSelected" disabled={readOnly}
        aria-label={`取消今天学习：${item.course} ${item.chapter}`} onClick={() => onChange(item.id, { selectedDate: undefined })}>取消今天</button>
        : !item.done ? <button type="button" className="softButton reviewPoolChoose" disabled={readOnly}
          aria-label={`今天学：${item.course} ${item.chapter}`} onClick={() => onChange(item.id, { selectedDate: today })}>今天学</button> : null}
    </div>
    {expanded && <div className="reviewPoolDetails" id={detailId}>
      <label className="reviewPoolProgressInput"><span>进度 <output>{item.progress}%</output></span>
        <input type="range" min="0" max="100" step="1" value={item.progress} disabled={readOnly}
          aria-label={`${item.course} ${item.chapter} 进度`}
          onChange={(event) => onChange(item.id, { progress: Number(event.target.value) })} />
      </label>
      <label className="reviewPoolNote"><span>备注</span>
        <textarea value={item.note} readOnly={readOnly} maxLength={4000} rows={3}
          aria-label={`${item.course} ${item.chapter} 备注`} onChange={(event) => onChange(item.id, { note: event.target.value })} />
      </label>
      {item.sources.length > 0 && renderSources && <div className="reviewPoolSources"><h4>原有记录</h4>{renderSources(item)}</div>}
    </div>}
  </li>;
}

export function CourseReviewPoolDialog({ items, today, readOnly, onChange, onClose, renderSources, initialItemId }: ReviewPoolProps & {
  onClose: () => void;
  renderSources?: (item: ReviewPoolItem) => ReactNode;
  initialItemId?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [expanded, setExpanded] = useState(() => new Set(initialItemId ? [initialItemId] : []));
  const courses = new Map<string, ReviewPoolItem[]>();
  for (const item of items) {
    const courseItems = courses.get(item.course);
    if (courseItems) courseItems.push(item);
    else courses.set(item.course, [item]);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    initialFocusRef.current?.focus();
    initialFocusRef.current?.scrollIntoView({ block: "center" });
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog className="reviewPoolDialog" ref={dialogRef} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="reviewPoolHead"><h2 id={titleId}>课程复习池</h2>
      <button type="button" className="reviewPoolClose" aria-label="关闭课程复习池" onClick={onClose}>×</button>
    </header>
    <div className="reviewPoolContents">
      {[...courses].map(([course, courseItems]) => <section className="reviewPoolCourse" key={course} aria-label={course}>
        <h3>{course}</h3>
        <ul className="reviewPoolList">{courseItems.map((item) => <ReviewPoolRow key={item.id} item={item} today={today} readOnly={readOnly} onChange={onChange}
          expanded={expanded.has(item.id)} initialFocusRef={initialItemId === item.id ? initialFocusRef : undefined} renderSources={renderSources}
          onToggle={() => setExpanded((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />)}</ul>
      </section>)}
    </div>
  </dialog>;
}

export function ReviewPoolToday({ items, today, readOnly, onChange, onOpenItem }: ReviewPoolProps & { onOpenItem: (id: string) => void }) {
  const selected = items.filter((item) => reviewPoolItemVisibleOnDate(item, today));
  if (!selected.length) return null;
  return <section className="panel reviewPoolToday" aria-label="今日复习">
    <h2>今日复习</h2>
    <ul className="reviewPoolList">{selected.map((item) => <li className={`reviewPoolTodayRow${item.done ? " reviewPoolDone" : ""}`} key={item.id}>
      <ReviewPoolCheck item={item} readOnly={readOnly} onChange={onChange} />
      <button type="button" className="reviewPoolTodayTitle" aria-haspopup="dialog" onClick={() => onOpenItem(item.id)}>
        <span>{item.course} · {item.chapter}</span>
        {item.done ? <span className="reviewPoolProgressLabel">已完成</span> : item.progress > 0 ? <span className="reviewPoolProgressLabel">{item.progress}%</span> : null}
      </button>
      <button type="button" className="reviewPoolTodayCancel" disabled={readOnly} aria-label={`取消今天学习：${item.course} ${item.chapter}`}
        onClick={() => onChange(item.id, { selectedDate: undefined })}>取消今天</button>
    </li>)}</ul>
  </section>;
}
