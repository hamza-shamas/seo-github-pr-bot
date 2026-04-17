import type { Rule } from "../types";
import { findNextLayout, findRootHtml } from "./_helpers";

export const jsonLdRule: Rule = {
  id: "json-ld",
  category: "geo",
  applies: (ctx) => ctx.mode !== "unknown",
  async detect(ctx) {
    if (ctx.mode === "next") {
      const layout = await findNextLayout(ctx);
      if (!layout) return [];
      if (/application\/ld\+json/.test(layout.content)) return [];
      return [
        {
          id: "json-ld:next",
          ruleId: this.id,
          category: this.category,
          title: "No JSON-LD structured data",
          severity: "medium",
          whyItMatters:
            "JSON-LD with Schema.org markup is how generative search engines (ChatGPT, Perplexity, Claude) understand what kind of entity your site is — software, organization, article, product. Without it, AI tools have to guess, and they often guess wrong or refuse to cite.",
          evidence: `Checked ${layout.path} — no <script type=\"application/ld+json\">`,
        },
      ];
    }

    if (ctx.mode === "html") {
      const html = await findRootHtml(ctx);
      if (!html) return [];
      if (/application\/ld\+json/.test(html.content)) return [];
      return [
        {
          id: "json-ld:html",
          ruleId: this.id,
          category: this.category,
          title: "No JSON-LD structured data",
          severity: "medium",
          whyItMatters:
            "JSON-LD with Schema.org markup is the de-facto vocabulary search engines and AI tools use to understand what your page represents. A missing JSON-LD block is the single biggest GEO (generative engine optimization) gap on most sites.",
          evidence: `Checked: ${html.path}`,
        },
      ];
    }

    return [];
  },
};
