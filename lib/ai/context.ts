import type { RepoContext } from "../types";

const README_CANDIDATES = [
  "README.md",
  "README.MD",
  "Readme.md",
  "readme.md",
  "README",
  "README.markdown",
  "README.rst",
];

const PACKAGE_CANDIDATES = ["package.json"];

const README_MAX_BYTES = 4096;

export interface RepoNarrative {
  fullName: string;
  packageName?: string;
  packageDescription?: string;
  readmeExcerpt?: string;
}

/**
 * Pulls the lightweight context an AI generator needs to write
 * project-aware content. Cheap to call repeatedly within a scan because
 * the underlying RepoContext caches file fetches.
 */
export async function buildRepoNarrative(ctx: RepoContext): Promise<RepoNarrative> {
  const narrative: RepoNarrative = { fullName: ctx.fullName };

  for (const path of PACKAGE_CANDIDATES) {
    const content = await ctx.getFile(path);
    if (!content) continue;
    try {
      const parsed = JSON.parse(content) as { name?: string; description?: string };
      if (parsed.name) narrative.packageName = parsed.name;
      if (parsed.description) narrative.packageDescription = parsed.description;
    } catch {
      // ignore
    }
    break;
  }

  for (const path of README_CANDIDATES) {
    const content = await ctx.getFile(path);
    if (!content) continue;
    narrative.readmeExcerpt = content.slice(0, README_MAX_BYTES);
    break;
  }

  return narrative;
}

export function narrativeToPromptContext(n: RepoNarrative): string {
  const lines: string[] = [];
  lines.push(`Repository: ${n.fullName}`);
  if (n.packageName) lines.push(`Package name: ${n.packageName}`);
  if (n.packageDescription) lines.push(`Package description: ${n.packageDescription}`);
  if (n.readmeExcerpt) {
    lines.push(`---`);
    lines.push(`README excerpt:`);
    lines.push(n.readmeExcerpt);
  }
  return lines.join("\n");
}
