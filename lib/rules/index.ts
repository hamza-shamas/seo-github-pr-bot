import { parse } from "node-html-parser";
import type { Issue, RepoContext, Rule } from "../types";

// =============================================================================
// Universal template-grep helper
// =============================================================================
//
// Used by the head-title / head-description rules so they can detect markup
// on any stack (Next.js, static HTML, Rails ERB, Django Jinja, Phoenix HEEx,
// Laravel Blade, Astro, SvelteKit, Vue, etc.) without per-framework parsing.
// Files are scanned in parallel; "layout-shaped" filenames are checked first
// so we usually short-circuit before hitting the cap.

const TEMPLATE_EXTENSIONS = [
  ".html", ".htm",
  ".erb", ".haml", ".slim",
  ".heex", ".eex", ".leex",
  ".blade.php",
  ".jinja", ".jinja2", ".j2",
  ".twig",
  ".vue", ".svelte", ".astro",
  ".tsx", ".jsx",
  ".liquid",
  ".hbs", ".handlebars", ".mustache",
];

const SKIP_PATH_PATTERNS = [
  /(?:^|\/)node_modules\//,
  /(?:^|\/)\.next\//,
  /(?:^|\/)\.nuxt\//,
  /(?:^|\/)\.svelte-kit\//,
  /(?:^|\/)dist\//,
  /(?:^|\/)build\//,
  /(?:^|\/)coverage\//,
  /(?:^|\/)\.git\//,
  /(?:^|\/)vendor\//,
  /(?:^|\/)_build\//,
  /(?:^|\/)deps\//,
];

const PRIORITY_KEYWORDS = [
  "layout", "layouts", "base", "application", "root",
  "app.html", "main.html", "index", "+layout",
];

const MAX_FILES_TO_FETCH = 20;

interface SearchResult {
  matched: boolean;
  matchPath?: string;
  filesScanned: number;
}

async function searchTemplates(ctx: RepoContext, pattern: RegExp): Promise<SearchResult> {
  const candidates = collectCandidates(ctx);
  if (candidates.length === 0) return { matched: false, filesScanned: 0 };

  const target = candidates.slice(0, MAX_FILES_TO_FETCH);
  const results = await Promise.all(
    target.map(async (path) => ({ path, content: await ctx.getFile(path) }))
  );

  for (const { path, content } of results) {
    if (content === null) continue;
    if (pattern.test(content)) {
      return { matched: true, matchPath: path, filesScanned: results.length };
    }
  }
  return { matched: false, filesScanned: results.length };
}

