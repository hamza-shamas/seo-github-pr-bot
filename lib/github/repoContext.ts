import type { Octokit } from "@octokit/rest";
import { octokit } from "./client";
import type { RepoContext, RepoMode, TreeEntry } from "../types";
import { detectRepoMode } from "../scan/detect";

interface BuildContextInput {
  token: string;
  owner: string;
  name: string;
  defaultBranch: string;
}

export async function buildRepoContext({
  token,
  owner,
  name,
  defaultBranch,
}: BuildContextInput): Promise<RepoContext> {
  const client = octokit(token);
  const tree = await loadTree(client, owner, name, defaultBranch);
  const fileCache = new Map<string, string | null>();

  const ctx: RepoContext = {
    owner,
    repo: name,
    fullName: `${owner}/${name}`,
    defaultBranch,
    mode: "unknown",
    treeTruncated: tree.truncated,
    tree: tree.entries,
    hasPath(path) {
      return tree.entries.has(path);
    },
    hasAnyPath(paths) {
      return paths.some((p) => tree.entries.has(p));
    },
    async getFile(path) {
      if (fileCache.has(path)) return fileCache.get(path) ?? null;
      const entry = tree.entries.get(path);
      if (!entry || entry.type !== "blob") {
        fileCache.set(path, null);
        return null;
      }
      try {
        const { data } = await client.git.getBlob({
          owner,
          repo: name,
          file_sha: entry.sha,
        });
        const decoded =
          data.encoding === "base64"
            ? Buffer.from(data.content, "base64").toString("utf8")
            : data.content;
        fileCache.set(path, decoded);
        return decoded;
      } catch {
        fileCache.set(path, null);
        return null;
      }
    },
  };

  ctx.mode = await detectRepoMode(ctx);
  return ctx;
}

interface LoadedTree {
  entries: Map<string, TreeEntry>;
  truncated: boolean;
}

async function loadTree(
  client: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<LoadedTree> {
  const { data: branchData } = await client.repos.getBranch({
    owner,
    repo,
    branch,
  });
  const treeSha = branchData.commit.commit.tree.sha;

  const { data: treeData } = await client.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: "1",
  });

  const entries = new Map<string, TreeEntry>();
  for (const e of treeData.tree) {
    if (!e.path || (e.type !== "blob" && e.type !== "tree")) continue;
    if (!e.sha) continue;
    entries.set(e.path, {
      path: e.path,
      type: e.type,
      sha: e.sha,
      size: e.size,
    });
  }

  return { entries, truncated: Boolean(treeData.truncated) };
}
