import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchRepo } from "@/lib/github/client";
import { ironSession, getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ownerRepoRegex = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;

const Body = z.object({
  repo: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .transform((s) => s.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "")),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parts = parsed.repo.split("/").filter(Boolean);
  if (parts.length !== 2 || !ownerRepoRegex.test(parts[0]) || !ownerRepoRegex.test(parts[1])) {
    return NextResponse.json(
      { error: "Use the format owner/repo (e.g. vercel/next.js)" },
      { status: 400 }
    );
  }

  try {
    const repo = await fetchRepo(user.token, parts[0], parts[1]);
    const session = await ironSession();
    session.repo = repo;
    await session.save();
    return NextResponse.json({ ok: true, repo });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to access repo";
    const status = /not.?found/i.test(message) ? 404 : 403;
    return NextResponse.json(
      {
        error:
          status === 404
            ? "Repo not found, or your token doesn't grant access to it."
            : message,
      },
      { status }
    );
  }
}

export async function DELETE() {
  const session = await ironSession();
  session.repo = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
