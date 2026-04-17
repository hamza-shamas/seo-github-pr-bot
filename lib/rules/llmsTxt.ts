import type { Rule } from "../types";

export const llmsTxtRule: Rule = {
  id: "llms-txt",
  category: "geo",
  applies: () => true,
  async detect(ctx) {
    const candidates = ["llms.txt", "public/llms.txt"];
    if (ctx.hasAnyPath(candidates)) return [];

    return [
      {
        id: "llms-txt:missing",
        ruleId: this.id,
        category: this.category,
        title: "No llms.txt",
        severity: "medium",
        whyItMatters:
          "llms.txt is the emerging convention (popularized by Anthropic) for telling AI assistants what your site is and which pages they should prioritize. Sites with a well-formed llms.txt show up more reliably and with better summaries in tools like ChatGPT, Perplexity, and Claude.",
        evidence: `Searched for: ${candidates.join(", ")}`,
      },
    ];
  },
};
