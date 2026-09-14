import test from "node:test";
import assert from "node:assert/strict";
import { uploadNodeFileBatch, MAX_FILE_BYTES } from "../lib/course-node-attachments.ts";
import { createEmptyWorkspaceState, workspaceStateSchema } from "../lib/workspace-state-schema.ts";
import { officeXmlFiles, readPreviewBytes, previewKind, MAX_PREVIEW_BYTES } from "../lib/attachment-preview.ts";
import { zipSync, strToU8 } from "fflate";

test("upload failure keeps successful attachments and retry only uploads the remainder", async () => {
  const files = [new File(["a"], "要求.txt"), new File(["b"], "图片.png"), new File(["c"], "作业.pdf")];
  let pending = files; const saved = []; const calls = [];
  const onSaved = (file, remaining) => { saved.push(file); pending = remaining; };
  await assert.rejects(uploadNodeFileBatch(pending, 0, async (file) => {
    calls.push(file.name); if (file === files[1]) throw new Error("网络中断"); return { id: file.name };
  }, onSaved), /网络中断/);
  assert.deepEqual(saved, [{ id: "要求.txt" }]);
  assert.deepEqual(pending, files.slice(1));
  await uploadNodeFileBatch(pending, saved.length, async (file) => { calls.push(file.name); return { id: file.name }; }, onSaved);
  assert.deepEqual(calls, ["要求.txt", "图片.png", "图片.png", "作业.pdf"]);
  assert.equal(saved.length, 3); assert.equal(pending.length, 0);
});

test("legacy requirements and new outcomes survive save/export/restore independently", () => {
  const file = { id: "requirement", url: "https://example.blob.vercel-storage.com/attachments/owner/task.pdf", fileName: "题目.pdf", fileSize: 12, mimeType: "application/pdf", uploadedAt: "2026-09-14" };
  const oldNode = { id: "original-node", courseId: "original-course", title: "作业", date: "2026-09-14", time: "09:00", location: "教室", requirements: "原有要求", attachments: [file], area: "课内", done: false };
  const legacy = { ...createEmptyWorkspaceState(), milestones: [oldNode] };
  assert.deepEqual(workspaceStateSchema.parse(legacy), legacy);
  const updated = { ...legacy, milestones: [{ ...oldNode, outcomeText: "第一版成果", outcomeAttachments: [{ ...file, id: "result", fileName: "答案.pdf" }] }] };
  const restored = workspaceStateSchema.parse(JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(restored.milestones[0].attachments, oldNode.attachments);
  assert.deepEqual(restored, updated);
  assert.equal(workspaceStateSchema.safeParse({ ...legacy, milestones: [{ ...oldNode, outcomeAttachments: Array.from({ length: 51 }, () => file) }] }).success, false);
});

test("preview reads content without navigation and bounds streamed response size", async () => {
  const bytes = await readPreviewBytes(new Response("作业要求 <script>alert(1)</script>"));
  assert.match(new TextDecoder().decode(bytes), /作业要求/);
  await assert.rejects(readPreviewBytes(new Response("private", { status: 401 })), /登录/);
  await assert.rejects(readPreviewBytes(new Response("a", { headers: { "content-length": String(MAX_PREVIEW_BYTES + 1) } })), /较大/);
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  await assert.rejects(readPreviewBytes(new Response(stream)), /较大/);
  assert.equal(cancelled, true);
  assert.equal(previewKind({ fileName: "作业.DOCX", mimeType: "application/octet-stream" }), "docx");
  assert.equal(previewKind({ fileName: "脚本.html", mimeType: "text/html" }), "unsupported");
  assert.equal(previewKind({ fileName: "图.svg", mimeType: "image/svg+xml" }), "unsupported");
});

test("Office preview reads intended content only and rejects excessive expanded data", async () => {
  const archive = zipSync({ "word/document.xml": strToU8("<document>作业要求</document>"), "word/external.xml": strToU8("never rendered") });
  const files = await officeXmlFiles(archive, "docx");
  assert.equal(files.length, 1); assert.match(files[0].xml, /作业要求/);
  const slides = zipSync({ "ppt/slides/slide10.xml": strToU8("ten"), "ppt/slides/slide2.xml": strToU8("two") });
  assert.deepEqual((await officeXmlFiles(slides, "pptx")).map((item) => item.xml), ["two", "ten"]);
  const bomb = zipSync({ "word/document.xml": new Uint8Array(11 * 1024 * 1024) });
  await assert.rejects(officeXmlFiles(bomb, "docx"), /较大/);
});

test("batch validates file count and size before uploading any files", async () => {
  let uploads = 0;
  const upload = async () => { uploads++; return {}; };
  await assert.rejects(uploadNodeFileBatch([new File(["a"], "a"), new File(["b"], "b")], 49, upload, () => {}), /最多/);
  await assert.rejects(uploadNodeFileBatch([{ size: MAX_FILE_BYTES + 1 }], 0, upload, () => {}), /50 MB/);
  assert.equal(uploads, 0);
});
