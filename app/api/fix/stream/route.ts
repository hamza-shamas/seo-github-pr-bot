import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { fetchRepo } from "@/lib/github/client";
import { buildRepoContext } from "@/lib/github/repoContext";
import { runScan } from "@/lib/scan/runScan";
import { runAgent } from "@/lib/agent/runAgent";
import { findExistingFixPr, openFixPr } from "@/lib/github/pr";
import { makeSseWriter } from "@/lib/agent/sse";
import { buildPrBody } from "@/lib/agent/buildPrBody";
import type { FixAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueIds: z.array(z.string().min(1)).min(1).max(20),
  siteUrl: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not connected" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = makeSseWriter(controller);

      try {
        // Heads-up only — surface existing PRs so the user knows their
        // history, but DON'T bail out. Each agent run gets its own PR
        // on a fresh seo-fixes/<timestamp> branch.
        const existing = await findExistingFixPr(user.token, parsed.owner, parsed.repo);
        if (existing) {
          send({
            type: "pr_existing",
            url: existing.htmlUrl,
            number: existing.number,
            createdAt: existing.createdAt,
          });
        }

        const repo = await fetchRepo(user.token, parsed.owner, parsed.repo);
        const ctx = await buildRepoContext({
          token: user.token,
          owner: repo.owner,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
        });

        const scan = await runScan({
          token: user.token,
          owner: repo.owner,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
        });

        const selectedSet = new Set(parsed.issueIds);
        const selected = scan.issues.filter((i) => selectedSet.has(i.id));

        if (selected.length === 0) {
          send({ type: "error", message: "None of the selected issues were found in this repo." });
          send({ type: "end" });
          controller.close();
          return;
        }

        const result = await runAgent(
          { ctx, issues: selected, siteUrl: parsed.siteUrl || undefined },
          send
        );

        if (result.proposals.length === 0) {
          send({
            type: "error",
            message:
              "Agent finished without proposing any file changes. The selected issues may not be auto-fixable for this repo.",
          });
          send({ type: "end" });
          controller.close();
          return;
        }

        const actions: FixAction[] = result.proposals.map((p) => ({
          kind: p.kind,
          path: p.path,
          content: p.content,
        }));

        const bodyHeader = buildPrBody({
          fullName: repo.fullName,
          issues: selected,
          proposals: result.proposals,
        });

        const pr = await openFixPr({
          token: user.token,
          owner: repo.owner,
          repo: repo.name,
          defaultBranch: repo.defaultBranch,
          actions,
          bodyHeader,
          title: result.prMetadata?.title,
          commitMessage: result.prMetadata?.commitMessage,
        });

        // openFixPr no longer returns a "reused" branch since we bypass
        // the existence check above — but the type still allows it, so
        // narrow defensively.
        if (pr.reused) {
          send({
            type: "pr_existing",
            url: pr.existing.htmlUrl,
            number: pr.existing.number,
            createdAt: pr.existing.createdAt,
          });
        } else {
          send({
            type: "pr_opened",
            url: pr.prUrl,
            number: pr.number,
            branch: pr.branch,
          });
        }

        send({ type: "end" });
        controller.close();
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "agent failed",
        });
        send({ type: "end" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
