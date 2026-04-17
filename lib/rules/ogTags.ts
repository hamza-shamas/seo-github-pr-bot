import type { Rule } from "../types";
import { extractNextMetadataBlock, findNextLayout, findRootHtml, metadataHasKey } from "./_helpers";
import { parse } from "node-html-parser";

const OG_IMAGE_FILE_PREFIXES = [
  "app/opengraph-image",
  "src/app/opengraph-image",
];

export const ogTagsRule: Rule = {
  id: "og-tags",
  category: "seo",
  applies: (ctx) => ctx.mode !== "unknown",
  async detect(ctx) {
    if (ctx.mode === "next") {
      const layout = await findNextLayout(ctx);
      const block = layout ? extractNextMetadataBlock(layout.content) : null;
      const hasOpenGraph = block ? metadataHasKey(block, "openGraph") : false;
      const hasOgImageFile = [...ctx.tree.keys()].some((p) =>
        OG_IMAGE_FILE_PREFIXES.some((prefix) => p.startsWith(prefix))
      );
      if (hasOpenGraph || hasOgImageFile) return [];
      return [
        {
          id: "og-tags:next",
          ruleId: this.id,
          category: this.category,
          title: "No Open Graph metadata",
          severity: "medium",
          whyItMatters:
            "Open Graph tags (og:title, og:description, og:image) drive how your link previews look on Slack, Twitter/X, LinkedIn, iMessage, Discord, and AI tools that quote sources. Without them, your shares fall back to a blurry title strip — devastating for organic distribution.",
          evidence: layout
            ? `Checked ${layout.path} — no \`openGraph:\` in metadata; no app/opengraph-image.* file`
            : "No Next.js layout found, no app/opengraph-image.* file",
        },
      ];
    }

    if (ctx.mode === "html") {
      const html = await findRootHtml(ctx);
      if (!html) return [];
      const root = parse(html.content);
      const missing: string[] = [];
      for (const prop of ["og:title", "og:description", "og:image"]) {
        const tag = root.querySelector(`meta[property="${prop}"]`);
        const content = tag?.getAttribute("content")?.trim();
        if (!content) missing.push(prop);
      }
      if (missing.length === 0) return [];
      return [
        {
          id: "og-tags:html",
          ruleId: this.id,
          category: this.category,
          title: `Missing Open Graph: ${missing.join(", ")}`,
          severity: "medium",
          whyItMatters:
            "Open Graph tags control your link previews. Missing og:image is the most visible — Slack, LinkedIn, and Twitter all show a generic placeholder instead of your hero image.",
          evidence: `Checked: ${html.path}`,
        },
      ];
    }

    return [];
  },
};