function collectCandidates(ctx: RepoContext): string[] {
  const priority: string[] = [];
  const rest: string[] = [];
  for (const path of ctx.tree.keys()) {
    const lower = path.toLowerCase();
    if (!TEMPLATE_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
    if (SKIP_PATH_PATTERNS.some((re) => re.test(path))) continue;
    if (PRIORITY_KEYWORDS.some((kw) => lower.includes(kw))) priority.push(path);
    else rest.push(path);
  }
  return [...priority, ...rest];
}

// =============================================================================
// Rule 1 — No robots.txt
// =============================================================================

const robotsTxtRule: Rule = {
  id: "robots-txt",
  category: "seo",
  applies: () => true,
  async detect(ctx) {
    const candidates = ["robots.txt", "public/robots.txt", "static/robots.txt"];
    if (ctx.hasAnyPath(candidates)) return [];
    return [
      {
        id: "robots-txt:missing",
        ruleId: "robots-txt",
        category: "seo",
        title: "No robots.txt",
        severity: "high",
        whyItMatters:
          "robots.txt tells crawlers (and AI agents) which paths to fetch. Without it, every crawler defaults to its own assumptions, which often means private/admin paths get indexed and your real content is starved of crawl budget.",
        evidence: `Searched for: ${candidates.join(", ")}`,
      },
    ];
  },
};

// =============================================================================
// Rule 2 — No sitemap.xml
// =============================================================================

const sitemapXmlRule: Rule = {
  id: "sitemap-xml",
  category: "seo",
  applies: () => true,
  async detect(ctx) {
    const candidates = [
      "sitemap.xml",
      "public/sitemap.xml",
      "static/sitemap.xml",
      "app/sitemap.ts",
      "app/sitemap.js",
    ];
    if (ctx.hasAnyPath(candidates)) return [];
    return [
      {
        id: "sitemap-xml:missing",
        ruleId: "sitemap-xml",
        category: "seo",
        title: "No sitemap.xml",
        severity: "high",
        whyItMatters:
          "A sitemap is the canonical list of URLs you want indexed. Without it, search engines have to discover your pages by following links — slower, less reliable, and they often miss deep or paginated routes entirely.",
        evidence: `Searched for: ${candidates.join(", ")}`,
      },
    ];
  },
};

// =============================================================================
// Rule 3 — Missing <title>
// =============================================================================

const headTitleRule: Rule = {
  id: "head-title",
  category: "seo",
  applies: () => true,
  async detect(ctx) {
    if (ctx.mode === "html") {
      const html = await findRootHtml(ctx);
      if (!html) return runUniversalTitle(ctx);
      const root = parse(html.content);
      const text = root.querySelector("title")?.text?.trim();
      if (text) return [];
      return [
        {
          id: "head-title:html",
          ruleId: "head-title",
          category: "seo",
          title: "Missing or empty <title>",
          severity: "high",
          whyItMatters: TITLE_WHY,
          evidence: `Checked: ${html.path}`,
        },
      ];
    }
    return runUniversalTitle(ctx);
  },
};

const TITLE_WHY =
  "The <title> tag is the single biggest on-page SEO signal — it's what search engines underline in results, what browsers show in tabs, and what social cards fall back to when og:title is missing. A repo with no <title> anywhere leaves every page rendering as the framework default.";

// Two patterns considered "title is set":
//   - the literal <title> HTML tag (any template language)
//   - a Next.js metadata export (or similar) that includes a `title:` key
const TITLE_PATTERNS: RegExp[] = [
  /<title[\s>]/i,
  /\bmetadata\b[\s\S]{0,800}?\btitle\s*:/,
];

async function runUniversalTitle(ctx: RepoContext): Promise<Issue[]> {
  for (const pattern of TITLE_PATTERNS) {
    const result = await searchTemplates(ctx, pattern);
    if (result.matched) return [];
  }
  return [
    {
      id: "head-title:universal",
      ruleId: "head-title",
      category: "seo",
      title: "No <title> tag found in any template",
      severity: "high",
      whyItMatters: TITLE_WHY,
      evidence:
        "Scanned template files (.html / .erb / .heex / .blade.php / .tsx / .vue / .astro / etc.) — no <title> tag and no Next.js metadata.title export",
    },
  ];
}

// =============================================================================
// Rule 4 — Missing meta description
// =============================================================================

const headDescriptionRule: Rule = {
  id: "head-description",
  category: "seo",
  applies: () => true,
  async detect(ctx) {
    if (ctx.mode === "html") {
      const html = await findRootHtml(ctx);
      if (!html) return runUniversalDescription(ctx);
      const root = parse(html.content);
      const desc = root
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
        ?.trim();
      if (desc) return [];
      return [
        {
          id: "head-description:html",
          ruleId: "head-description",
          category: "seo",
          title: 'Missing <meta name="description">',
          severity: "high",
          whyItMatters: DESCRIPTION_WHY,
          evidence: `Checked: ${html.path}`,
        },
      ];
    }
    return runUniversalDescription(ctx);
  },
};

const DESCRIPTION_WHY =
  "Without a meta description, search engines synthesize their own from page text — usually awkwardly. Click-through rates drop noticeably when the snippet doesn't read naturally, and AI search engines (Perplexity, ChatGPT) often refuse to cite pages without one.";

// Two patterns considered "description is set":
//   - the literal <meta name="description"> tag (any template language)
//   - a Next.js metadata export that includes a `description:` key
const DESCRIPTION_PATTERNS: RegExp[] = [
  /<meta\s+[^>]*name\s*=\s*["']description["']/i,
  /\bmetadata\b[\s\S]{0,800}?\bdescription\s*:/,
];

async function runUniversalDescription(ctx: RepoContext): Promise<Issue[]> {
  for (const pattern of DESCRIPTION_PATTERNS) {
    const result = await searchTemplates(ctx, pattern);
    if (result.matched) return [];
  }
  return [
    {
      id: "head-description:universal",
      ruleId: "head-description",
      category: "seo",
      title: "No meta description found in any template",
      severity: "high",
      whyItMatters: DESCRIPTION_WHY,
      evidence:
        'Scanned template files — no <meta name="description"> tag and no Next.js metadata.description export',
    },
  ];
}

// =============================================================================
// Helpers (kept here so this is the single rules file)
// =============================================================================

const ERROR_PAGE_REGEX = /(?:^|\/)(?:[345]\d\d|maintenance|offline|coming-soon)\.html$/i;

export function findRootHtmlPath(ctx: RepoContext): string | null {
  if (ctx.hasPath("index.html")) return "index.html";
  if (ctx.hasPath("public/index.html")) return "public/index.html";
  for (const path of ctx.tree.keys()) {
    if (path === "index.html") return path;
    if (path.endsWith("/index.html") && !path.includes("/node_modules/")) return path;
  }
  for (const path of ctx.tree.keys()) {
    if (!path.endsWith(".html")) continue;
    if (path.includes("/node_modules/")) continue;
    if (ERROR_PAGE_REGEX.test(path)) continue;
    return path;
  }
  return null;
}

async function findRootHtml(
  ctx: RepoContext
): Promise<{ path: string; content: string } | null> {
  const path = findRootHtmlPath(ctx);
  if (!path) return null;
  const content = await ctx.getFile(path);
  if (content === null) return null;
  return { path, content };
}

// =============================================================================
// Registry
// =============================================================================

export const RULES: Rule[] = [
  robotsTxtRule,
  sitemapXmlRule,
  headTitleRule,
  headDescriptionRule,
];
