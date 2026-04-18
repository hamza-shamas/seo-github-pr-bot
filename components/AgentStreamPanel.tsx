"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/types";

type Status = "idle" | "running" | "done" | "error";

interface AgentStreamPanelProps {
  owner: string;
  repo: string;
  selectedIds: string[];
  /** Whether the selected issues need a real production URL — true when
   * sitemap.xml or robots.txt is among them. Drives whether the
   * "Site URL" input appears in the dock. */
  needsSiteUrl: boolean;
  /** False when the connected token has no write access to this repo. */
  canPush: boolean;
  onClear: () => void;
  /** Called when the agent successfully opens a PR. Lets the parent
   * mark the fixed issues so their cards flip to "View PR". */
  onPrOpened?: (pr: { url: string; number: number }) => void;
}

export function AgentStreamPanel({
  owner,
  repo,
  selectedIds,
  needsSiteUrl,
  canPush,
  onClear,
  onPrOpened,
}: AgentStreamPanelProps) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [openedPr, setOpenedPr] = useState<{ url: string; number: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  if (selectedIds.length === 0 && status === "idle") return null;

  async function start() {
    setStatus("running");
    setError(null);
    setEvents([]);
    setOpenedPr(null);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/fix/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          issueIds: selectedIds,
          siteUrl: siteUrl.trim() || undefined,
        }),
        signal: ac.signal,
      });

      if (!res.body) throw new Error("Streaming not supported");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          const evt = parseSseBlock(block);
          if (!evt) continue;
          setEvents((prev) => [...prev, evt]);

          if (evt.type === "error") {
            setError(evt.message);
            setStatus("error");
          }
          if (evt.type === "pr_opened") {
            const pr = { url: evt.url, number: evt.number };
            setOpenedPr(pr);
            onPrOpened?.(pr);
          }
          if (evt.type === "end") {
            setStatus((s) => (s === "error" ? "error" : "done"));
          }
        }
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "stream failed");
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStatus("idle");
    setEvents([]);
    setError(null);
    setOpenedPr(null);
  }

  function dismiss() {
    setStatus("idle");
    setEvents([]);
    setError(null);
    setOpenedPr(null);
    onClear();
  }

  const tooltipText = canPush
    ? `This will fix ${selectedIds.length} issue${selectedIds.length === 1 ? "" : "s"} and raise a pull request.`
    : "Read-only repo — connect a repo you own (or are a collaborator on) to raise a PR.";

  return (
    <>
      {status === "running" && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-background/55 backdrop-blur-sm transition-opacity"
        />
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
        <div className="pointer-events-auto dock flex w-full max-w-3xl flex-col gap-4 rounded-2xl px-5 py-4">
          {status === "idle" && needsSiteUrl && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
                Site URL · used for sitemap.xml / robots.txt
              </span>
              <input
                type="text"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://your-site.com  (optional — falls back to example.com if blank)"
                autoComplete="off"
                spellCheck={false}
                className="input-shell rounded-xl px-3 py-2 font-mono text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
              />
            </label>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
                {status === "idle" && "Selected"}
                {status === "running" && "Working"}
                {status === "done" && "Done"}
                {status === "error" && "Failed"}
              </span>
              <span className="font-mono text-sm text-foreground">
                {status === "idle" &&
                  `${selectedIds.length} issue${selectedIds.length === 1 ? "" : "s"}`}
                {status === "running" && "Fixing the issues…"}
                {status === "done" && (openedPr ? `PR #${openedPr.number} ready` : "Fixed")}
                {status === "error" && "Please try again"}
              </span>
              {error && <span className="mt-1 font-mono text-xs text-danger">{error}</span>}
            </div>

            <div className="flex items-center gap-3">
              {status === "idle" && (
                <>
                  <button
                    type="button"
                    onClick={onClear}
                    className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
                  >
                    Clear
                  </button>
                  <span className="group relative inline-flex">
                    <button
                      type="button"
                      onClick={start}
                      disabled={!canPush}
                      aria-label={tooltipText}
                      className="btn-primary inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm"
                    >
                      {canPush ? "Raise PR" : "Read-only — can't raise PR"}
                      {canPush && (
                        <span
                          aria-hidden
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/50 font-mono text-[9px] font-bold"
                        >
                          i
                        </span>
                      )}
                    </button>
                    {canPush && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full right-0 mb-2 hidden w-64 rounded-xl border border-border-strong bg-background-soft/95 px-3 py-2 text-left font-mono text-[11px] leading-snug text-foreground shadow-xl group-hover:block group-focus-within:block"
                      >
                        {tooltipText}
                      </span>
                    )}
                  </span>
                </>
              )}

              {status === "running" && (
                <button
                  type="button"
                  onClick={cancel}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
                >
                  Cancel
                </button>
              )}

              {status === "done" && openedPr && (
                <>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
                  >
                    Dismiss
                  </button>
                  <a
                    href={openedPr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm"
                  >
                    View PR #{openedPr.number} ↗
                  </a>
                </>
              )}

              {status === "done" && !openedPr && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
                >
                  Dismiss
                </button>
              )}

              {status === "error" && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>

          {events.length > 0 && (
            <div
              ref={logRef}
              className="max-h-72 overflow-y-auto rounded-xl border border-border bg-background-soft/80 p-4 font-mono text-[11px] leading-relaxed"
            >
              {events.map((e, i) => (
                <EventRow key={i} event={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case "start":
      return <Line color="cyan">▸ start · {event.repo} · {event.issueIds.length} issue(s)</Line>;
    case "iteration":
      return <Line color="muted">— iteration #{event.n}</Line>;
    case "thought":
      return (
        <Line color="muted">
          <span className="text-foreground-muted">thought · </span>
          <span className="text-foreground">{event.text}</span>
        </Line>
      );
    case "tool_call":
      return (
        <Line color="violet">
          ↳ <span className="text-accent-violet">{event.name}</span>
          <span className="text-foreground-muted">({event.argsPreview})</span>
        </Line>
      );
    case "tool_result":
      return (
        <Line color={event.ok ? "muted" : "danger"}>
          {event.ok ? "←" : "✗"} {event.name} · {event.summary}
        </Line>
      );
    case "proposal":
      return (
        <Line color="cyan">
          ✦ proposal · <span className="text-accent-cyan">{event.kind}</span> {event.path}{" "}
          <span className="text-foreground-muted">({event.bytes} bytes)</span>
        </Line>
      );
    case "agent_done":
      return (
        <Line color="success">
          ✓ agent done · {event.iterations} iteration(s) · {event.proposalCount} proposal(s)
        </Line>
      );
    case "pr_opened":
      return (
        <div className="my-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm font-semibold text-success">
          ✓ PR opened · branch {event.branch} ·{" "}
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-4 hover:text-accent-cyan"
          >
            #{event.number} ↗
          </a>
        </div>
      );
    case "pr_existing":
      return (
        <Line color="violet">
          ⚠ PR already exists from {event.createdAt.slice(0, 10)} ·{" "}
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-4 hover:text-accent-cyan"
          >
            #{event.number} ↗
          </a>
        </Line>
      );
    case "error":
      return <Line color="danger">✗ error · {event.message}</Line>;
    case "end":
      return null;
    default:
      return null;
  }
}

function Line({ children, color }: { children: React.ReactNode; color: string }) {
  const cls =
    color === "cyan"
      ? "text-accent-cyan"
      : color === "violet"
      ? "text-accent-violet"
      : color === "success"
      ? "text-success"
      : color === "danger"
      ? "text-danger"
      : "text-foreground";
  return <div className={cls}>{children}</div>;
}

function parseSseBlock(block: string): AgentEvent | null {
  let dataLine: string | null = null;
  for (const line of block.split("\n")) {
    if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine) as AgentEvent;
  } catch {
    return null;
  }
}
