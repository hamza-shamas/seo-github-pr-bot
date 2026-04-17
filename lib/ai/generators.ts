import { aiClient, aiModel, isAiEnabled } from "./client";
import { buildRepoNarrative, narrativeToPromptContext, type RepoNarrative } from "./context";
import type { RepoContext } from "../types";

const SYSTEM_PROMPT_BASE = `You write tight, factual SEO copy for software project pages. Avoid marketing fluff, hype, and emoji. If the project context is too thin to write meaningfully, output the literal token "TODO_PLACEHOLDER" so a human knows to customize it later.`;

interface GenInput {
  ctx: RepoContext;
}

export interface AiCopy {
  title: string;
  description: string;
}

/** Returns null when AI is disabled, the model errors, or output is the TODO sentinel. */
async function generate(prompt: string, maxTokens = 220): Promise<string | null> {
  if (!isAiEnabled()) return null;
  try {
    const res = await aiClient().chat.completions.create({
      model: aiModel(),
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_BASE },
        { role: "user", content: prompt },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text || text.includes("TODO_PLACEHOLDER")) return null;
    return text;
  } catch {
    return null;
  }
}

export async function generateMetaCopy(input: GenInput): Promise<AiCopy | null> {
  const narrative = await buildRepoNarrative(input.ctx);
  const text = await generate(
    `Project context:\n${narrativeToPromptContext(narrative)}\n\n` +
      `Write a JSON object with two keys:\n` +
      `- "title": ≤60 characters, the page <title>. Include the project name.\n` +
      `- "description": ≤160 characters, the meta description. One concrete sentence about what the project is and who it's for. No marketing tone.\n\n` +
      `Output ONLY the JSON object, no prose, no code fence.`,
    300
  );
  if (!text) return null;
  try {
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { title?: string; description?: string };
    if (!parsed.title || !parsed.description) return null;
    return {
      title: clamp(parsed.title.trim(), 60),
      description: clamp(parsed.description.trim(), 160),
    };
  } catch {
    return null;
  }
}

export interface SitemapEntry {
  loc: string;
}

/**
 * For Next.js mode we infer routes from app/**\/page.tsx;
 * for HTML mode from *.html files at root.
 * AI is used only to pick a sensible base URL slug, not to invent routes.
 */
export async function inferSitemapEntries(ctx: RepoContext): Promise<SitemapEntry[]> {
  const paths = [...ctx.tree.keys()];
  const entries = new Set<string>();

  if (ctx.mode === "next") {
    for (const p of paths) {
      const m = p.match(/^(?:src\/)?app\/(.*)\/page\.(?:tsx|jsx|js|ts)$/);
      if (!m) continue;
      const route = "/" + m[1].replace(/^\(.*?\)\//, "").replace(/\(.*?\)\//g, "");
      entries.add(normalizeRoute(route));
    }
    if (paths.some((p) => /^(?:src\/)?app\/page\.(?:tsx|jsx|js|ts)$/.test(p))) {
      entries.add("/");
    }
  } else if (ctx.mode === "html") {
    for (const p of paths) {
      if (!p.endsWith(".html") || p.includes("/node_modules/")) continue;
      if (p === "index.html") {
        entries.add("/");
        continue;
      }
      entries.add("/" + p.replace(/index\.html$/, "").replace(/\.html$/, ""));
    }
  }

  if (entries.size === 0) entries.add("/");
  return [...entries].sort().map((loc) => ({ loc }));
}

export interface GeoSummary {
  text: string;
}

export async function generateGeoSummary(
  ctx: RepoContext,
  issues: { title: string; severity: string }[]
): Promise<GeoSummary | null> {
  const narrative = await buildRepoNarrative(ctx);
  const issuesBlock = issues.length
    ? issues.map((i) => `- [${i.severity}] ${i.title}`).join("\n")
    : "(none — repo is clean)";
  const text = await generate(
    `Project context:\n${narrativeToPromptContext(narrative)}\n\n` +
      `Detected SEO + GEO issues:\n${issuesBlock}\n\n` +
      `Write 2–3 sentences summarizing how AI-search-friendly this repo is right now and what shipping the fixes would unlock. Plain prose, no headings, no bullets, no marketing tone.`,
    220
  );
  if (!text) return null;
  return { text };
}

function clamp(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

function normalizeRoute(r: string): string {
  if (!r.startsWith("/")) r = "/" + r;
  return r.replace(/\/$/, "") || "/";
}
