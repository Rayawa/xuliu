import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findAccountById } from "@/lib/accounts";
import { isYiyanLocalPreview } from "@/lib/yiyan-session";
import { YiyanError } from "@/lib/yiyan-service";
import { fetchYiyanOriginalImage } from "@/lib/yiyan-image-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isYiyanLocalPreview(request, process.env.NODE_ENV)) {
      const session = await getSession();
      if (!session || !findAccountById(session.userId)) throw new YiyanError("请先登录序流", 401);
    }
    return await fetchYiyanOriginalImage(new URL(request.url).searchParams.get("src") ?? "");
  } catch (error) {
    return NextResponse.json({ error: error instanceof YiyanError ? error.message : "一言原图暂不可用" }, { status: error instanceof YiyanError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
