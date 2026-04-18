"use client";

import type { Issue, RepoMode } from "@/lib/types";

const SEVERITY_STYLES: Record<Issue["severity"], string> = {
  high: "border-danger/40 text-danger",
  medium: "border-accent-violet/40 text-accent-violet",
  low: "border-accent-cyan/40 text-accent-cyan",
};

const CATEGORY_STYLES: Record<Issue["category"], string> = {
  seo: "border-accent-cyan/40 text-accent-cyan",
  geo: "border-accent-violet/40 text-accent-violet",
};

interface IssueCardProps {
  issue: Issue;
  mode: RepoMode;
  selected: boolean;
  /** True when the checkbox should be disabled — either the agent can't
   * fix this issue OR a PR has already been raised covering it. */
  disabled: boolean;
  onToggle: () => void;
  /** If set, the card shows a "View PR #N ↗" button instead of the
   * selection checkbox — means the agent has already raised a PR that
   * includes this issue. */
  prLink?: { url: string; number: number };
}

export function IssueCard({
  issue,
  mode: _mode,
  selected,
  disabled,
  onToggle,
  prLink,
}: IssueCardProps) {
  return (
    <article
      className={
        "glass flex flex-col gap-4 rounded-2xl p-6 transition " +
        (selected ? "ring-1 ring-accent-cyan/60 " : "") +
        (prLink ? "opacity-90" : "")
      }
    >
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
        {prLink ? (
          <a
            href={prLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm"
          >
            View PR #{prLink.number} ↗
          </a>
        ) : (
          <label
            className={
              "flex items-center gap-3 text-sm " +
              (disabled ? "opacity-60" : "cursor-pointer")
            }
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              disabled={disabled}
              className="h-4 w-4 cursor-pointer accent-accent-cyan"
            />
            <span className="text-foreground">Fix this issue</span>
          </label>
        )}
      </div>
    </article>
  );
}
