import type { Rule } from "../types";

export const robotsTxtRule: Rule = {
  id: "robots-txt",
  category: "seo",
  applies: () => true,
  async detect(ctx) {
    const candidates =
      ctx.mode === "next"
        ? ["public/robots.txt", "app/robots.ts", "app/robots.js"]
        : ["robots.txt", "public/robots.txt"];

    if (ctx.hasAnyPath(candidates)) return [];

    return [
      {
        id: "robots-txt:missing",
        ruleId: this.id,
        category: this.category,
        title: "No robots.txt",
        severity: "high",
        whyItMatters:
          "robots.txt tells crawlers (and AI agents) which paths to fetch. Without it, every crawler defaults to its own assumptions, which often means private/admin paths get indexed and your real content is starved of crawl budget.",
        evidence: `Searched for: ${candidates.join(", ")}`,
      },
    ];
  },
};
