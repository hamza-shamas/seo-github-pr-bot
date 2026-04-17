import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
