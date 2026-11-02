"use client";

import { useEffect, useId, useRef, useState } from "react";
import { assessmentTypeOptions, eventCourseChoices, type AssessmentType, type EventDateKind } from "@/lib/course-events";
import { submitFormOnEnter } from "./form-keyboard";
import { isValidLocalDate, isValidLocalTime, localDateKey } from "@/lib/finance";
import { defaultTaskPlannedDate, newTaskPlannedDate, workDateChangeAllowed, workDateInputMinimum } from "@/lib/task-progress";
import type { CourseNode } from "./CourseNodes";
import "./course-events.css";

export function CourseEventDialog({ node, courses, readOnly, onSave, onClose }: {
  node?: CourseNode;
  courses: { id: string; title: string }[];
  readOnly: boolean;
  onSave: (node: CourseNode) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errorId = useId();
  const [form, setForm] = useState(() => ({
    title: node?.title ?? "", date: node?.date ?? localDateKey(), time: node?.time ?? "",
    location: node?.location ?? "", requirements: node?.requirements ?? "", area: node?.area ?? "工作",
    linkedCourseId: node?.linkedCourseId ?? "", assessmentType: node?.assessmentType ?? "",
    eventDateKind: node ? node.eventDateKind ?? "" : "occurs", plannedDate: node?.plannedDate ?? "",
  }));
  const [error, setError] = useState("");
  const [alsoTask, setAlsoTask] = useState(node?.alsoTask ?? false);
  const [showOnCalendar, setShowOnCalendar] = useState(node?.showOnCalendar ?? true);
  const courseChoices = eventCourseChoices(courses);
  const currentDate = localDateKey();
  const schedule = { ...node, alsoTask, date: form.date, plannedDate: form.plannedDate || undefined, ...(form.plannedDate !== (node?.plannedDate ?? "") ? { dismissedTodayDate: undefined } : {}) };
  const plannedDate = alsoTask ? (node?.alsoTask && form.date === node.date ? defaultTaskPlannedDate(schedule) : newTaskPlannedDate(schedule, currentDate)) ?? "" : form.plannedDate;
  const patch = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    if (node?.courseId) { setError("请在课程任务入口修改这条记录"); return; }
    if (!form.title.trim()) { setError("请填写事项名称"); titleRef.current?.focus(); return; }
    if (!workDateChangeAllowed(form.date, localDateKey(), node?.date) || !workDateChangeAllowed(plannedDate, localDateKey(), node?.alsoTask ? defaultTaskPlannedDate(node) : node?.plannedDate)) { setError("日期和计划推进日不能早于今天"); return; }
    if (form.date && !isValidLocalDate(form.date) || form.plannedDate && !isValidLocalDate(form.plannedDate)) { setError("请选择有效日期"); return; }
    if (form.time && (!form.date || !isValidLocalTime(form.time))) { setError("填写时间前请先选择日期"); return; }
    if (form.linkedCourseId && form.linkedCourseId !== node?.linkedCourseId && !courseChoices.some((course) => course.id === form.linkedCourseId)) { setError("请选择有效的课程"); return; }
    const saved: CourseNode = {
      ...(node ?? { id: crypto.randomUUID(), done: false }),
      title: form.title.trim(), date: form.date, time: form.time, location: form.location, requirements: form.requirements,
      area: form.linkedCourseId ? "课内" : form.area as CourseNode["area"],
      courseLinkReviewed: true,
      showOnCalendar,
    };
    if (form.linkedCourseId) saved.linkedCourseId = form.linkedCourseId;
    else delete saved.linkedCourseId;
    if (form.assessmentType) saved.assessmentType = form.assessmentType as AssessmentType;
    else delete saved.assessmentType;
    if (form.eventDateKind) saved.eventDateKind = form.eventDateKind as EventDateKind;
    else delete saved.eventDateKind;
    if (plannedDate) saved.plannedDate = plannedDate;
    else delete saved.plannedDate;
    if (alsoTask) saved.alsoTask = true;
    else delete saved.alsoTask;
    if (form.plannedDate !== (node?.plannedDate ?? "")) delete saved.dismissedTodayDate;
    setError("");
    onSave(saved);
  };
  const dateLabel = form.eventDateKind === "deadline" ? "截止日期" : form.eventDateKind === "occurs" ? "发生日期" : "日期";
  const timeLabel = form.eventDateKind === "deadline" ? "截止时间" : form.eventDateKind === "occurs" ? "发生时间" : "时间";

  return <dialog className="courseEventDialog" ref={dialogRef} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="courseEventDialogHead"><h2 id={titleId}>{node ? "事项设置" : "新增事项"}</h2><button type="button" className="courseEventClose" aria-label="关闭事项设置" onClick={onClose}>×</button></header>
    <form onSubmit={save} onKeyDown={submitFormOnEnter} aria-describedby={error ? errorId : undefined}>
      <fieldset disabled={readOnly} className="courseEventFields">
        <label className="courseEventWide"><span>事项名称</span><input ref={titleRef} value={form.title} maxLength={500} required onChange={(event) => patch("title", event.target.value)} /></label>
        <label><span>关联课程</span><select value={form.linkedCourseId} onChange={(event) => { const value = event.target.value; setForm((current) => ({ ...current, linkedCourseId: value, ...(value ? { area: "课内" as const } : {}) })); }}>
          <option value="">不关联课程</option>
          {form.linkedCourseId && !courseChoices.some((course) => course.id === form.linkedCourseId) && <option value={form.linkedCourseId} disabled>{courses.some((course) => course.id === form.linkedCourseId) ? "原关联不是课程，请重新选择" : "课程已移除"}</option>}
          {courseChoices.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select></label>
        <label><span>考核类型</span><select value={form.assessmentType} onChange={(event) => patch("assessmentType", event.target.value)}><option value="">未设置</option>{assessmentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="courseEventWide"><span>日期含义</span><select value={form.eventDateKind} onChange={(event) => patch("eventDateKind", event.target.value)}><option value="">未区分</option><option value="occurs">发生时间</option><option value="deadline">提交截止</option></select></label>
        <label><span>{dateLabel}</span><input type="date" min={workDateInputMinimum(form.date, currentDate, node?.date)} value={form.date} onChange={(event) => patch("date", event.target.value)} /></label>
        <label><span>{timeLabel}</span><input type="time" value={form.time} onChange={(event) => patch("time", event.target.value)} /></label>
        <label className="courseEventWide courseEventTaskToggle"><input type="checkbox" checked={showOnCalendar} onChange={(event) => setShowOnCalendar(event.target.checked)} /><span>显示在日历</span></label>
        <label className="courseEventWide courseEventTaskToggle"><input type="checkbox" checked={alsoTask} onChange={(event) => setAlsoTask(event.target.checked)} /><span>同时作为任务</span></label>
        {alsoTask && <label className="courseEventWide"><span>计划推进日（可选）</span><input type="date" aria-label="事项任务计划推进日" min={workDateInputMinimum(plannedDate, currentDate, node?.alsoTask ? defaultTaskPlannedDate(node) : node?.plannedDate)} value={plannedDate} onChange={(event) => patch("plannedDate", event.target.value)} /></label>}
        <details className="courseEventMore courseEventWide" open={Boolean(node?.location || node?.requirements || node?.plannedDate)}>
          <summary>更多信息</summary>
          <div className="courseEventExtraFields">
            {!alsoTask && <label><span>计划推进日</span><input type="date" min={workDateInputMinimum(form.plannedDate, currentDate, node?.plannedDate)} value={form.plannedDate} onChange={(event) => patch("plannedDate", event.target.value)} /></label>}
            <label><span>所属领域</span><select value={form.linkedCourseId ? "课内" : form.area} disabled={Boolean(form.linkedCourseId)} onChange={(event) => patch("area", event.target.value)}>{["课内", "课外", "工作", "生活", "思考"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="courseEventWide"><span>地点</span><input value={form.location} maxLength={500} onChange={(event) => patch("location", event.target.value)} /></label>
            <label className="courseEventWide"><span>要求与备注</span><textarea rows={3} value={form.requirements} maxLength={4000} onChange={(event) => patch("requirements", event.target.value)} /></label>
          </div>
        </details>
      </fieldset>
      {error && <p id={errorId} className="courseEventError" role="alert">{error}</p>}
      <footer className="courseEventDialogActions"><button type="button" className="softButton" onClick={onClose}>{readOnly ? "关闭" : "取消"}</button>{!readOnly && <button type="submit" className="primaryButton">{node ? "保存" : "创建事项"}</button>}</footer>
    </form>
  </dialog>;
}
