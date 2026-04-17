import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { DisconnectButton } from "./DisconnectButton";

export async function Header() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/40 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))",
              boxShadow: "0 0 18px rgba(34, 211, 238, 0.45)",
            }}
          >
            <span className="font-mono text-[13px] font-bold text-[#07070b]">
              G
            </span>
          </span>
          <span className="font-mono text-sm uppercase tracking-[0.22em] text-foreground">
            geo.forge
          </span>
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user.avatarUrl && (
                <Image
                  src={user.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-full ring-1 ring-border-strong"
                />
              )}
              <div className="flex flex-col leading-tight">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                  Connected via {user.source}
                </span>
                <span className="font-mono text-sm text-foreground">
                  @{user.githubLogin}
                </span>
              </div>
            </div>
            <DisconnectButton />
          </div>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
            <span className="pulse-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-accent-cyan" />
            Awaiting connection
          </span>
        )}
      </div>
    </header>
  );
}
