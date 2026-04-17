"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DisconnectButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    await fetch("/api/session", { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="font-mono text-xs uppercase tracking-[0.18em] text-foreground-muted transition hover:text-foreground disabled:opacity-50"
    >
      {isPending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
