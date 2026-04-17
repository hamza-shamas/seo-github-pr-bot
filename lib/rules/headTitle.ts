import type { Rule } from "../types";
import { extractNextMetadataBlock, findNextLayout, findRootHtml, metadataHasKey } from "./_helpers";
import { parse } from "node-html-parser";

export const headTitleRule: Rule = {
  id: "head-title",
  category: "seo",
  applies: (ctx) => ctx.mode !== "unknown",
  async detect(ctx) {
    if (ctx.mode === "next") {
      const layout = await findNextLayout(ctx);
      if (!layout) return [];
      const block = extractNextMetadataBlock(layout.content);
      if (block && metadataHasKey(block, "title")) return [];
      return [
        {
          id: "head-title:next-layout",
          ruleId: this.id,
          category: this.category,
          title: "Missing <title> in app/layout.tsx metadata",
          severity: "high",
          whyItMatters:
            "The <title> tag is the single biggest on-page SEO signal — it's what search engines underline in results, what browsers show in tabs, and what social cards fall back to when og:title is missing. A repo without a top-level title leaves every page rendering as the framework default.",
          evidence: `Checked: ${layout.path} — no \`title:\` in metadata export`,
        },
      ];
    }

    if (ctx.mode === "html") {
      const html = await findRootHtml(ctx);
      if (!html) return [];
      const root = parse(html.content);
      const title = root.querySelector("title")?.text?.trim();
      if (title) return [];
      return [
        {
          id: "head-title:html",
          ruleId: this.id,
          category: this.category,
          title: "Missing or empty <title>",
          severity: "high",
          whyItMatters:
            "The <title> tag is the single biggest on-page SEO signal. Browsers, search engines, and social platforms all read it first. An empty or missing title is one of the most common ranking blockers.",
          evidence: `Checked: ${html.path}`,
        },
      ];
    }

    return [];
  },
};
