import type { Rule } from "../types";

export const sitemapXmlRule: Rule = {
  id: "sitemap-xml",
  category: "seo",
  applies: () => true,
  async detect(ctx) {
    const candidates =
      ctx.mode === "next"
        ? ["public/sitemap.xml", "app/sitemap.ts", "app/sitemap.js"]
        : ["sitemap.xml", "public/sitemap.xml"];

    if (ctx.hasAnyPath(candidates)) return [];

    return [
      {
        id: "sitemap-xml:missing",
        ruleId: this.id,
        category: this.category,
        title: "No sitemap.xml",
        severity: "high",
        whyItMatters:
          "A sitemap is the canonical list of URLs you want indexed. Without it, search engines have to discover your pages by following links — slower, less reliable, and they often miss deep or paginated routes entirely.",
        evidence: `Searched for: ${candidates.join(", ")}`,
      },
    ];
  },
};
