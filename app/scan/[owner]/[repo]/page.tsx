import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { fetchRepo } from "@/lib/github/client";
import { runScan } from "@/lib/scan/runScan";
import { IssueCard } from "@/components/IssueCard";
import { ScanSummary } from "@/components/ScanSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScanPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function ScanPage({ params }: ScanPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { owner, repo } = await params;

  let connectedRepo;
  try {
    connectedRepo = await fetchRepo(user.token, owner, repo);
  } catch (err) {
    return <ScanError owner={owner} repo={repo} message={errorMessage(err)} />;
  }

  let scan;
  try {
    scan = await runScan({
      token: user.token,
      owner: connectedRepo.owner,
      name: connectedRepo.name,
      defaultBranch: connectedRepo.defaultBranch,
    });
  } catch (err) {
    return <ScanError owner={owner} repo={repo} message={errorMessage(err)} />;
  }

  return (
    <main className="relative flex flex-1 flex-col px-6 py-12">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 -z-10 opacity-50"
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <ScanSummary scan={scan} />
        {scan.issues.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-4">
            {scan.issues.map((issue) => (
              <li key={issue.id}>
                <IssueCard issue={issue} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
      <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-success" />
      <h3 className="text-xl font-medium tracking-tight text-foreground">All clear.</h3>
      <p className="max-w-md text-sm leading-relaxed text-foreground-muted">
        Every v1 SEO + GEO rule passed against the default branch. As we add
        deeper checks (per-route metadata, structured-data validation), this
        page may surface new issues.
      </p>
    </div>
  );
}

function ScanError({
  owner,
  repo,
  message,
}: {
  owner: string;
  repo: string;
  message: string;
}) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-16">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 -z-10 opacity-50"
      />
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-danger">
          Scan failed
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Couldn&apos;t scan {owner}/{repo}
        </h1>
        <p className="text-sm text-foreground-muted">{message}</p>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
        >
          ← Back to repo picker
        </Link>
      </div>
    </main>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (/not.?found/i.test(msg)) {
      return "Repo not found, or your token doesn't have access to it.";
    }
    return msg;
  }
  return "Unknown error.";
}
