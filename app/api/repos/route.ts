import { NextResponse } from "next/server";
import { octokit } from "@/lib/github/client";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RepoListItem {
  fullName: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  description: string | null;
}

export type ReposFilter = "owner" | "all";

const ALLOWED_FILTERS: ReposFilter[] = ["owner", "all"];

function affiliationFor(filter: ReposFilter): string {
  return filter === "owner"
    ? "owner"
    : "owner,collaborator,organization_member";
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("filter") ?? "owner") as ReposFilter;
  const filter: ReposFilter = ALLOWED_FILTERS.includes(raw) ? raw : "owner";

  try {
    const client = octokit(user.token);
    const { data } = await client.repos.listForAuthenticatedUser({
      affiliation: affiliationFor(filter),
      sort: "pushed",
      direction: "desc",
      per_page: 100,
    });

    const repos: RepoListItem[] = data.map((r) => ({
      fullName: r.full_name,
      owner: r.owner.login,
      name: r.name,
      isPrivate: r.private,
      defaultBranch: r.default_branch ?? "main",
      pushedAt: r.pushed_at ?? null,
      description: r.description ?? null,
    }));

    return NextResponse.json({ repos, filter });
  } catch (err) {
    return NextResponse.json(...mapGithubError(err, filter));
  }
}

/** Map a thrown Octokit / fetch error to an honest HTTP response so the
 * frontend can distinguish "GitHub failed" from "you have zero repos in
 * this filter" — both used to look the same (200 + empty list). */
function mapGithubError(
  err: unknown,
  filter: ReposFilter
): [Record<string, unknown>, { status: number }] {
  const upstreamStatus =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const rawMessage = err instanceof Error ? err.message : "Failed to list repos";

  if (upstreamStatus === 401) {
    return [
      { error: "GitHub rejected the token. Disconnect and reconnect.", filter },
      { status: 401 },
    ];
  }
  if (upstreamStatus === 403) {
    const isRateLimit = /rate limit|abuse/i.test(rawMessage);
    return [
      {
        error: isRateLimit
          ? "GitHub rate limit hit. Try again in a few minutes."
          : "GitHub denied access. The token may be missing the 'repo' scope, or the org has restricted OAuth apps.",
        filter,
      },
      { status: 403 },
    ];
  }
  if (upstreamStatus && upstreamStatus >= 500) {
    return [
      {
        error: `GitHub upstream error (${upstreamStatus}). This is on GitHub's side — try again in a moment.`,
        filter,
      },
      { status: 502 },
    ];
  }
  return [{ error: rawMessage, filter }, { status: 500 }];
}
