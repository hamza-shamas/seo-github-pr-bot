import { octokit } from "./client";
import type { FixAction } from "../types";

const BRANCH_PREFIX = "seo-fixes";
const DEFAULT_PR_TITLE = "SEO + GEO fixes";
const PR_FOOTER = "\n\n---\n_Drafted by GEO Forge — review the diff before merging._";

export interface OpenFixPrInput {
  token: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  actions: FixAction[];
  bodyHeader: string;
  /** Agent-supplied PR title. Falls back to a generic default. */
  title?: string;
  /** Agent-supplied commit body. Falls back to a file-list summary. */
  commitMessage?: string;
}

export interface ExistingPrSummary {
  number: number;
  htmlUrl: string;
  branch: string;
  createdAt: string;
}

export interface OpenFixPrResult {
  prUrl: string;
  branch: string;
  number: number;
  reused: false;
}

export interface ExistingFixPrResult {
  reused: true;
  existing: ExistingPrSummary;
}

export type FixPrResult = OpenFixPrResult | ExistingFixPrResult;

/**
 * Find any open PR whose head branch starts with `seo-fixes/`. We treat the
 * presence of an open one as "don't litter the repo" and surface it back
 * to the user so they can review/close before re-running.
 */
export async function findExistingFixPr(
  token: string,
  owner: string,
  repo: string
): Promise<ExistingPrSummary | null> {
  const client = octokit(token);
  const { data } = await client.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  const match = data.find((pr) => pr.head.ref.startsWith(`${BRANCH_PREFIX}/`));
  if (!match) return null;
  return {
    number: match.number,
    htmlUrl: match.html_url,
    branch: match.head.ref,
    createdAt: match.created_at,
  };
}

export async function openFixPr(input: OpenFixPrInput): Promise<FixPrResult> {
  const { token, owner, repo, defaultBranch, actions, bodyHeader } = input;
  if (actions.length === 0) {
    throw new Error("No fix actions to commit.");
  }

  const title = input.title?.trim() || DEFAULT_PR_TITLE;
  const commitBody =
    input.commitMessage?.trim() ||
    actions.map((a) => `* ${a.kind === "create" ? "create" : "update"} ${a.path}`).join("\n");

  // Each run creates a fresh PR on a timestamped branch — existing
  // seo-fixes/* PRs are surfaced upstream as informational, not terminal.
  const client = octokit(token);
  const branchName = `${BRANCH_PREFIX}/${Date.now()}`;

  // 1. Get base ref + commit + tree.
  const { data: baseRef } = await client.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const baseCommitSha = baseRef.object.sha;
  const { data: baseCommit } = await client.git.getCommit({
    owner,
    repo,
    commit_sha: baseCommitSha,
  });
  const baseTreeSha = baseCommit.tree.sha;

  // 2. Create blobs in parallel.
  const blobs = await Promise.all(
    actions.map(async (a) => {
      const { data } = await client.git.createBlob({
        owner,
        repo,
        content: Buffer.from(a.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      return { path: a.path, sha: data.sha };
    })
  );

  // 3. Create a new tree on top of the base tree.
  const { data: newTree } = await client.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644",
      type: "blob",
      sha: b.sha,
    })),
  });

  // 4. Create a single commit pointing to the new tree.
  const message = `${title}\n\n${commitBody}`;
  const { data: newCommit } = await client.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [baseCommitSha],
  });

  // 5. Create the branch ref.
  await client.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: newCommit.sha,
  });

  // 6. Open the PR.
  const { data: pr } = await client.pulls.create({
    owner,
    repo,
    head: branchName,
    base: defaultBranch,
    title,
    body: bodyHeader + PR_FOOTER,
  });

  return {
    reused: false,
    prUrl: pr.html_url,
    branch: branchName,
    number: pr.number,
  };
}
