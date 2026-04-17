import type { Issue } from "../types";
import type { AgentProposal } from "./types";

const SEVERITY_LABEL: Record<Issue["severity"], string> = {
  high: "**HIGH**",
  medium: "**MEDIUM**",
  low: "**LOW**",
};

const CATEGORY_LABEL: Record<Issue["category"], string> = {
  seo: "SEO",
  geo: "GEO",
};

interface BuildPrBodyInput {
  fullName: string;
  issues: Issue[];
  proposals: AgentProposal[];
}

export function buildPrBody({
  fullName,
  issues,
  proposals,
}: BuildPrBodyInput): string {
  // Only describe issues the agent actually addressed. If the agent decided
  // an issue was a false positive (e.g. detection grepped for <title> but
  // the repo uses Next.js metadata.title — already valid), it correctly
  // skipped the proposal, and we shouldn't claim to have fixed it.
  const addressed = issues.filter((i) => isAddressedByProposals(i, proposals));
  const skipped = issues.filter((i) => !addressed.includes(i));

  const sections = [
    intro(fullName, addressed.length, proposals.length),
    addressed.length > 0 ? issuesSection(addressed) : "",
    skipped.length > 0 ? skippedSection(skipped) : "",
    changesSection(proposals, addressed),
    reviewChecklist(proposals, addressed),
  ].filter((s) => s !== "");
  return sections.join("\n\n");
}

/** Heuristic: does any proposal address this issue? Matches by the path
 * that's typical for the rule, plus a content sniff for head-* rules. */
function isAddressedByProposals(issue: Issue, proposals: AgentProposal[]): boolean {
  for (const p of proposals) {
    const lower = p.path.toLowerCase();
    if (issue.ruleId === "robots-txt" && lower.endsWith("robots.txt")) return true;
    if (issue.ruleId === "sitemap-xml" && lower.endsWith("sitemap.xml")) return true;
    if (issue.ruleId === "head-title" && /<title[\s>]/i.test(p.content)) return true;
    if (
      issue.ruleId === "head-description" &&
      /<meta\s+[^>]*name\s*=\s*["']description["']/i.test(p.content)
    ) {
      return true;
    }
  }
  return false;
}

function skippedSection(skipped: Issue[]): string {
  const lines: string[] = [
    `## Issues the agent did not fix`,
    ``,
    `The agent inspected the repo and decided these flagged issues didn't actually need a code change (likely because the repo already addresses them in a way our static scanner missed). Re-check the relevant rule manually if you disagree.`,
    ``,
  ];
  for (const issue of skipped) {
    lines.push(`- **${issue.title}** *(rule: \`${issue.ruleId}\`)*`);
  }
  return lines.join("\n");
}

function intro(fullName: string, issueCount: number, fileCount: number): string {
  const i = pluralize(issueCount, "issue");
  const f = pluralize(fileCount, "file");
  return [
    `## Summary`,
    ``,
    `An AI agent scanned **${fullName}** with the SEO + GEO ruleset, ` +
      `found ${i}, and proposed ${f} of changes to fix them.`,
  ].join("\n");
}

function issuesSection(issues: Issue[]): string {
  const blocks = issues.map((issue) => {
    const lines: string[] = [];
    lines.push(
      `### ${SEVERITY_LABEL[issue.severity]} · ${CATEGORY_LABEL[issue.category]} · ${issue.title}`
    );
    lines.push(``);
    lines.push(`*Rule: \`${issue.ruleId}\`*`);
    lines.push(``);
    lines.push(`**Why it matters.** ${issue.whyItMatters}`);
    if (issue.evidence) {
      lines.push(``);
      lines.push(`**Evidence.** \`${issue.evidence}\``);
    }
    return lines.join("\n");
  });
  return [`## Issues fixed`, ``, blocks.join("\n\n")].join("\n");
}

function changesSection(proposals: AgentProposal[], issues: Issue[]): string {
  const lines: string[] = [`## Changes proposed by the agent`, ``];
  for (const p of proposals) {
    const action = p.kind === "create" ? "Create" : "Update";
    const why = describeChange(p, issues);
    lines.push(
      `- **${action}** \`${p.path}\` *(${formatBytes(p.content.length)})* — ${why}`
    );
  }
  return lines.join("\n");
}

function describeChange(p: AgentProposal, issues: Issue[]): string {
  const lower = p.path.toLowerCase();
  if (lower.endsWith("sitemap.xml")) {
    return "populates the sitemap with the routes the agent discovered in the repo";
  }
  if (lower.endsWith("robots.txt")) {
    return "adds a permissive crawl policy with a `Sitemap:` reference";
  }
  if (p.kind === "update") {
    const headTags: string[] = [];
    for (const issue of issues) {
      if (issue.ruleId === "head-title") headTags.push("`<title>`");
      if (issue.ruleId === "head-description") headTags.push("`<meta name=\"description\">`");
    }
    if (headTags.length > 0) {
      return `injects ${headTags.join(" + ")} into the layout's \`<head>\` (other markup preserved)`;
    }
    return "applies the agent's proposed edit";
  }
  return "applies the agent's proposed change";
}

function reviewChecklist(proposals: AgentProposal[], issues: Issue[]): string {
  const items: string[] = [];

  const hasSitemap = proposals.some((p) => p.path.endsWith("sitemap.xml"));
  const hasRobots = proposals.some((p) => p.path.endsWith("robots.txt"));
  if (hasSitemap || hasRobots) {
    items.push(
      "Verify the host in any generated `sitemap.xml` / `robots.txt` matches your production domain."
    );
  }

  const hasLayoutEdit = proposals.some(
    (p) => p.kind === "update" && /\.(erb|haml|slim|html|heex|eex|blade\.php|astro|svelte|vue|tsx|jsx)$/i.test(p.path)
  );
  if (hasLayoutEdit) {
    items.push(
      "Render the page locally and confirm the new tag appears in the rendered `<head>` (and that no existing markup broke)."
    );
  }

  const hasMetaCopy = issues.some(
    (i) => i.ruleId === "head-title" || i.ruleId === "head-description"
  );
  if (hasMetaCopy) {
    items.push(
      "Read the AI-drafted title / meta description copy and tweak it if the tone or framing isn't right."
    );
  }

  if (items.length === 0) return "";

  return [`## Review checklist`, ``, ...items.map((i) => `- [ ] ${i}`)].join("\n");
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
