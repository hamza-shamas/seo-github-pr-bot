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
  onClear: () => void;
}

export function AgentStreamPanel({
  owner,
  repo,
  selectedIds,
  needsSiteUrl,
  onClear,
}: AgentStreamPanelProps) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
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
  }

  // While status === "running" we render a fullscreen z-40 backdrop that
  // captures all pointer events. The dock sits at z-50 so its Cancel
  // button still works; everything behind (issue cards, header links)
  // is dimmed and click-blocked until the agent finishes.
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
              {status === "running" && "Agent running"}
              {status === "done" && "Agent done"}
              {status === "error" && "Agent failed"}
            </span>
            <span className="font-mono text-sm text-foreground">
              {selectedIds.length} fix{selectedIds.length === 1 ? "" : "es"} ready
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
                <button
                  type="button"
                  onClick={start}
                  className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm"
                >
                  Run AI agent →
                </button>
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
            {(status === "done" || status === "error") && (
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setEvents([]);
                  setError(null);
                  onClear();
                }}
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
        <Line color="success">
          ✓ PR opened · branch {event.branch} ·{" "}
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
