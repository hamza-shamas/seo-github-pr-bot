import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { fetchRepo } from "@/lib/github/client";
import { runFix } from "@/lib/fix/runFix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueIds: z.array(z.string().min(1)).min(1).max(50),
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

  let connected;
  try {
    connected = await fetchRepo(user.token, parsed.owner, parsed.repo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Repo not accessible";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  try {
    const fix = await runFix({
      token: user.token,
      owner: connected.owner,
      name: connected.name,
      defaultBranch: connected.defaultBranch,
      selectedIssueIds: parsed.issueIds,
    });
    return NextResponse.json({ ok: true, ...fix });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open fix PR";
    const status = /permission|forbidden|403/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
