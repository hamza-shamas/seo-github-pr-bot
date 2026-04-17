import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkPatScopes } from "@/lib/github/client";
import { startSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(20, "Token looks too short").max(500),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = parsed.token.trim();

  let auth;
  try {
    auth = await authenticate(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify token";
    const status = message.toLowerCase().includes("bad credentials") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const scopeCheck = checkPatScopes(auth);
  if (!scopeCheck.ok) {
    return NextResponse.json(
      { error: scopeCheck.reason, tokenType: auth.tokenType, scopes: auth.scopes },
      { status: 403 }
    );
  }

  try {
    const user = await startSession({
      token,
      source: "pat",
      scopes: auth.scopes.join(", ") || undefined,
      identity: auth.identity,
    });
    return NextResponse.json({
      ok: true,
      githubLogin: user.githubLogin,
      tokenType: auth.tokenType,
      scopes: auth.scopes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
