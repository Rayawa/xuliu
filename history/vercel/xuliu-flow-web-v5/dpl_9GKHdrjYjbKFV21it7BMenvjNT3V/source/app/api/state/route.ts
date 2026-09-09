import { NextResponse } from "next/server";
import { findAccountById } from "@/lib/accounts";
import { getRedis } from "@/lib/redis";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkspaceRecord = { data: unknown; updatedAt: string };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const owner = new URL(request.url).searchParams.get("owner") ?? session.userId;
  const ownerAccount = findAccountById(owner);
  if (!ownerAccount) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
  const record = await getRedis().get<WorkspaceRecord>(`xuliu:workspace:${ownerAccount.id}`);
  return NextResponse.json({ owner: ownerAccount.id, readOnly: ownerAccount.id !== session.userId, data: record?.data ?? null, updatedAt: record?.updatedAt ?? null });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000_000) return NextResponse.json({ error: "数据过大，请先导出并整理图片" }, { status: 413 });
  const body = await request.json().catch(() => null) as { data?: unknown } | null;
  if (!body || typeof body.data !== "object" || body.data === null) return NextResponse.json({ error: "数据格式不正确" }, { status: 400 });
  const record: WorkspaceRecord = { data: body.data, updatedAt: new Date().toISOString() };
  await getRedis().set(`xuliu:workspace:${session.userId}`, record);
  return NextResponse.json({ ok: true, updatedAt: record.updatedAt });
}
