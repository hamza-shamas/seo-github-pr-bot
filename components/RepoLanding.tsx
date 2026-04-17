import type { ConnectedRepo, SessionUser } from "@/lib/types";
import { RepoForm } from "./RepoForm";
import { RepoDisconnectButton } from "./RepoDisconnectButton";

interface RepoLandingProps {
  user: SessionUser;
  repo?: ConnectedRepo;
}

export function RepoLanding({ user, repo }: RepoLandingProps) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-16">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 -z-10 opacity-60"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground-muted">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
          Connected as @{user.githubLogin} via {user.source}
        </span>

        {repo ? (
          <ConnectedRepoView repo={repo} />
        ) : (
          <PickRepoView />
        )}
      </div>
    </main>
  );
}

function PickRepoView() {
  return (
    <>
      <h1 className="text-gradient max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
        Pick a repo to connect.
      </h1>

      <p className="max-w-lg text-balance text-base leading-relaxed text-foreground-muted">
        We&apos;ll verify your token has access to the repo, then unlock the SEO + GEO
        scanner. The scan flow ships in PR 2 — for now we confirm the connection.
      </p>

      <RepoForm />
    </>
  );
}

function ConnectedRepoView({ repo }: { repo: ConnectedRepo }) {
  return (
    <>
      <h1 className="text-gradient max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
        Repo connected.
      </h1>

      <article className="glass mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl p-6 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
              Repository
            </span>
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-base text-foreground hover:text-accent-cyan"
            >
              {repo.fullName}
            </a>
          </div>
          <span
            className={
              "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] " +
              (repo.isPrivate
                ? "border-accent-violet/40 text-accent-violet"
                : "border-accent-cyan/40 text-accent-cyan")
            }
          >
            {repo.isPrivate ? "Private" : "Public"}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-left">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
              Default branch
            </dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{repo.defaultBranch}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
              Owner
            </dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{repo.owner}</dd>
          </div>
        </dl>
      </article>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          disabled
          className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm"
          title="Scan flow ships in PR 2"
        >
          Run SEO + GEO scan →
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
          Scanner ships in PR 2
        </span>
        <RepoDisconnectButton />
      </div>
    </>
  );
}
