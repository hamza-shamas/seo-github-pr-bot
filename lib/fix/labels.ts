import type { RepoMode } from "../types";

/** Pure, client-safe — duplicates the auto-fix logic from transforms.ts so
 * the client bundle doesn't need to pull in AI / GitHub helpers. Keep these
 * in sync with `isAutoFixable` / `autoFixDescription` in transforms.ts. */
export function isAutoFixable(ruleId: string, mode: RepoMode): boolean {
  if (ruleId === "robots-txt" || ruleId === "sitemap-xml") return true;
  if (ruleId === "head-title" || ruleId === "head-description") return mode === "html";
  return false;
}

export function autoFixLabel(ruleId: string, mode: RepoMode): string {
  if (ruleId === "robots-txt") {
    return mode === "next" || mode === "html"
      ? "Create public/robots.txt"
      : "Create robots.txt";
  }
  if (ruleId === "sitemap-xml") {
    return mode === "next" || mode === "html"
      ? "Create public/sitemap.xml"
      : "Create sitemap.xml";
  }
  if (ruleId === "head-title") return "Inject <title> into <head>";
  if (ruleId === "head-description") return "Inject meta description";
  return "Apply auto-fix";
}

/** When auto-fix isn't available for the current stack, surface a copy-paste
 * snippet so the user can fix it manually in their layout / template. */
export function manualHintFor(ruleId: string, mode: RepoMode): string | null {
  if (mode === "html") return null; // we auto-fix HTML mode

  if (ruleId === "head-title") {
    return [
      "Add a <title> to your top-level layout. Common locations:",
      "  Next.js   app/layout.tsx        →  export const metadata = { title: '…' }",
      "  Rails     app/views/layouts/application.html.erb",
      "  Django    templates/base.html",
      "  Phoenix   lib/<app>_web/components/layouts/root.html.heex",
      "  Laravel   resources/views/layouts/app.blade.php",
      "",
      "  <title>Your project — short tagline</title>",
    ].join("\n");
  }

  if (ruleId === "head-description") {
    return [
      "Add a meta description to your top-level layout. Common locations:",
      "  Next.js   app/layout.tsx        →  metadata.description = '…'",
      "  Rails     app/views/layouts/application.html.erb",
      "  Django    templates/base.html",
      "  Phoenix   lib/<app>_web/components/layouts/root.html.heex",
      "  Laravel   resources/views/layouts/app.blade.php",
      "",
      '  <meta name="description" content="One concrete sentence about what your project is and who it\'s for.">',
    ].join("\n");
  }

  return null;
}
