import { isOAuthConfigured } from "@/lib/oauth";
import { PatForm } from "./PatForm";

interface ConnectScreenProps {
  oauthError?: string;
}

const ERROR_COPY: Record<string, string> = {
  state_mismatch: "OAuth state mismatch. Please try again.",
  missing_code_or_state: "OAuth response was incomplete. Please try again.",
  access_denied: "GitHub access was denied. Try again or use a token.",
};

function describeOauthError(raw: string | undefined): string | null {
  if (!raw) return null;
  return ERROR_COPY[raw] ?? `OAuth error: ${decodeURIComponent(raw)}`;
}

export function ConnectScreen({ oauthError }: ConnectScreenProps) {
  const oauthEnabled = isOAuthConfigured();
  const errorMessage = describeOauthError(oauthError);

  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-16">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 -z-10 opacity-60"
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground-muted">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-cyan" />
            v0.1 — SEO + GEO scanner
          </span>
          <h1 className="text-gradient max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
            Scan your repo. Ship AI-ready PRs.
          </h1>
          <p className="max-w-xl text-balance text-base leading-relaxed text-foreground-muted">
            Connect a GitHub repo. We surface the SEO + Generative-Engine-Optimization
            gaps and open a single pull request that fixes them — content drafted by
            Claude, ready to merge.
          </p>
        </div>

        {errorMessage && (
          <div className="w-full max-w-2xl rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2">
          <article className="glass relative flex flex-col gap-6 rounded-2xl p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-cyan">
                  Option A
                </p>
                <h2 className="mt-2 text-xl font-medium tracking-tight text-foreground">
                  Sign in with GitHub
                </h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
                OAuth
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground-muted">
              The fastest way to connect. You&apos;ll authorize the app once and we&apos;ll
              get scoped access to read your repos and open pull requests on your
              behalf.
            </p>
            <ul className="space-y-2 text-xs text-foreground-muted">
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-accent-cyan" />
                Works with private and public repos
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-accent-cyan" />
                No token to copy or store locally
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-accent-cyan" />
                Revoke any time from GitHub settings
              </li>
            </ul>
            <div className="mt-auto">
              {oauthEnabled ? (
                <a
                  href="/api/auth/github/login"
                  className="btn-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.19 1.78 1.19 1.03 1.77 2.71 1.26 3.37.97.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.4.98.01 1.97.14 2.89.4 2.21-1.5 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
                  </svg>
                  Continue with GitHub
                </a>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4 text-xs leading-relaxed text-foreground-muted">
                  <p className="font-mono uppercase tracking-[0.18em] text-foreground">
                    Setup needed
                  </p>
                  <p>
                    OAuth requires a one-time GitHub OAuth App registration. Use the
                    PAT panel for now, or:
                  </p>
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>
                      <a
                        href="https://github.com/settings/applications/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground underline decoration-dotted underline-offset-4 hover:text-accent-cyan"
                      >
                        Register a new OAuth App
                      </a>{" "}
                      — set the callback to{" "}
                      <span className="font-mono text-foreground">
                        {`{your-url}/api/auth/github/callback`}
                      </span>
                    </li>
                    <li>
                      Add{" "}
                      <span className="font-mono text-foreground">GITHUB_CLIENT_ID</span>,{" "}
                      <span className="font-mono text-foreground">GITHUB_CLIENT_SECRET</span>,{" "}
                      <span className="font-mono text-foreground">GITHUB_REDIRECT_URI</span>{" "}
                      to <span className="font-mono">.env.local</span> and restart.
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </article>

          <article className="glass relative flex flex-col gap-6 rounded-2xl p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-violet">
                  Option B
                </p>
                <h2 className="mt-2 text-xl font-medium tracking-tight text-foreground">
                  Use a personal access token
                </h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
                PAT
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground-muted">
              Prefer not to authorize an OAuth app, or running this against a CI repo?
              Paste a fine-grained PAT scoped to <span className="font-mono">repo</span>.
            </p>
            <PatForm />
          </article>
        </div>

        <p className="max-w-xl text-balance text-center text-xs leading-relaxed text-foreground-muted">
          Tokens are stored only in an encrypted, http-only session cookie on this
          domain. Nothing is persisted server-side; disconnect any time and the
          cookie is gone.
        </p>
      </div>
    </main>
  );
}
