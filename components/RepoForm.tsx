"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RepoListItem, ReposFilter } from "@/app/api/repos/route";

type LoadState = "idle" | "loading" | "ready" | "error";

const FILTER_LABELS: Record<ReposFilter, string> = {
  owner: "Mine",
  all: "All accessible",
};

export function RepoForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [filter, setFilter] = useState<ReposFilter>("owner");
  const [reposByFilter, setReposByFilter] = useState<
    Partial<Record<ReposFilter, RepoListItem[]>>
  >({});
  const [loadStateByFilter, setLoadStateByFilter] = useState<
    Partial<Record<ReposFilter, LoadState>>
  >({});
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const repos = reposByFilter[filter] ?? [];
  const loadState: LoadState = loadStateByFilter[filter] ?? "idle";

  async function loadReposFor(target: ReposFilter) {
    const current = loadStateByFilter[target];
    if (current === "loading" || current === "ready") return;
    setLoadStateByFilter((s) => ({ ...s, [target]: "loading" }));
    try {
      const res = await fetch(`/api/repos?filter=${target}`);
      const data = (await res.json()) as { repos?: RepoListItem[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReposByFilter((s) => ({ ...s, [target]: data.repos ?? [] }));
      setLoadStateByFilter((s) => ({ ...s, [target]: "ready" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your repos");
      setLoadStateByFilter((s) => ({ ...s, [target]: "error" }));
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return repos.slice(0, 12);
    return repos.filter((r) => r.fullName.toLowerCase().includes(query)).slice(0, 12);
  }, [repos, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, filter]);

  function changeFilter(next: ReposFilter) {
    setFilter(next);
    if (!loadStateByFilter[next]) void loadReposFor(next);
    inputRef.current?.focus();
  }

  async function submitRepo(repoString: string) {
    const trimmed = repoString.trim();
    if (!trimmed) {
      setError("Pick or type a repo as owner/repo");
      return;
    }
    setError(null);
    setIsOpen(false);
    const res = await fetch("/api/repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: trimmed }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Could not connect repo (HTTP ${res.status})`);
      return;
    }
    setValue("");
    startTransition(() => router.refresh());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      void loadReposFor(filter);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && filtered.length > 0) {
        void submitRepo(filtered[activeIndex].fullName);
      } else {
        void submitRepo(value);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="flex w-full flex-col gap-3">
      <div className="glass relative flex w-full items-stretch gap-2 rounded-2xl p-2">
        <div className="input-shell flex flex-1 items-center gap-3 rounded-xl px-4 py-3">
          <SearchIcon />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setIsOpen(true);
              if (!loadStateByFilter[filter]) void loadReposFor(filter);
            }}
            onFocus={() => {
              setIsOpen(true);
              if (!loadStateByFilter[filter]) void loadReposFor(filter);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search your repos, or paste owner/repo"
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
            aria-autocomplete="list"
            aria-expanded={isOpen}
            className="w-full bg-transparent font-mono text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void submitRepo(value)}
          disabled={isPending}
          className="btn-primary inline-flex items-center justify-center rounded-xl px-5 text-sm"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>

        {isOpen && (
          <RepoDropdown
            listRef={listRef}
            loadState={loadState}
            filtered={filtered}
            activeIndex={activeIndex}
            onPick={(repo) => void submitRepo(repo.fullName)}
            onHover={setActiveIndex}
            queryWasTyped={query.length > 0}
            totalRepos={repos.length}
            filter={filter}
            onChangeFilter={changeFilter}
          />
        )}
      </div>

      {error && (
        <p className="text-center font-mono text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-foreground-muted">
        Don&apos;t see it? Paste any <span className="font-mono">owner/repo</span> or
        full GitHub URL.
      </p>
    </div>
  );
}

interface DropdownProps {
  listRef: React.RefObject<HTMLUListElement | null>;
  loadState: LoadState;
  filtered: RepoListItem[];
  activeIndex: number;
  onPick: (repo: RepoListItem) => void;
  onHover: (index: number) => void;
  queryWasTyped: boolean;
  totalRepos: number;
  filter: ReposFilter;
  onChangeFilter: (next: ReposFilter) => void;
}

function RepoDropdown({
  listRef,
  loadState,
  filtered,
  activeIndex,
  onPick,
  onHover,
  queryWasTyped,
  totalRepos,
  filter,
  onChangeFilter,
}: DropdownProps) {
  return (
    <div
      role="listbox"
      className="absolute left-2 right-2 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-border-strong bg-background-soft/95 shadow-2xl shadow-black/60 backdrop-blur-2xl"
    >
      <FilterBar filter={filter} onChange={onChangeFilter} />

      {loadState === "loading" && (
        <div className="flex items-center gap-3 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-foreground-muted">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-cyan" />
          Loading repos…
        </div>
      )}

      {loadState === "error" && (
        <div className="px-4 py-3 text-xs text-danger">
          Couldn&apos;t load repos. You can still paste owner/repo manually.
        </div>
      )}

      {loadState === "ready" && filtered.length === 0 && (
        <div className="px-4 py-3 text-xs text-foreground-muted">
          {queryWasTyped
            ? "No matches in this list. Press Enter to try the value as-is, or switch the filter."
            : totalRepos === 0
            ? filter === "owner"
              ? "No repos owned by your account. Switch to All accessible to include collaborator + org repos."
              : "Your token can't list any repos. Paste an owner/repo manually."
            : "Start typing to search."}
        </div>
      )}

      {loadState === "ready" && filtered.length > 0 && (
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.map((repo, i) => {
            const isActive = i === activeIndex;
            return (
              <li key={repo.fullName}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(repo);
                  }}
                  onMouseEnter={() => onHover(i)}
                  className={
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition " +
                    (isActive ? "bg-surface-strong" : "hover:bg-surface")
                  }
                >
                  <span className="flex-1 truncate font-mono text-sm text-foreground">
                    {repo.fullName}
                  </span>
                  <span
                    className={
                      "rounded-full border px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.18em] " +
                      (repo.isPrivate
                        ? "border-accent-violet/40 text-accent-violet"
                        : "border-accent-cyan/40 text-accent-cyan")
                    }
                  >
                    {repo.isPrivate ? "Private" : "Public"}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                    {repo.defaultBranch}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {loadState === "ready" && totalRepos > filtered.length && (
        <div className="border-t border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
          Showing {filtered.length} of {totalRepos} · keep typing to narrow
        </div>
      )}
    </div>
  );
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: ReposFilter;
  onChange: (next: ReposFilter) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-background-soft/80 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
        Show
      </span>
      <div className="flex gap-1 rounded-full border border-border bg-surface p-1">
        {(Object.keys(FILTER_LABELS) as ReposFilter[]).map((opt) => {
          const active = opt === filter;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={
                "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition " +
                (active
                  ? "bg-foreground/90 text-background"
                  : "text-foreground-muted hover:text-foreground")
              }
            >
              {FILTER_LABELS[opt]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-foreground-muted"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
