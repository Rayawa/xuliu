import { NextResponse } from "next/server";
import { z } from "zod";
import { findAccountById } from "@/lib/accounts";
import { executeStoredAiProposal } from "@/lib/ai-proposals";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  proposalId: z.string().min(1).max(80),
  confirmationToken: z.string().min(20).max(200),
}).strict();

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_000) return NextResponse.json({ error: "请求过大" }, { status: 413 });
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "确认信息无效" }, { status: 400 });

  const result = await executeStoredAiProposal(session.userId, body.data.proposalId, body.data.confirmationToken);
  if (result.status === "not_found") return NextResponse.json({ error: "提案不存在或已经失效" }, { status: 404 });
  if (result.status === "expired") return NextResponse.json({ error: "提案已过期，请重新生成" }, { status: 410 });
  if (result.status === "forbidden") return NextResponse.json({ error: "确认信息无效" }, { status: 403 });
  if (result.status === "conflict") return NextResponse.json({ error: "云端数据已经变化，请重新生成提案" }, { status: 409 });
  return NextResponse.json(result);
}
