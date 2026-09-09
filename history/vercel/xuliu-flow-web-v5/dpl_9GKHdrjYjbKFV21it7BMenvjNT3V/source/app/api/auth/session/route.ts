import { NextResponse } from "next/server";
import { findAccountById, getAccounts, publicAccount } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const account = session ? findAccountById(session.userId) : null;
  if (!account) return NextResponse.json({ authenticated: false }, { status: 401 });
  const other = getAccounts().find((item) => item.id !== account.id)!;
  return NextResponse.json({ authenticated: true, account: publicAccount(account), otherAccount: publicAccount(other) });
}
