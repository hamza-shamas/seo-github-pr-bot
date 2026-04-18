"use client";

import { useMemo, useState } from "react";
import type { ScanResult } from "@/lib/types";
import { IssueCard } from "./IssueCard";
import { AgentStreamPanel } from "./AgentStreamPanel";

interface ScanResultsClientProps {
  scan: ScanResult;
  /** False when the connected token has no write access to this repo —
   * agent can scan but PR creation is blocked. */
  canPush: boolean;
}

interface RaisedPr {
  url: string;
  number: number;
  /** The issues the user selected when raising this PR. */
  issueIds: Set<string>;
}

const URL_DEPENDENT_RULES = new Set(["sitemap-xml", "robots-txt"]);

export function ScanResultsClient({ scan, canPush }: ScanResultsClientProps) {
  // With the AI agent, every detected issue is fixable in principle —
  // the agent will figure out which files to touch (or skip the issue if
  // it genuinely can't be fixed). The UI lets the user select any of them.
  const fixableIds = useMemo(
    () => new Set(scan.issues.map((i) => i.id)),
    [scan]
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [raisedPr, setRaisedPr] = useState<RaisedPr | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(fixableIds));
  }

  function clear() {
    setSelected(new Set());
  }

  function handlePrOpened(pr: { url: string; number: number }) {
    setRaisedPr({ url: pr.url, number: pr.number, issueIds: new Set(selected) });
  }

  const hasFixable = fixableIds.size > 0;
  const allSelected = hasFixable && selected.size === fixableIds.size;

  const needsSiteUrl = useMemo(() => {
    for (const issue of scan.issues) {
      if (selected.has(issue.id) && URL_DEPENDENT_RULES.has(issue.ruleId)) return true;
    }
    return false;
  }, [scan.issues, selected]);

  // Only show the selection bar + dock if there are issues that AREN'T
  // already covered by the most recent raised PR.
  const remainingFixableCount = raisedPr
    ? [...fixableIds].filter((id) => !raisedPr.issueIds.has(id)).length
    : fixableIds.size;

  return (
    <>
      {hasFixable && remainingFixableCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
            {remainingFixableCount} auto-fixable · {selected.size} selected
          </span>
          <button
            type="button"
            onClick={allSelected ? clear : selectAll}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground underline decoration-dotted underline-offset-4 hover:text-accent-cyan"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-4 pb-32">
        {scan.issues.map((issue) => {
          const prLink =
            raisedPr && raisedPr.issueIds.has(issue.id)
              ? { url: raisedPr.url, number: raisedPr.number }
              : undefined;
          return (
            <li key={issue.id}>
              <IssueCard
                issue={issue}
                mode={scan.repo.mode}
                selected={selected.has(issue.id)}
                disabled={!fixableIds.has(issue.id) || prLink !== undefined}
                onToggle={() => toggle(issue.id)}
                prLink={prLink}
              />
            </li>
          );
        })}
      </ul>

      <AgentStreamPanel
        owner={scan.repo.owner}
        repo={scan.repo.name}
        selectedIds={[...selected]}
        needsSiteUrl={needsSiteUrl}
        canPush={canPush}
        onClear={clear}
        onPrOpened={handlePrOpened}
      />
    </>
  );
}
