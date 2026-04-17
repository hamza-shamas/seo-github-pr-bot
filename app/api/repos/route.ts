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
    const message = err instanceof Error ? err.message : "Failed to list repos";
    return NextResponse.json({ error: message, repos: [], filter }, { status: 200 });
  }
}
