"use client";

import { useState } from "react";

interface FixPRPanelProps {
  owner: string;
  repo: string;
  selectedIds: string[];
  onClear: () => void;
}

interface ApiResult {
  ok: boolean;
  result?:
    | { reused: false; prUrl: string; branch: string; number: number }
    | { reused: true; existing: { number: number; htmlUrl: string; createdAt: string } };
  appliedRuleIds?: string[];
  skippedRuleIds?: string[];
  aiUsed?: boolean;
  error?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; data: ApiResult };

export function FixPRPanel({ owner, repo, selectedIds, onClear }: FixPRPanelProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  if (selectedIds.length === 0 && state.kind === "idle") return null;

  async function handleSubmit() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueIds: selectedIds }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.ok) {
        setState({ kind: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "success", data });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
      <div className="pointer-events-auto dock flex w-full max-w-2xl items-center justify-between gap-4 rounded-2xl px-5 py-4">
        {state.kind === "success" ? (
          <SuccessRow data={state.data} onDismiss={() => { setState({ kind: "idle" }); onClear(); }} />
        ) : (
          <>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
                Selected
              </span>
              <span className="font-mono text-sm text-foreground">
                {selectedIds.length} fix{selectedIds.length === 1 ? "" : "es"} ready
              </span>
              {state.kind === "error" && (
                <span className="mt-1 font-mono text-xs text-danger">{state.message}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClear}
                disabled={state.kind === "loading"}
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={state.kind === "loading"}
                className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm"
              >
                {state.kind === "loading" ? "Opening PR…" : "Open fix PR →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessRow({ data, onDismiss }: { data: ApiResult; onDismiss: () => void }) {
  if (!data.result) return null;
  const reused = data.result.reused;
  const url = reused ? data.result.existing.htmlUrl : data.result.prUrl;
  const number = reused ? data.result.existing.number : data.result.number;

  return (
    <>
      <div className="flex flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-success">
          {reused ? "Existing PR found" : "PR opened"}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-foreground underline decoration-dotted underline-offset-4 hover:text-accent-cyan"
        >
          #{number} ↗
        </a>
        {!reused && data.aiUsed === false && (
          <span className="mt-1 font-mono text-[10px] text-foreground-muted">
            Static templates used (no AI key)
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Dismiss
      </button>
    </>
  );
}
