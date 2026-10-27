"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createReviewPoolItem, reviewPoolItemVisibleOnDate, sameReviewCourse, type ReviewPoolItem } from "../lib/course-review-pool";
import { submitFormOnEnter } from "./form-keyboard";
import "./course-review-pool.css";

type ReviewPoolChange = (id: string, patch: Partial<Pick<ReviewPoolItem, "note" | "done" | "selectedDate">>) => void;

type ReviewPoolProps = {
  items: ReviewPoolItem[];
  today: string;
  readOnly: boolean;
  onChange: ReviewPoolChange;
};

function ReviewPoolPicker({ options, value, onChange, label, placeholder, listLabel, expandLabel }: {
  options: string[]; value: string; onChange: (value: string) => void;
  label: string; placeholder: string; listLabel: string; expandLabel: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const choices = [...new Set(options)].filter((name) => {
    if (showAll || !query) return true;
    let index = 0;
    for (const letter of name.normalize("NFKC").toLowerCase()) if (letter === query[index]) index++;
    return index === query.length;
  });
  const active = Math.min(activeIndex, choices.length - 1);
  useEffect(() => {
    if (open) activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, active, query, showAll]);
  const choose = (name: string) => { onChange(name); setOpen(false); setShowAll(false); };
  return <div className="reviewPoolCoursePicker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <div className="reviewPoolCourseInput"><input ref={inputRef} autoFocus role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open}
      aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      required maxLength={500} value={value} placeholder={placeholder} onFocus={() => setOpen(true)}
      onChange={(event) => { onChange(event.target.value); setShowAll(false); setActiveIndex(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); event.stopPropagation();
          if (!open) { setOpen(true); setActiveIndex(0); }
          else if (choices.length) setActiveIndex((active + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
        } else if (event.key === "Enter" && open && active >= 0) {
          event.preventDefault(); event.stopPropagation(); choose(choices[active]);
        } else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      }} />
      <button type="button" className="reviewPoolAllCourses" aria-label={expandLabel} aria-expanded={open && showAll} aria-controls={open ? listId : undefined}
        onMouseDown={(event) => event.preventDefault()} onClick={() => { inputRef.current?.focus(); setShowAll(true); setActiveIndex(0); setOpen(!(open && showAll)); }}>⌄</button>
    </div>
    {open && <div className="reviewPoolCourseOptions" id={listId} role="listbox" aria-label={listLabel}>{choices.map((name, index) => <button type="button" role="option" tabIndex={-1} ref={index === active ? activeOptionRef : undefined} id={`${listId}-${index}`} key={name} aria-selected={index === active}
      onMouseDown={(event) => event.preventDefault()} onClick={() => choose(name)}>{name}</button>)}{!choices.length && <span>无匹配项，可直接填写</span>}</div>}
  </div>;
}

export function DeferStudyDialog({ course, items, onSave, onClose }: {
  course: string; items: ReviewPoolItem[]; onSave: (draft: { chapter: string; note: string }) => void; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState({ chapter: "", note: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector("input")?.focus();
    return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="reviewPoolDialog reviewPoolDeferDialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="reviewPoolHead"><h2 id={titleId}>以后再学</h2><button type="button" className="reviewPoolClose" aria-label="关闭以后再学" onClick={onClose}>×</button></header>
    <div className="reviewPoolContents"><form className="reviewPoolAddForm" onKeyDown={submitFormOnEnter} onSubmit={(event) => {
      event.preventDefault();
      try { onSave(draft); } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法放入复习池"); }
    }}>
      <div className="reviewPoolCourseField"><span>课程</span><strong className="reviewPoolDeferCourse">{course}</strong></div>
      <div className="reviewPoolCourseField"><span>复习项目</span><ReviewPoolPicker options={items.filter((item) => !item.done && sameReviewCourse(item.course, course)).map((item) => item.chapter)} value={draft.chapter}
        label="以后再学的章节" placeholder="选择或填写章节" listLabel="已有复习项目" expandLabel="展开已有复习项目" onChange={(chapter) => { setDraft({ ...draft, chapter }); setError(""); }} /></div>
      <label className="reviewPoolAddNote"><span>备注（可选）</span><textarea aria-label="以后再学备注" rows={2} maxLength={4000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="reviewPoolAddActions"><button type="button" className="textButton" onClick={onClose}>取消</button><button type="submit" className="primaryButton">放入复习池</button></div>
    </form></div>
  </dialog>;
}

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

function ReviewPoolRow({ item, today, readOnly, onChange, onDelete, expanded, onToggle, initialFocusRef, renderSources }: {
  item: ReviewPoolItem;
  today: string;
  readOnly: boolean;
  onChange: ReviewPoolChange;
  onDelete: () => void;
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
        {item.done && <span className="reviewPoolProgressLabel">已完成</span>}
        <span className={`reviewPoolDisclosure${expanded ? " reviewPoolDisclosureOpen" : ""}`} aria-hidden="true">›</span>
      </button>
      {selectedToday ? <button type="button" className="softButton reviewPoolChoose reviewPoolSelected" disabled={readOnly}
        aria-label={`取消今天学习：${item.course} ${item.chapter}`} onClick={() => onChange(item.id, { selectedDate: undefined })}>取消今天</button>
        : !item.done ? <button type="button" className="softButton reviewPoolChoose" disabled={readOnly}
          aria-label={`今天学：${item.course} ${item.chapter}`} onClick={() => onChange(item.id, { selectedDate: today })}>今天学</button> : null}
    </div>
    {expanded && <div className="reviewPoolDetails" id={detailId}>
      <label className="reviewPoolNote"><span>备注</span>
        <textarea value={item.note} readOnly={readOnly} maxLength={4000} rows={3}
          aria-label={`${item.course} ${item.chapter} 备注`} onChange={(event) => onChange(item.id, { note: event.target.value })} />
      </label>
      {item.sources.length > 0 && renderSources && <div className="reviewPoolSources"><h4>原有记录</h4>{renderSources(item)}</div>}
      {!readOnly && <button type="button" className="reviewPoolDelete" aria-label={`删除复习项目：${item.course} ${item.chapter}`} onClick={onDelete}>删除项目</button>}
    </div>}
  </li>;
}

export function CourseReviewPoolDialog({ items, today, readOnly, onChange, onCreate, onDelete, onRestore, courseNames, onClose, renderSources, initialItemId }: ReviewPoolProps & {
  onCreate: (item: ReviewPoolItem) => void;
  onDelete: (id: string) => void;
  onRestore: (item: ReviewPoolItem, index: number) => void;
  courseNames: string[];
  onClose: () => void;
  renderSources?: (item: ReviewPoolItem) => ReactNode;
  initialItemId?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const createButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ course: "", chapter: "", note: "" });
  const [removed, setRemoved] = useState<{ item: ReviewPoolItem; index: number } | null>(null);
  const [undoError, setUndoError] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set(initialItemId ? [initialItemId] : []));
  const courses = new Map<string, ReviewPoolItem[]>();
  for (const item of items) {
    const courseItems = courses.get(item.course);
    if (courseItems) courseItems.push(item);
    else courses.set(item.course, [item]);
  }

  useEffect(() => {
    if (removed) undoButton.current?.focus();
  }, [removed]);

  useEffect(() => {
    if (removed && items.some((item) => item.id === removed.item.id)) { initialFocusRef.current?.focus(); setRemoved(null); }
  }, [items, removed]);

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
    <header className="reviewPoolHead"><h2 id={titleId}>课程复习池</h2><div className="reviewPoolHeadActions">
      {!readOnly && <button type="button" ref={createButton} className="softButton reviewPoolAddButton" disabled={items.length >= 500} aria-expanded={adding} onClick={() => { setAdding(!adding); setError(""); }}>＋ 新增项目</button>}
      <button type="button" className="reviewPoolClose" aria-label="关闭课程复习池" onClick={onClose}>×</button></div>
    </header>
    <div className="reviewPoolContents">
      {removed && <div className="reviewPoolUndo"><span role="status">已删除 {removed.item.course} · {removed.item.chapter}</span><button type="button" ref={undoButton} className="textButton" onClick={() => {
        try { createReviewPoolItem(items, removed.item, removed.item.id); } catch (cause) { setUndoError(cause instanceof Error ? cause.message : "暂时无法恢复"); return; }
        setUndoError(""); onRestore(removed.item, removed.index);
      }}>撤销删除</button>{undoError && <p role="alert">{undoError}</p>}</div>}
      {adding && !readOnly && <form className="reviewPoolAddForm" onKeyDown={submitFormOnEnter} onSubmit={(event) => {
        event.preventDefault();
        try {
          const item = createReviewPoolItem(items, draft, crypto.randomUUID());
          onCreate(item);
          setDraft({ course: item.course, chapter: "", note: "" });
          setAdding(false);
          setError("");
          createButton.current?.focus();
        } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法添加"); }
      }}>
        <div className="reviewPoolCourseField"><span>课程</span><ReviewPoolPicker options={courseNames} value={draft.course} label="复习课程" placeholder="选择或输入课程" listLabel="可选课程" expandLabel="展开全部课程" onChange={(course) => { setDraft({ ...draft, course }); setError(""); }} /></div>
        <label><span>复习项目</span><input aria-label="复习项目" required maxLength={500} placeholder="章节或学习内容" value={draft.chapter} onChange={(event) => { setDraft({ ...draft, chapter: event.target.value }); setError(""); }} /></label>
        <label className="reviewPoolAddNote"><span>备注（可选）</span><textarea aria-label="新复习项目备注" rows={2} maxLength={4000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="reviewPoolAddActions"><button type="button" className="textButton" onClick={() => { setAdding(false); createButton.current?.focus(); }}>取消</button><button type="submit" className="primaryButton">加入复习池</button></div>
      </form>}
      {[...courses].map(([course, courseItems]) => <section className="reviewPoolCourse" key={course} aria-label={course}>
        <h3>{course}</h3>
        <ul className="reviewPoolList">{courseItems.map((item) => <ReviewPoolRow key={item.id} item={item} today={today} readOnly={readOnly} onChange={onChange}
          onDelete={() => { setRemoved({ item, index: items.findIndex((current) => current.id === item.id) }); setUndoError(""); onDelete(item.id); }}
          expanded={expanded.has(item.id)} initialFocusRef={initialItemId === item.id || removed?.item.id === item.id ? initialFocusRef : undefined} renderSources={renderSources}
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
        {item.done && <span className="reviewPoolProgressLabel">已完成</span>}
      </button>
      <button type="button" className="reviewPoolTodayCancel" disabled={readOnly} aria-label={`取消今天学习：${item.course} ${item.chapter}`}
        onClick={() => onChange(item.id, { selectedDate: undefined })}>取消今天</button>
    </li>)}</ul>
  </section>;
}
