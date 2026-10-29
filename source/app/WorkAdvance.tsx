"use client";

import { useEffect, useId, useRef, useState } from "react";
import { advanceWorkForDate, nextWorkDate, workProgressedOn, type TaskScheduleLike } from "@/lib/task-progress";
import { localDateKey } from "@/lib/finance";
import { submitFormOnEnter } from "./form-keyboard";
import "./course-events.css";

export function WorkProgressBadge({ work, date }: { work: TaskScheduleLike; date: string }) {
  if (!workProgressedOn(work, date)) return null;
  return <span className="workProgressBadge">✓ 今日已推进{!work.done && work.plannedDate && work.plannedDate > date && <small> · {work.plannedDate === nextWorkDate(date) ? "明天" : work.plannedDate}继续</small>}</span>;
}

export function WorkAdvanceButton({ work, date, disabled, onClick }: { work: TaskScheduleLike & { title: string }; date: string; disabled: boolean; onClick: () => void }) {
  if (work.done || work.status === "已完成") return null;
  const advanced = workProgressedOn(work, date);
  return <button type="button" className="softButton workAdvanceButton" disabled={disabled} aria-label={(advanced ? "调整继续日期：" : "今天先到这：") + work.title} onClick={onClick}>{advanced ? "调整继续日期" : "今天先到这"}</button>;
}

export function WorkAdvanceDialog({ work, onClose, onSave }: { work: TaskScheduleLike & { title: string }; onClose: () => void; onSave: (date: string, nextDate: string) => void }) {
  const date = localDateKey();
  const minimum = nextWorkDate(date);
  const [nextDate, setNextDate] = useState(workProgressedOn(work, date) && work.plannedDate && work.plannedDate > date ? work.plannedDate : minimum);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    dateRef.current?.focus();
    return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="courseEventDialog workAdvanceDialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="courseEventDialogHead"><h2 id={titleId}>今天先到这</h2><button type="button" className="courseEventClose" aria-label="关闭今日推进" onClick={onClose}>×</button></header>
    <form onKeyDown={submitFormOnEnter} onSubmit={(event) => {
      event.preventDefault();
      const currentDate = localDateKey();
      if (advanceWorkForDate(work, currentDate, nextDate) === work) { setError("请选择明天或之后的日期"); return; }
      onSave(currentDate, nextDate);
    }}>
      <p className="workAdvanceTitle">{work.title}</p>
      <p className="workAdvanceHint">标记今日已推进，下次继续同一条任务。</p>
      <div className="courseEventFields"><label className="courseEventWide"><span>下次继续日期</span><input ref={dateRef} type="date" required min={minimum} value={nextDate} onChange={(event) => { setNextDate(event.target.value); setError(""); }} /></label></div>
      {error && <p className="courseEventError" role="alert">{error}</p>}
      <div className="courseEventDialogActions"><button type="button" className="softButton" onClick={onClose}>取消</button><button type="submit" className="primaryButton">✓ 今日已推进</button></div>
    </form>
  </dialog>;
}
