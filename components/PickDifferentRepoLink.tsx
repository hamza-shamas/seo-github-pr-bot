"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * On the scan page, this is the single-click escape hatch back to the
 * repo picker. It calls DELETE /api/repo to clear the connected repo
 * from the session, then navigates home — so the user lands directly on
 * the pick-a-repo form, not on a "you're still connected to X" screen
 * where they'd have to click again.
 */
export function PickDifferentRepoLink() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    await fetch("/api/repo", { method: "DELETE" });
    startTransition(() => router.push("/"));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground disabled:opacity-50"
    >
      {isPending ? "…" : "← Pick a different repo"}
    </button>
  );
}
