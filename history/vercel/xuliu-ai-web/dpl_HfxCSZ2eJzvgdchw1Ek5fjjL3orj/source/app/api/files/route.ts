export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { error: "图片云存储尚未启用，请使用浏览器本地保存。" },
    { status: 501 },
  );
}
