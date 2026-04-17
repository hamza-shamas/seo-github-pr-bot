import { NextResponse } from "next/server";
import { buildAuthorizeUrl, isOAuthConfigured, newState } from "@/lib/oauth";
import { ironSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: "GitHub OAuth is not configured on this deployment" },
      { status: 503 }
    );
  }
  const session = await ironSession();
  const state = newState();
  session.oauthState = state;
  await session.save();
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
