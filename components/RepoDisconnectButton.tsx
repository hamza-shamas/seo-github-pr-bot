"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RepoDisconnectButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    await fetch("/api/repo", { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 transition hover:text-foreground disabled:opacity-50"
    >
      {isPending ? "Disconnecting…" : "Pick a different repo"}
    </button>
  );
}
