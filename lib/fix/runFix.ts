import { buildRepoContext } from "../github/repoContext";
import { runScan } from "../scan/runScan";
import { buildFixForIssues } from "./buildFix";
import { openFixPr, type FixPrResult } from "../github/pr";
import { autoFixDescription, isAutoFixable } from "./transforms";

export interface RunFixInput {
  token: string;
  owner: string;
  name: string;
  defaultBranch: string;
  selectedIssueIds: string[];
}

export interface RunFixResult {
  result: FixPrResult;
  appliedRuleIds: string[];
  skippedRuleIds: string[];
  aiUsed: boolean;
}

export async function runFix(input: RunFixInput): Promise<RunFixResult> {
  const scan = await runScan({
    token: input.token,
    owner: input.owner,
    name: input.name,
    defaultBranch: input.defaultBranch,
  });

  const selectedSet = new Set(input.selectedIssueIds);
  const selected = scan.issues.filter(
    (i) => selectedSet.has(i.id) && isAutoFixable(i.ruleId, scan.repo.mode)
  );

  if (selected.length === 0) {
    throw new Error("None of the selected issues are auto-fixable in this repo.");
  }

  // Re-build a RepoContext so buildFix has tree + cached file getter.
  const ctx = await buildRepoContext({
    token: input.token,
    owner: input.owner,
    name: input.name,
    defaultBranch: input.defaultBranch,
  });

  const built = await buildFixForIssues(selected, ctx);

  if (built.actions.length === 0) {
    throw new Error("Selected issues didn't produce any file changes.");
  }

  const summaryLines = built.appliedRuleIds.map(
    (id) => `- **${id}** — ${autoFixDescription(id, scan.repo.mode)}`
  );
  const aiNote = built.aiUsed
    ? "Content for titles / descriptions / sitemap entries was drafted by Claude Haiku 4.5 via the Vercel AI Gateway. Review before merging."
    : "Content uses static placeholders (no AI key was configured). Replace TODOs before merging.";

  const bodyHeader =
    `## What this PR does\n\n` +
    summaryLines.join("\n") +
    `\n\n## Files\n\n` +
    built.actions.map((a) => `- \`${a.kind}\` \`${a.path}\``).join("\n") +
    `\n\n---\n${aiNote}`;

  const result = await openFixPr({
    token: input.token,
    owner: input.owner,
    repo: input.name,
    defaultBranch: input.defaultBranch,
    actions: built.actions,
    bodyHeader,
  });

  return {
    result,
    appliedRuleIds: built.appliedRuleIds,
    skippedRuleIds: built.skippedRuleIds,
    aiUsed: built.aiUsed,
  };
}
