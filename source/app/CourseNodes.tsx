"use client";

import { useEffect, useId, useRef, useState } from "react";
import { upload as uploadBlob } from "@vercel/blob/client";
import dynamic from "next/dynamic";
import { attachmentUrl, MAX_NODE_FILES, uploadNodeFileBatch, type NodeAttachment } from "@/lib/course-node-attachments";
import { saveLocalPreviewFile, downloadLocalPreviewFile } from "@/lib/local-preview-files";
import { localDateKey } from "@/lib/finance";
import { newTaskPlannedDate, workDateChangeAllowed, workDateInputMinimum } from "@/lib/task-progress";

const AttachmentPreview = dynamic(() => import("./AttachmentPreview"), { ssr: false });

import type { Block } from "./DashboardClient";
import type { CourseEventFields } from "@/lib/course-events";

export type CourseNode = CourseEventFields & {
  blocks?: Block[]; elapsed?: number; mode?: "single" | "multi"; parentCandidate?: boolean; automationKey?: string;
  id: string; courseId?: string; title: string; date: string; time: string; location: string; plannedDate?: string; progressedDates?: string[]; showOnCalendar?: boolean; completedDate?: string; dismissedTodayDate?: string;
  requirements: string; attachments?: NodeAttachment[];
  outcomeText?: string; outcomeAttachments?: NodeAttachment[];
  area: "课内" | "课外" | "工作" | "生活" | "思考"; done: boolean;
};
type Access = { ownerId: string; readOnly: boolean; preview: boolean };
type Change<T> = (update: (current: T) => T) => void;

function fileSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export function NodeAttachments({ nodeId, scope = "milestone", label, files, onChange, access, onBlockedChange }: {
  nodeId: string; scope?: "milestone" | "task"; label: string; files: NodeAttachment[]; onChange: Change<NodeAttachment[]>;
  access: Access; onBlockedChange: (blocked: boolean) => void;
}) {
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ file: NodeAttachment; localFile?: File } | null>(null);
  const [removed, setRemoved] = useState<{ file: NodeAttachment; index: number } | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!pending.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.length]);
  const fieldId = useId();
  const queueFiles = (chosen: File[]) => {
    if (access.readOnly || locked.current || !chosen.length) return;
    if (files.length + pending.length + chosen.length > MAX_NODE_FILES) {
      setError(`每个附件区域最多保存 ${MAX_NODE_FILES} 个文件，请减少选择数量。`); return;
    }
    setPending((current) => [...current, ...chosen]);
    setError(""); onBlockedChange(true);
  };
  const uploadPending = async () => {
    if (access.readOnly || locked.current || !pending.length) return;
    locked.current = true; setBusy(true); setError("");
    try {
      await uploadNodeFileBatch(pending, files.length, async (file) => {
        if (access.preview) return saveLocalPreviewFile(file);
        const id = crypto.randomUUID();
        const safeName = file.name.replace(/[\\/?%*:|"<>]/g, "-").slice(0, 220) || "attachment";
        setProgress(1);
        const result = await uploadBlob(`attachments/${access.ownerId}/${scope}-${nodeId}/${id}/${safeName}`, file, {
          access: "private", handleUploadUrl: "/api/files", clientPayload: JSON.stringify({ blockId: `${scope}:${nodeId}` }),
          multipart: file.size > 5 * 1024 * 1024, contentType: file.type || "application/octet-stream",
          onUploadProgress: ({ percentage }) => { if (mounted.current) setProgress(Math.max(1, Math.round(percentage))); },
        });
        return { id, url: result.url, fileName: file.name.slice(0, 300), fileSize: file.size, mimeType: file.type || "application/octet-stream", uploadedAt: new Date().toISOString() };
      }, (file, remaining) => {
        if (!mounted.current) throw new Error("附件编辑已关闭，请重新打开节点检查附件。");
        onChange((current) => [...current, file]); setPending(remaining);
      });
      onBlockedChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "上传失败，请重试。已上传的文件会保留。");
    } finally { locked.current = false; setBusy(false); setProgress(0); }
  };
  return <div className="courseNodeAttachments">
    <ul className="nodeAttachmentList">{files.map((file, index) => <li key={file.id}>
      <span className="nodeAttachmentIcon" aria-hidden="true">{file.mimeType.startsWith("image/") ? "▧" : "▤"}</span>
      <div className="nodeAttachmentName"><strong>{file.fileName}</strong><small>{fileSize(file.fileSize)}</small></div>
      <button type="button" aria-label={`预览：${file.fileName}`} onClick={() => setPreview({ file })}>预览</button>
      {file.url.startsWith("local-preview:") ? <button type="button" onClick={() => { try { downloadLocalPreviewFile(file.url); } catch (cause) { setError(cause instanceof Error ? cause.message : "文件无法读取"); } }}>下载</button> : <a href={attachmentUrl(file, true)}>下载</a>}
      {!access.readOnly && <button type="button" disabled={busy} aria-label={`移除${label}：${file.fileName}`} onClick={() => {
        setRemoved({ file, index }); onChange((current) => current.filter((item) => item.id !== file.id));
      }}>移除</button>}
    </li>)}</ul>
    {preview && <AttachmentPreview key={preview.file.id} file={preview.file} localFile={preview.localFile} onClose={() => setPreview(null)} />}
    {!access.readOnly && <>
      {removed && <div className="undoDeleteBar" role="status"><span>已移除“{removed.file.fileName}”</span><button type="button" disabled={busy || files.length >= MAX_NODE_FILES} onClick={() => {
        onChange((current) => { if (current.some((file) => file.id === removed.file.id)) return current;
          const next = [...current]; next.splice(Math.min(removed.index, next.length), 0, removed.file); return next; });
        setRemoved(null);
      }}>撤回删除</button></div>}
      <div className="courseNodePicker" onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); queueFiles(Array.from(event.dataTransfer.files)); }}>
        <label htmlFor={fieldId}>＋ 选择{label}的图片或文件</label>
        <input id={fieldId} type="file" multiple disabled={busy} onChange={(event) => { queueFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <small>最大 50 MB · 最多 50 个</small>
      </div>
      {pending.length > 0 && <div className="nodePendingFiles">
        <p>待上传（{pending.length}）</p>
        <ul>{pending.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name} · {fileSize(file.size)}</span><button type="button" aria-label={`上传前预览：${file.name}`} onClick={() => setPreview({ file: { id: `pending-${index}`, url: "", fileName: file.name, fileSize: file.size, mimeType: file.type, uploadedAt: "" }, localFile: file })}>预览</button><button type="button" disabled={busy} aria-label={`取消上传：${file.name}`} onClick={() => {
          const next = pending.filter((_, i) => i !== index); setPending(next); setError(""); onBlockedChange(next.length > 0);
        }}>移除</button></li>)}</ul>
        <button className="primaryButton" type="button" disabled={busy} onClick={() => void uploadPending()}>{busy ? `正在上传 ${progress}%` : error ? "重试上传" : access.preview ? "保存所选文件（本地试用）" : "上传所选文件"}</button>
      </div>}
      {error && <p className="uploadError" role="alert">{error}</p>}
    </>}
  </div>;
}

