import type { Issue, RepoContext } from "../types";
import { findRootHtmlPath } from "../rules";
import type { AiCopy, SitemapEntry } from "../ai/generators";

export type Transform =
  | { kind: "create-file"; path: string; content: string }
  | { kind: "inject-html-head"; path: string; insert: string };

export interface AiBundle {
  copy: AiCopy | null;
  sitemapEntries: SitemapEntry[];
}

const PLACEHOLDER_BASE_URL = "https://example.com";

export function transformsFor(issue: Issue, ctx: RepoContext, ai: AiBundle): Transform[] {
  switch (issue.ruleId) {
    case "robots-txt":
      return transformsForRobots(ctx);
    case "sitemap-xml":
      return transformsForSitemap(ctx, ai);
    case "head-title":
      return transformsForTitle(ctx, ai);
    case "head-description":
      return transformsForDescription(ctx, ai);
    default:
      return [];
  }
}

function transformsForRobots(ctx: RepoContext): Transform[] {
  const path = ctx.mode === "next" ? "public/robots.txt" : "robots.txt";
  return [
    {
      kind: "create-file",
      path,
      content:
        "User-agent: *\n" +
        "Allow: /\n\n" +
        "# Replace example.com with your production hostname.\n" +
        `Sitemap: ${PLACEHOLDER_BASE_URL}/sitemap.xml\n`,
    },
  ];
}

function transformsForSitemap(ctx: RepoContext, ai: AiBundle): Transform[] {
  const path = ctx.mode === "next" ? "public/sitemap.xml" : "sitemap.xml";
  const today = new Date().toISOString().slice(0, 10);
  const entries = ai.sitemapEntries.length ? ai.sitemapEntries : [{ loc: "/" }];
  const urls = entries
    .map((e) => {
      const loc = `${PLACEHOLDER_BASE_URL}${e.loc === "/" ? "" : e.loc}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`;
    })
    .join("\n");
  const content =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n` +
    `</urlset>\n`;
  return [{ kind: "create-file", path, content }];
}

function transformsForTitle(ctx: RepoContext, ai: AiBundle): Transform[] {
  if (ctx.mode !== "html") return [];
  const path = findRootHtmlPath(ctx);
  if (!path) return [];
  const title = ai.copy?.title ?? `${ctx.repo} — TODO add a real title`;
  return [
    {
      kind: "inject-html-head",
      path,
      insert: `<title>${escapeHtmlText(title)}</title>`,
    },
  ];
}

function transformsForDescription(ctx: RepoContext, ai: AiBundle): Transform[] {
  if (ctx.mode !== "html") return [];
  const path = findRootHtmlPath(ctx);
  if (!path) return [];
  const description =
    ai.copy?.description ??
    `TODO add a real meta description for ${ctx.repo}.`;
  return [
    {
      kind: "inject-html-head",
      path,
      insert: `<meta name="description" content="${escapeAttr(description)}" />`,
    },
  ];
}

/** True if this rule has any auto-fix in the given mode. Drives selection UI. */
export function isAutoFixable(ruleId: string, mode: RepoContext["mode"]): boolean {
  if (ruleId === "robots-txt" || ruleId === "sitemap-xml") return true;
  if (ruleId === "head-title" || ruleId === "head-description") return mode === "html";
  return false;
}

/** Short user-facing description shown in the PR body. */
export function autoFixDescription(ruleId: string, mode: RepoContext["mode"]): string {
  if (ruleId === "robots-txt") {
    return mode === "next" ? "Create public/robots.txt" : "Create robots.txt";
  }
  if (ruleId === "sitemap-xml") {
    return mode === "next"
      ? "Create public/sitemap.xml from inferred routes"
      : "Create sitemap.xml";
  }
  if (ruleId === "head-title") return "Inject <title> into <head>";
  if (ruleId === "head-description") return "Inject <meta name=description>";
  return "Apply auto-fix";
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtmlText(s).replace(/"/g, "&quot;");
}
