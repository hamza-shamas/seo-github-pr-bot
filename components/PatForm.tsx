"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PatForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError("Paste a token to continue");
      return;
    }
    const res = await fetch("/api/session/pat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Connection failed (HTTP ${res.status})`);
      return;
    }
    setToken("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3">
      <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
        Personal access token
      </label>
      <div className="input-shell rounded-xl px-4 py-3">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_… or github_pat_…"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent font-mono text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
          disabled={isPending}
        />
      </div>
      <p className="text-xs leading-5 text-foreground-muted">
        Need a token?{" "}
        <a
          href="https://github.com/settings/tokens/new?scopes=repo&description=SEO%20PR%20Bot"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline decoration-dotted underline-offset-4 hover:text-accent-cyan"
        >
          Generate one with <span className="font-mono">repo</span> scope →
        </a>
      </p>
      {error && (
        <p className="font-mono text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="btn-primary mt-auto inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm"
      >
        {isPending ? "Verifying…" : "Connect with token"}
      </button>
    </form>
  );
}
