import type { RepoContext } from "../types";

const NEXT_LAYOUT_PATHS = [
  "app/layout.tsx",
  "app/layout.jsx",
  "app/layout.js",
  "app/layout.ts",
  "src/app/layout.tsx",
  "src/app/layout.jsx",
  "src/app/layout.js",
  "src/app/layout.ts",
];

export async function findNextLayout(
  ctx: RepoContext
): Promise<{ path: string; content: string } | null> {
  for (const p of NEXT_LAYOUT_PATHS) {
    if (!ctx.hasPath(p)) continue;
    const content = await ctx.getFile(p);
    if (content !== null) return { path: p, content };
  }
  return null;
}

export function findRootHtmlPath(ctx: RepoContext): string | null {
  if (ctx.hasPath("index.html")) return "index.html";
  if (ctx.hasPath("public/index.html")) return "public/index.html";
  for (const path of ctx.tree.keys()) {
    if (path === "index.html") return path;
    if (path.endsWith("/index.html") && !path.includes("/node_modules/")) return path;
  }
  for (const path of ctx.tree.keys()) {
    if (path.endsWith(".html") && !path.includes("/node_modules/")) return path;
  }
  return null;
}

export async function findRootHtml(
  ctx: RepoContext
): Promise<{ path: string; content: string } | null> {
  const path = findRootHtmlPath(ctx);
  if (!path) return null;
  const content = await ctx.getFile(path);
  if (content === null) return null;
  return { path, content };
}

/**
 * Lightweight string detection of an exported `metadata` object literal.
 * Matches `export const metadata` / `export const metadata: Metadata`
 * variants. Returns the body of the object (between the outermost { ... })
 * or null. Bails out on `generateMetadata` (function form).
 */
export function extractNextMetadataBlock(source: string): string | null {
  if (/export\s+(?:async\s+)?function\s+generateMetadata\b/.test(source)) {
    return null;
  }
  const match = source.match(
    /export\s+const\s+metadata(?:\s*:\s*[A-Za-z0-9_<>,\s.|&[\]]+)?\s*=\s*\{/
  );
  if (!match) return null;
  const start = match.index! + match[0].length - 1; // position of the opening {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(start + 1, i);
      }
    }
  }
  return null;
}

/** Crude key presence check inside the metadata block body. */
export function metadataHasKey(block: string, key: string): boolean {
  const re = new RegExp(`(^|[\\{,\\s])${key}\\s*:`);
  return re.test(block);
}
