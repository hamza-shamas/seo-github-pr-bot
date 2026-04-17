import type { RepoContext, RepoMode } from "../types";

const NEXT_CONFIG_PATHS = [
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
];

const HTML_AT_ROOT_PATHS = ["index.html", "public/index.html"];

export async function detectRepoMode(ctx: RepoContext): Promise<RepoMode> {
  if (ctx.hasAnyPath(NEXT_CONFIG_PATHS)) return "next";

  const pkg = await ctx.getFile("package.json");
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (parsed.dependencies?.next || parsed.devDependencies?.next) return "next";
    } catch {
      // ignore malformed package.json
    }
  }

  if (ctx.hasAnyPath(HTML_AT_ROOT_PATHS)) return "html";

  for (const path of ctx.tree.keys()) {
    if (path.endsWith(".html") && !path.includes("/node_modules/")) return "html";
  }

  return "unknown";
}
