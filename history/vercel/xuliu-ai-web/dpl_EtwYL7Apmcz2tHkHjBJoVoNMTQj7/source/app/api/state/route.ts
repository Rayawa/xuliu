import { NextResponse } from "next/server";
import { canViewWorkspace, findAccountById } from "@/lib/accounts";
import { getSession } from "@/lib/session";
import { getWorkspaceRecord, saveWorkspaceData } from "@/lib/workspace-store";
import { workspaceStateSchema } from "@/lib/workspace-state-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const owner = new URL(request.url).searchParams.get("owner") ?? session.userId;
  const ownerAccount = findAccountById(owner);
  if (!ownerAccount) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
  if (!canViewWorkspace(session.userId, ownerAccount.id)) return NextResponse.json({ error: "无权查看这个空间" }, { status: 403 });
  const record = await getWorkspaceRecord(ownerAccount.id);
  return NextResponse.json({ owner: ownerAccount.id, readOnly: ownerAccount.id !== session.userId, data: record?.data ?? null, updatedAt: record?.updatedAt ?? null, revision: record?.revision ?? 0 });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000_000) return NextResponse.json({ error: "数据过大，请先导出并整理图片" }, { status: 413 });
  const body = await request.json().catch(() => null) as { data?: unknown; baseRevision?: number } | null;
  const parsedData = workspaceStateSchema.safeParse(body?.data);
  if (!parsedData.success) return NextResponse.json({ error: "数据格式不正确，请刷新页面后重试" }, { status: 400 });
  const baseRevision = Number(body?.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return NextResponse.json({ error: "Missing data revision. Refresh the page and try again." }, { status: 400 });
  const result = await saveWorkspaceData(session.userId, parsedData.data, baseRevision);
  if (result.status === "conflict") return NextResponse.json({ error: "Cloud data changed. Refresh before saving to avoid overwriting it." }, { status: 409 });
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt, revision: result.revision });
}
