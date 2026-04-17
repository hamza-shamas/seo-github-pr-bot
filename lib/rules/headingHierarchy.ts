import { parse } from "node-html-parser";
import type { Issue, Rule, RepoContext } from "../types";
import { findRootHtml } from "./_helpers";

const NEXT_PAGE_GLOBS = [/^app\/.*page\.(tsx|jsx|js|ts)$/, /^src\/app\/.*page\.(tsx|jsx|js|ts)$/];
const MAX_NEXT_PAGES_TO_SCAN = 20;
const H1_REGEX = /<h1[\s>]/gi;

export const headingHierarchyRule: Rule = {
  id: "heading-hierarchy",
  category: "seo",
  applies: (ctx) => ctx.mode !== "unknown",
  async detect(ctx) {
    if (ctx.mode === "html") {
      return await detectHtml(ctx);
    }
    return await detectNext(ctx);
  },
};

async function detectHtml(ctx: RepoContext): Promise<Issue[]> {
  const html = await findRootHtml(ctx);
  if (!html) return [];
  const root = parse(html.content);
  const h1Count = root.querySelectorAll("h1").length;
  if (h1Count === 1) return [];
  return [
    {
      id: `heading-hierarchy:html:${html.path}`,
      ruleId: "heading-hierarchy",
      category: "seo",
      title:
        h1Count === 0
          ? "No <h1> on the page"
          : `Multiple <h1> tags (${h1Count}) on the page`,
      severity: h1Count === 0 ? "high" : "medium",
      whyItMatters:
        "Each page should have exactly one <h1> — it's the strongest semantic cue for what the page is about. Missing h1s leave search engines guessing; multiple h1s split the topical signal and confuse generative AI summarizers.",
      evidence: `Checked: ${html.path} — found ${h1Count} <h1> tag(s)`,
    },
  ];
}

async function detectNext(ctx: RepoContext): Promise<Issue[]> {
  const pagePaths = [...ctx.tree.keys()]
    .filter((p) => NEXT_PAGE_GLOBS.some((re) => re.test(p)))
    .filter((p) => !p.includes("/node_modules/"))
    .slice(0, MAX_NEXT_PAGES_TO_SCAN);

  if (pagePaths.length === 0) return [];

  const offenders: { path: string; count: number }[] = [];
  for (const path of pagePaths) {
    const content = await ctx.getFile(path);
    if (content === null) continue;
    const matches = content.match(H1_REGEX);
    const count = matches ? matches.length : 0;
    if (count !== 1) offenders.push({ path, count });
  }

  if (offenders.length === 0) return [];

  const sample = offenders.slice(0, 5);
  const noneCount = offenders.filter((o) => o.count === 0).length;
  const multiCount = offenders.length - noneCount;

  const titleParts: string[] = [];
  if (noneCount) titleParts.push(`${noneCount} page${noneCount === 1 ? "" : "s"} with no <h1>`);
  if (multiCount)
    titleParts.push(`${multiCount} page${multiCount === 1 ? "" : "s"} with multiple <h1>`);

  return [
    {
      id: "heading-hierarchy:next",
      ruleId: "heading-hierarchy",
      category: "seo",
      title: `Heading hierarchy issues across ${offenders.length} page${
        offenders.length === 1 ? "" : "s"
      }`,
      severity: noneCount > 0 ? "high" : "medium",
      whyItMatters:
        "Each page should render exactly one <h1>. Missing h1s leave search engines guessing what the page is about; multiple h1s split the topical signal and dilute ranking. Heuristic check — h1s rendered from nested components may not show up here.",
      evidence:
        titleParts.join(", ") +
        ` (sample: ${sample
          .map((o) => `${o.path} → ${o.count} h1`)
          .join("; ")})`,
    },
  ];
}
