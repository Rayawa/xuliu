import { NextResponse } from "next/server";
import { findAccountById, getVisibleAccounts, publicAccount } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const account = session ? findAccountById(session.userId) : null;
  if (!account) return NextResponse.json({ authenticated: false }, { status: 401 });
  const visibleAccounts = getVisibleAccounts(account.id).map(publicAccount);
  return NextResponse.json({ authenticated: true, account: publicAccount(account), visibleAccounts });
}
