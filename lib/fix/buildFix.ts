import type { Issue, FixAction, RepoContext } from "../types";
import { generateMetaCopy, inferSitemapEntries } from "../ai/generators";
import { isAiEnabled } from "../ai/client";
import { transformsFor, type AiBundle, type Transform } from "./transforms";

export interface BuiltFix {
  actions: FixAction[];
  appliedRuleIds: string[];
  skippedRuleIds: string[];
  aiUsed: boolean;
}

export async function buildFixForIssues(
  selectedIssues: Issue[],
  ctx: RepoContext
): Promise<BuiltFix> {
  const ai = await prepareAiBundle(selectedIssues, ctx);
  const fileStates = new Map<
    string,
    { kind: "create" | "update"; content: string; original: string | null }
  >();

  const applied = new Set<string>();
  const skipped: string[] = [];

  for (const issue of selectedIssues) {
    const transforms = transformsFor(issue, ctx, ai);
    if (transforms.length === 0) {
      skipped.push(issue.ruleId);
      continue;
    }
    for (const t of transforms) {
      await applyTransform(t, fileStates, ctx);
    }
    applied.add(issue.ruleId);
  }

  const actions: FixAction[] = [...fileStates.entries()].map(([path, state]) => ({
    kind: state.kind,
    path,
    content: state.content,
  }));

  return {
    actions,
    appliedRuleIds: [...applied],
    skippedRuleIds: skipped,
    aiUsed: isAiEnabled() && ai.copy !== null,
  };
}

async function applyTransform(
  t: Transform,
  fileStates: Map<
    string,
    { kind: "create" | "update"; content: string; original: string | null }
  >,
  ctx: RepoContext
): Promise<void> {
  if (t.kind === "create-file") {
    const existed = ctx.hasPath(t.path);
    fileStates.set(t.path, {
      kind: existed ? "update" : "create",
      content: t.content,
      original: existed ? await ctx.getFile(t.path) : null,
    });
    return;
  }

  if (t.kind === "inject-html-head") {
    let state = fileStates.get(t.path);
    if (!state) {
      const original = await ctx.getFile(t.path);
      if (original === null) return; // can't inject into a file we can't read
      state = { kind: "update", content: original, original };
      fileStates.set(t.path, state);
    }
    state.content = injectIntoHtmlHead(state.content, t.insert);
  }
}

function injectIntoHtmlHead(html: string, snippet: string): string {
  const indented = "  " + snippet.replace(/\n/g, "\n  ") + "\n";
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${indented}</head>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${indented}`);
  }
  // No <head> at all — wrap in a minimal one before any <body> or at the top.
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (m) => `<head>\n${indented}</head>\n${m}`);
  }
  return `<head>\n${indented}</head>\n${html}`;
}

async function prepareAiBundle(issues: Issue[], ctx: RepoContext): Promise<AiBundle> {
  const ruleIds = new Set(issues.map((i) => i.ruleId));
  const needsCopy = ruleIds.has("head-title") || ruleIds.has("head-description");
  const needsSitemap = ruleIds.has("sitemap-xml");

  const [copy, sitemapEntries] = await Promise.all([
    needsCopy ? generateMetaCopy({ ctx }) : Promise.resolve(null),
    needsSitemap ? inferSitemapEntries(ctx) : Promise.resolve([]),
  ]);

  return { copy, sitemapEntries };
}