export function CourseNodeForm({ courseId, location, date, access, onCreate, onCancel }: {
  courseId: string; location: string; date: string; access: Access;
  onCreate: (node: CourseNode) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CourseNode>(() => ({ id: crypto.randomUUID(), courseId, title: "", date, time: "00:00", location, requirements: "", attachments: [], mode: "single", parentCandidate: false, showOnCalendar: false, area: "课内", done: false }));
  const [blocked, setBlocked] = useState(false);
  const [discard, setDiscard] = useState(false);
  const submitted = useRef(false);
  const patch = (values: Partial<CourseNode>) => setDraft((current) => ({ ...current, ...values }));
  return <form className="courseNodeForm" onSubmit={(event) => {
    event.preventDefault(); if (blocked || access.readOnly || submitted.current || !draft.title.trim() || !workDateChangeAllowed(draft.date, localDateKey())) return;
    submitted.current = true; onCreate({ ...draft, title: draft.title.trim(), ...(draft.mode !== "multi" ? { plannedDate: newTaskPlannedDate(draft, localDateKey()) } : {}) });
  }}>
    <div className="courseNodeSectionHead"><div><h3>新增课程任务</h3></div></div>
    <div className="fieldGrid">
      <label className="editField wide"><span>任务名称</span><input autoFocus required maxLength={500} value={draft.title} placeholder="考试 / 作业 / 汇报" onChange={(event) => patch({ title: event.target.value })} /></label>
      <label className="editField"><span>任务周期</span><select value={draft.mode ?? "single"} onChange={(event) => { const mode = event.target.value as "single" | "multi"; patch({ mode, parentCandidate: mode === "multi" }); }}><option value="single">短期任务</option><option value="multi">长期任务</option></select></label>
      <label className="editField taskCandidateField"><span>所属任务备选</span><span><input type="checkbox" checked={draft.parentCandidate ?? false} onChange={(event) => patch({ parentCandidate: event.target.checked })} />允许其他任务归属于它</span></label>
      <label className="editField"><span>日期</span><input type="date" min={localDateKey()} required value={draft.date} onChange={(event) => patch({ date: event.target.value })} /></label>
      <label className="editField"><span>时间</span><input type="time" required value={draft.time} onChange={(event) => patch({ time: event.target.value })} /></label>
      <label className="editField wide calendarVisibilityToggle"><input type="checkbox" disabled={access.readOnly} checked={draft.showOnCalendar ?? false} onChange={(event) => patch({ showOnCalendar: event.target.checked })} /><span>显示在日历</span></label>
      <label className="editField wide"><span>地点</span><input maxLength={500} value={draft.location} onChange={(event) => patch({ location: event.target.value })} /></label>
      <label className="editField wide"><span>具体要求</span><textarea maxLength={4000} value={draft.requirements}  onChange={(event) => patch({ requirements: event.target.value })} /></label>
    </div>
    <NodeAttachments nodeId={draft.id} label="要求" files={draft.attachments ?? []} access={access} onBlockedChange={setBlocked} onChange={(update) => setDraft((current) => ({ ...current, attachments: update(current.attachments ?? []) }))} />
    {blocked && <p className="nodeHelp" role="status">请先上传所选文件；上传成功后，节点会连同要求附件一起创建。</p>}
    <div className="courseNodeFormActions">
      <button type="button" onClick={() => setDiscard(true)}>取消</button>
      <button className="primaryButton" disabled={blocked || access.readOnly} type="submit">创建任务</button>
    </div>
    {discard && <div className="nodeDiscard" role="alert"><span>取消后不创建节点，当前填写的内容将不保留。</span><button type="button" onClick={() => setDiscard(false)}>继续填写</button><button type="button" onClick={onCancel}>放弃创建</button></div>}
  </form>;
}

export function CourseNodeEditor({ node, access, onChange, onClose, onPendingChange, variant = node.courseId ? "courseTask" : "event" }: {
  node: CourseNode; access: Access; onChange: Change<CourseNode>; onClose: () => void;
  onPendingChange: (blocked: boolean) => void; variant?: "courseTask" | "event";
}) {
  const pending = useRef({ requirements: false, outcome: false });
  const [blocked, setBlocked] = useState(false);
  const isCourseTask = variant === "courseTask";
  const reportPending = (section: "requirements" | "outcome", value: boolean) => {
    pending.current[section] = value;
    const anyPending = pending.current.requirements || pending.current.outcome;
    setBlocked(anyPending); onPendingChange(anyPending);
  };
  return <div className="courseNodeEditor">
    <div className="courseNodeSectionHead"><div><span>{isCourseTask ? "课程任务" : "日历事项"}</span><h3>{node.title}</h3></div><button type="button" disabled={blocked} onClick={onClose}>收起</button></div>
    <div className="fieldGrid courseNodeMetaFields">
      <label className="editField wide"><span>{isCourseTask ? "任务名称" : "事项名称"}</span><input readOnly={access.readOnly} required maxLength={500} value={node.title} onChange={(event) => { const title = event.target.value; onChange((current) => ({ ...current, title })); }} /></label>
      {isCourseTask && <label className="editField"><span>任务周期</span><select disabled={access.readOnly} value={node.mode ?? "single"} onChange={(event) => { const mode = event.target.value as "single" | "multi"; onChange((current) => ({ ...current, mode, parentCandidate: current.parentCandidate ?? (mode === "multi") })); }}><option value="single">短期任务</option><option value="multi">长期任务</option></select></label>}
      {isCourseTask && <label className="editField taskCandidateField"><span>所属任务备选</span><span><input type="checkbox" disabled={access.readOnly} checked={node.parentCandidate ?? false} onChange={(event) => { const parentCandidate = event.target.checked; onChange((current) => ({ ...current, parentCandidate })); }} />允许其他任务归属于它</span></label>}
      {!isCourseTask && <label className="editField"><span>所属领域</span><select disabled={access.readOnly} value={node.area} onChange={(event) => { const area = event.target.value as CourseNode["area"]; onChange((current) => ({ ...current, area })); }}><option>课内</option><option>课外</option><option>工作</option><option>生活</option><option>思考</option></select></label>}
      <label className="editField"><span>日期</span><input readOnly={access.readOnly} type="date" min={workDateInputMinimum(node.date, localDateKey(), node.date)} required value={node.date} onChange={(event) => { const date = event.target.value; if (workDateChangeAllowed(date, localDateKey(), node.date)) onChange((current) => ({ ...current, date })); }} /></label>
      <label className="editField"><span>时间</span><input readOnly={access.readOnly} type="time" required value={node.time} onChange={(event) => { const time = event.target.value; onChange((current) => ({ ...current, time })); }} /></label>
      {!node.automationKey && !node.id.startsWith("stage:") && <label className="editField wide calendarVisibilityToggle"><input type="checkbox" disabled={access.readOnly} checked={node.showOnCalendar !== false} onChange={(event) => { const showOnCalendar = event.target.checked; onChange((current) => ({ ...current, showOnCalendar })); }} /><span>显示在日历</span></label>}
      <label className="editField wide"><span>地点</span><input readOnly={access.readOnly} maxLength={500} value={node.location} onChange={(event) => { const location = event.target.value; onChange((current) => ({ ...current, location })); }} /></label>
    </div>
    <div className="courseNodeSections"><section><h4>{isCourseTask ? "任务要求" : "事项说明"}</h4><label className="editField"><span>具体要求</span><textarea readOnly={access.readOnly} maxLength={4000} value={node.requirements} placeholder={isCourseTask ? "填写提交格式、字数、评分标准…" : "填写议程、地点补充或注意事项…"} onChange={(event) => { const requirements = event.target.value; onChange((current) => ({ ...current, requirements })); }} /></label>
      <NodeAttachments nodeId={node.id} label={isCourseTask ? "要求" : "说明"} files={node.attachments ?? []} access={access} onBlockedChange={(value) => reportPending("requirements", value)} onChange={(update) => onChange((current) => ({ ...current, attachments: update(current.attachments ?? []) }))} />
    </section>
    <section className="courseNodeOutcome"><h4>{isCourseTask ? "完成成果" : "事项记录"}</h4><label className="editField"><span>{isCourseTask ? "成果说明" : "记录内容"}</span><textarea readOnly={access.readOnly} maxLength={4000} value={node.outcomeText ?? ""} placeholder={isCourseTask ? "记录完成内容、版本或提交备注…" : "记录事项结果和下一步…"} onChange={(event) => { const outcomeText = event.target.value; onChange((current) => ({ ...current, outcomeText })); }} /></label>
      <NodeAttachments nodeId={node.id} label={isCourseTask ? "成果" : "记录"} files={node.outcomeAttachments ?? []} access={access} onBlockedChange={(value) => reportPending("outcome", value)} onChange={(update) => onChange((current) => ({ ...current, outcomeAttachments: update(current.outcomeAttachments ?? []) }))} />
    </section></div>
    {blocked && <p className="nodeHelp">请上传或移除待上传文件后再收起。</p>}
  </div>;
}
