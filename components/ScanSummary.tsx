import Link from "next/link";
import type { ScanResult, Severity } from "@/lib/types";

const MODE_LABEL: Record<ScanResult["repo"]["mode"], string> = {
  next: "Next.js",
  html: "Static HTML",
  unknown: "Server-rendered or unrecognized stack — only file-presence rules apply",
};

export function ScanSummary({ scan }: { scan: ScanResult }) {
  const totals = countBySeverity(scan.issues);

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
            Scan complete
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {scan.repo.fullName}
          </h2>
          <p className="font-mono text-xs text-foreground-muted">
            Detected stack: <span className="text-foreground">{MODE_LABEL[scan.repo.mode]}</span>{" "}
            · scanned in {scan.durationMs}ms
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SeverityPill label="High" count={totals.high} tone="text-danger border-danger/40" />
          <SeverityPill
            label="Medium"
            count={totals.medium}
            tone="text-accent-violet border-accent-violet/40"
          />
          <SeverityPill
            label="Low"
            count={totals.low}
            tone="text-accent-cyan border-accent-cyan/40"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-foreground-muted">
          {scan.issues.length === 0
            ? "No issues detected against the v1 ruleset."
            : `${scan.issues.length} issue${scan.issues.length === 1 ? "" : "s"} found across SEO + GEO rules. Select the ones you want fixed, then click Run AI agent — it will inspect the repo, draft each change, and open a single PR for review.`}
        </p>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
        >
          ← Pick a different repo
        </Link>
      </div>
    </section>
  );
}

function SeverityPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] " +
        tone
      }
    >
      <span className="text-foreground">{count}</span>
      <span>{label}</span>
    </span>
  );
}

function countBySeverity(issues: ScanResult["issues"]): Record<Severity, number> {
  const totals: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of issues) totals[issue.severity]++;
  return totals;
}
