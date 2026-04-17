/**
 * Validation guardrails for agent-proposed file changes.
 *
 * These run inside `propose_file_change` so a rejection is fed back to
 * the agent as a tool error — Claude can read the reason and retry with
 * a fix in the next iteration. That's the ReAct loop in action: the
 * agent observes the failure and adapts.
 */

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/** Validate any proposal — generic checks that always run. */
export function validateProposalShape(content: string): GuardResult {
  if (!content || content.trim().length === 0) {
    return { ok: false, reason: "Proposed content is empty" };
  }
  // Defensive: catch obvious "I'm a chat reply, not a file" outputs.
  const stripped = content.trim();
  if (stripped.startsWith("Here is") || stripped.startsWith("Sure,") || stripped.startsWith("```")) {
    return {
      ok: false,
      reason:
        "Content looks like a chat reply (starts with prose or a code fence). Output the raw file body only — no prose, no markdown fence.",
    };
  }
  return { ok: true };
}

/**
 * For UPDATE proposals: ensure the agent didn't truncate or rewrite the
 * file from scratch. We require the modified file to retain ~90% of the
 * original size and any key markers (DOCTYPE, ERB tags, etc.).
 */
export function validateUpdatePreservesOriginal(
  original: string,
  modified: string
): GuardResult {
  // Insertions should never shrink the file by much. 90% is generous —
  // even a heavy refactor would lose more than 10% of bytes.
  if (modified.length < Math.floor(original.length * 0.9)) {
    return {
      ok: false,
      reason: `Modified file is too small (${modified.length} bytes vs original ${original.length}). Did you truncate it? Read the file again and output the COMPLETE file with only the missing tag added.`,
    };
  }

  // Any of these markers present in the original must survive in the
  // modified version. If they don't, the agent rewrote the file.
  const STRUCTURAL_MARKERS = [
    "<!DOCTYPE",
    "<html",
    "<head",
    "<body",
    "<%=",
    "<%",
    "{% block",
    "{{ ",
    "@yield",
    "@extends",
    "@section",
  ];
  for (const marker of STRUCTURAL_MARKERS) {
    if (original.includes(marker) && !modified.includes(marker)) {
      return {
        ok: false,
        reason: `Original file contained "${marker}" but your modified version doesn't. Don't rewrite — only insert the missing tag and return the original file otherwise unchanged.`,
      };
    }
  }
  return { ok: true };
}

/** Path-shape-specific guards. */
export function validateContentForPath(path: string, content: string): GuardResult {
  const lower = path.toLowerCase();

  if (lower.endsWith("sitemap.xml")) {
    if (!/<urlset[\s>]/i.test(content)) {
      return { ok: false, reason: "sitemap.xml is missing the <urlset> root element" };
    }
    if (!/<loc>/i.test(content)) {
      return { ok: false, reason: "sitemap.xml has no <url><loc> entries" };
    }
    if (!/<\?xml/i.test(content)) {
      return { ok: false, reason: "sitemap.xml is missing the <?xml ... ?> declaration" };
    }
    return { ok: true };
  }

  if (lower.endsWith("robots.txt")) {
    if (!/user-agent\s*:/i.test(content)) {
      return { ok: false, reason: "robots.txt is missing a 'User-agent:' directive" };
    }
    if (!/(allow|disallow|sitemap)\s*:/i.test(content)) {
      return { ok: false, reason: "robots.txt has no Allow / Disallow / Sitemap directives" };
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Issue-aware guard: when the agent claims to fix a specific issue,
 * the modified file must actually contain the expected markup.
 */
export function validateContentSatisfiesIssue(
  ruleId: string,
  content: string
): GuardResult {
  if (ruleId === "head-description") {
    if (!/<meta\s+[^>]*name\s*=\s*["']description["']/i.test(content)) {
      return {
        ok: false,
        reason:
          'head-description fix must contain a <meta name="description" content="..."> tag in the file',
      };
    }
  }
  if (ruleId === "head-title") {
    if (!/<title[\s>]/i.test(content)) {
      return { ok: false, reason: "head-title fix must contain a <title> tag in the file" };
    }
  }
  return { ok: true };
}
