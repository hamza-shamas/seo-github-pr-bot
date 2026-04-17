import type { Issue } from "@/lib/types";

const SEVERITY_STYLES: Record<Issue["severity"], string> = {
  high: "border-danger/40 text-danger",
  medium: "border-accent-violet/40 text-accent-violet",
  low: "border-accent-cyan/40 text-accent-cyan",
};

const CATEGORY_STYLES: Record<Issue["category"], string> = {
  seo: "border-accent-cyan/40 text-accent-cyan",
  geo: "border-accent-violet/40 text-accent-violet",
};

export function IssueCard({ issue }: { issue: Issue }) {
  return (
    <article className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-medium tracking-tight text-foreground">
            {issue.title}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
            rule · {issue.ruleId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] " +
              CATEGORY_STYLES[issue.category]
            }
          >
            {issue.category}
          </span>
          <span
            className={
              "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] " +
              SEVERITY_STYLES[issue.severity]
            }
          >
            {issue.severity}
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground-muted">
        {issue.whyItMatters}
      </p>

      {issue.evidence && (
        <div className="rounded-xl border border-border bg-background-soft/60 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
            Evidence
          </p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">
            {issue.evidence}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
          Auto-fix lands in PR 2b
        </span>
        <button
          type="button"
          disabled
          className="btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs"
          title="The fix-PR generator ships in PR 2b"
        >
          Add to fix PR →
        </button>
      </div>
    </article>
  );
}
