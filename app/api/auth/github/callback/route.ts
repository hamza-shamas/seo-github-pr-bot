import { NextResponse } from "next/server";
import { exchangeCodeForToken, publicAppOrigin } from "@/lib/oauth";
import { ironSession, startSession } from "@/lib/session";
import { authenticate, checkPatScopes } from "@/lib/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorRedirect(request: Request, message: string) {
  const url = new URL("/", publicAppOrigin(request.url));
  url.searchParams.set("oauth_error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const ghError = url.searchParams.get("error");

  if (ghError) return errorRedirect(request, ghError);
  if (!code || !state) return errorRedirect(request, "missing_code_or_state");

  const session = await ironSession();
  const expected = session.oauthState;
  session.oauthState = undefined;
  await session.save();

  if (!expected || expected !== state) {
    return errorRedirect(request, "state_mismatch");
  }

  try {
    const { accessToken, scopes } = await exchangeCodeForToken(code);
    const auth = await authenticate(accessToken);
    const scopeCheck = checkPatScopes(auth);
    if (!scopeCheck.ok) {
      return errorRedirect(request, encodeURIComponent(scopeCheck.reason ?? "missing_scope"));
    }
    await startSession({
      token: accessToken,
      source: "oauth",
      scopes: scopes || auth.scopes.join(", ") || undefined,
      identity: auth.identity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return errorRedirect(request, encodeURIComponent(message));
  }

  return NextResponse.redirect(new URL("/", publicAppOrigin(request.url)));
}
