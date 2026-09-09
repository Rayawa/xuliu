import { NextResponse } from "next/server";
import { canViewWorkspace, findAccountById } from "@/lib/accounts";
import { getRedis } from "@/lib/redis";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkspaceRecord = { data: unknown; updatedAt: string; revision?: number };

const saveWorkspaceScript = `
local current = redis.call("GET", KEYS[1])
local expected = tonumber(ARGV[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  local currentRevision = 0
  if ok and decoded and decoded["revision"] then
    currentRevision = tonumber(decoded["revision"]) or 0
  end
  if currentRevision ~= expected then
    return -1
  end
  redis.call("LPUSH", KEYS[2], current)
  redis.call("LTRIM", KEYS[2], 0, 9)
elseif expected ~= 0 then
  return -1
end
redis.call("SET", KEYS[1], ARGV[2])
return expected + 1
`;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const owner = new URL(request.url).searchParams.get("owner") ?? session.userId;
  const ownerAccount = findAccountById(owner);
  if (!ownerAccount) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
  if (!canViewWorkspace(session.userId, ownerAccount.id)) return NextResponse.json({ error: "无权查看这个空间" }, { status: 403 });
  const record = await getRedis().get<WorkspaceRecord>(`xuliu:workspace:${ownerAccount.id}`);
  return NextResponse.json({ owner: ownerAccount.id, readOnly: ownerAccount.id !== session.userId, data: record?.data ?? null, updatedAt: record?.updatedAt ?? null, revision: record?.revision ?? 0 });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000_000) return NextResponse.json({ error: "数据过大，请先导出并整理图片" }, { status: 413 });
  const body = await request.json().catch(() => null) as { data?: unknown; baseRevision?: number } | null;
  if (!body || typeof body.data !== "object" || body.data === null) return NextResponse.json({ error: "数据格式不正确" }, { status: 400 });
  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return NextResponse.json({ error: "Missing data revision. Refresh the page and try again." }, { status: 400 });
  const record: WorkspaceRecord = { data: body.data, updatedAt: new Date().toISOString(), revision: baseRevision + 1 };
  const workspaceKey = `xuliu:workspace:${session.userId}`;
  const historyKey = `xuliu:workspace:history:${session.userId}`;
  const revision = Number(await getRedis().eval(saveWorkspaceScript, [workspaceKey, historyKey], [String(baseRevision), JSON.stringify(record)]));
  if (revision === -1) return NextResponse.json({ error: "Cloud data changed. Refresh before saving to avoid overwriting it." }, { status: 409 });
  return NextResponse.json({ ok: true, updatedAt: record.updatedAt, revision });
}
