import { NextResponse } from "next/server";
import { z } from "zod";
import { findAccountById } from "@/lib/accounts";
import { applyAiWorkspaceProposal } from "@/lib/ai-action-reducer";
import { aiWorkspaceProposalInputSchema } from "@/lib/ai-action-schema";
import { buildAiProposalPreview } from "@/lib/ai-proposal-preview";
import { getSession } from "@/lib/session";
import { createEmptyWorkspaceState, workspaceStateSchema } from "@/lib/workspace-state-schema";
import { getWorkspaceRecord } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumBodyBytes = 200_000;
const requestSchema = z.object({
  proposal: aiWorkspaceProposalInputSchema,
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return json({ error: "请先登录" }, 401);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumBodyBytes) return json({ error: "提案内容过长" }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "提案格式不正确" }, 415);
  }

  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > maximumBodyBytes) return json({ error: "提案内容过长" }, 413);
  let rawValue: unknown;
  try {
    rawValue = JSON.parse(rawBody);
  } catch {
    return json({ error: "提案格式不正确" }, 400);
  }

  const parsed = requestSchema.safeParse(rawValue);
  if (!parsed.success) return json({ error: "提案格式不正确" }, 400);

  const record = await getWorkspaceRecord(session.userId);
  const currentRevision = record?.revision ?? 0;
  if (currentRevision !== parsed.data.proposal.baseRevision) {
    console.warn("[api/ai/preview] revision conflict", {
      operationCount: parsed.data.proposal.operations.length,
      proposalRevision: parsed.data.proposal.baseRevision,
      currentRevision,
    });
    return json({ error: "云端数据已经变化，原提案已自动作废，请重新生成" }, 409);
  }

  const currentState = record?.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? { ...createEmptyWorkspaceState(), ...record.data }
    : createEmptyWorkspaceState();

  try {
    // This is deliberately an in-memory dry run. It performs the same semantic
    // validation as execution, but never calls a persistence function.
    workspaceStateSchema.parse(applyAiWorkspaceProposal(currentState, parsed.data.proposal));
    const operations = buildAiProposalPreview(currentState, parsed.data.proposal);
    if (operations.length !== parsed.data.proposal.operations.length) throw new Error("预览条目不完整");
    return json({ baseRevision: currentRevision, operations });
  } catch (error) {
    const issues = error instanceof z.ZodError
      ? error.issues.slice(0, 20).map((issue) => ({
        code: issue.code,
        path: issue.path.map((segment) => typeof segment === "number" ? segment : "<field>"),
      }))
      : [];
    const operations = parsed.data.proposal.operations.map((operation, index) => ({
      index,
      kind: operation.kind,
      ...(operation.kind === "entity" ? { action: operation.action, entity: operation.entity } : {}),
      ...(operation.kind === "block" ? { action: operation.action, container: operation.container } : {}),
    }));
    console.warn("[api/ai/preview] semantic validation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
      issues,
      operations,
    });
    return json({ error: "提案引用的内容已不存在或修改无效，请让 AI 重新生成提案" }, 422);
  }
}
