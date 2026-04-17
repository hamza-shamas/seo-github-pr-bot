export default function ScanLoading() {
  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-16">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 -z-10 opacity-50"
      />
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground-muted">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-cyan" />
          Scanning
        </span>
        <h1 className="text-gradient max-w-md text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
          Reading the repo and running rules…
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-foreground-muted">
          We&apos;re pulling the default branch&apos;s tree and checking it
          against the SEO + GEO rules. This usually finishes in a few
          seconds. Larger repos take a bit longer.
        </p>
      </div>
    </main>
  );
}
