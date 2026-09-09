import { NextResponse } from "next/server";
import { deploymentVersion } from "@/lib/deployment-version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { version: deploymentVersion() },
    { headers: { "cache-control": "no-store" } },
  );
}
