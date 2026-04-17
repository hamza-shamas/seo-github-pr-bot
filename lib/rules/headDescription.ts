import type { Rule } from "../types";
import { extractNextMetadataBlock, findNextLayout, findRootHtml, metadataHasKey } from "./_helpers";
import { parse } from "node-html-parser";

export const headDescriptionRule: Rule = {
  id: "head-description",
  category: "seo",
  applies: (ctx) => ctx.mode !== "unknown",
  async detect(ctx) {
    if (ctx.mode === "next") {
      const layout = await findNextLayout(ctx);
      if (!layout) return [];
      const block = extractNextMetadataBlock(layout.content);
      if (block && metadataHasKey(block, "description")) return [];
      return [
        {
          id: "head-description:next-layout",
          ruleId: this.id,
          category: this.category,
          title: "Missing meta description in app/layout.tsx",
          severity: "high",
          whyItMatters:
            "The meta description is the snippet shown under your link in search results. Without it, Google generates one from page text — usually a confusing cut-off sentence — and AI search engines fall back to whatever they can scrape, often missing your value prop entirely.",
          evidence: `Checked: ${layout.path} — no \`description:\` in metadata export`,
        },
      ];
    }

    if (ctx.mode === "html") {
      const html = await findRootHtml(ctx);
      if (!html) return [];
      const root = parse(html.content);
      const desc = root
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
        ?.trim();
      if (desc) return [];
      return [
        {
          id: "head-description:html",
          ruleId: this.id,
          category: this.category,
          title: 'Missing <meta name="description">',
          severity: "high",
          whyItMatters:
            "Without a meta description, search engines synthesize their own from page content — usually awkwardly. Click-through rates drop noticeably when the snippet doesn't read naturally.",
          evidence: `Checked: ${html.path}`,
        },
      ];
    }

    return [];
  },
};
