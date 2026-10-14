import { get } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { canViewWorkspace, findAccountById } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxFileBytes = 50 * 1024 * 1024;
const allowedContentTypes = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "application/zip", "application/x-zip-compressed",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
];

function attachmentOwner(urlValue: string) {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".blob.vercel-storage.com")) return null;
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    return parts[0] === "attachments" ? parts[1] ?? null : null;
  } catch {
    return null;
  }
}

function safeFileName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 300) || "attachment";
}

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "资料存储尚未连接，请稍后重试" }, { status: 503 });
    }
    const body = await request.json() as HandleUploadBody;
    const session = body.type === "blob.generate-client-token" ? await getSession() : null;
    if (body.type === "blob.generate-client-token" && (!session || !findAccountById(session.userId))) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!session) throw new Error("请先登录");
        const prefix = `attachments/${session.userId}/`;
        if (!pathname.startsWith(prefix) || pathname.length > 700) throw new Error("上传路径无效");
        if (clientPayload) {
          const payload = JSON.parse(clientPayload) as { blockId?: unknown };
          if (typeof payload.blockId !== "string" || payload.blockId.length > 100) throw new Error("上传信息无效");
        }
        return {
          allowedContentTypes,
          maximumSizeInBytes: maxFileBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ ownerId: session.userId }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !findAccountById(session.userId)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "资料存储尚未连接" }, { status: 503 });
    const requestUrl = new URL(request.url);
    const blobUrl = requestUrl.searchParams.get("url") ?? "";
    const ownerId = attachmentOwner(blobUrl);
    const owner = ownerId ? findAccountById(ownerId) : null;
    if (!owner) return NextResponse.json({ error: "资料地址无效" }, { status: 400 });
    if (!canViewWorkspace(session.userId, owner.id)) return NextResponse.json({ error: "无权查看这个资料" }, { status: 403 });
    const result = await get(blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200) return NextResponse.json({ error: "资料不存在" }, { status: 404 });
    const requestedName = requestUrl.searchParams.get("name") ?? result.blob.pathname.split("/").pop() ?? "attachment";
    const fileName = safeFileName(requestedName);
    const type = result.blob.contentType || "application/octet-stream";
    const canOpenInline = requestUrl.searchParams.get("download") !== "1" && ((type.startsWith("image/") && type !== "image/svg+xml") || type === "application/pdf" || type === "text/plain");
    const disposition = `${canOpenInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(result.blob.size),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "资料读取失败，请稍后重试" }, { status: 502 });
  }
}
