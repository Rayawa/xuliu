export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { error: "云同步尚未启用，当前数据安全保存在本机浏览器中。" },
    { status: 503 },
  );
}

export async function PUT() {
  return Response.json(
    { error: "云同步尚未启用，当前数据安全保存在本机浏览器中。" },
    { status: 503 },
  );
}
