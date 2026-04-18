# GEO Forge

**Connect a GitHub repo → scan it for SEO + GEO gaps → an AI agent drafts real code changes and opens a pull request.** In about 20 seconds.

GEO = **Generative Engine Optimization** — making your site discoverable not just to Google, but to AI search engines like ChatGPT, Perplexity, and Claude that increasingly mediate how users find things.

---

## What it does

1. You **connect** a GitHub repo via OAuth or a fine-grained PAT (your choice — both are first-class).
2. You **pick a repo** from a searchable dropdown (filters: repos you own, or all you have access to).
3. You click **Run SEO + GEO scan**. The scanner runs 4 universal rules in ~2 seconds against the default branch.
4. Each issue card explains *why it matters* and offers a checkbox to include it in the fix.
5. You click **Raise PR**. An AI agent (Claude Haiku 4.5 via the Vercel AI Gateway) takes over:
   - Explores the repo with `list_files`
   - Reads the files it needs (`README.md`, `app/views/layouts/application.html.erb`, `config/routes.rb`, `app/layout.tsx`, etc.)
   - Drafts the right content
   - Stages each change via a `propose_file_change` tool (with guardrails that validate output)
   - Calls `set_pr_metadata` to draft a specific PR title + commit message
   - Calls `finish`, and our backend opens the PR via GitHub's Git Data API (one clean commit)
6. The dock streams every agent step live via Server-Sent Events. When the PR opens, the issue cards flip to **View PR #N ↗**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser (React)                       │
│                                                               │
│  ConnectScreen  →  RepoLanding  →  ScanResultsClient          │
│                                       ↓                       │
│                                    IssueCard[]                │
│                                    AgentStreamPanel (SSE)     │
└─────────────────────────┬─────────────────────────────────────┘
                          │
                          │ fetch / POST / Server-Sent Events
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                 Next.js Route Handlers                        │
│                                                               │
│  Auth           /api/auth/github/login    /api/session/pat    │
│                 /api/auth/github/callback /api/session  (DEL) │
│                                                               │
│  Repo           /api/repo   (POST/DELETE)                     │
│                 /api/repos  (GET — list user's repos)         │
│                                                               │
│  Fix            /api/fix/stream  (SSE — agent + PR creation)  │
└────────┬────────────────────────────┬───────────────────────┘
         │                            │
         ↓                            ↓
┌──────────────────┐       ┌──────────────────────────────────┐
│  iron-session    │       │  Agent loop (lib/agent/)         │
│  encrypted       │       │                                  │
│  cookie          │       │   System + user prompt           │
│  {token,         │       │       ↓                          │
│   identity,      │       │   Claude → tool call request     │
│   repo}          │       │       ↓                          │
└──────────────────┘       │   Our executor runs tool:        │
                           │     - list_files     (tree cache)│
                           │     - read_file      (Octokit)   │
                           │     - propose_file_change        │
                           │         ↳ guardrails validate    │
                           │     - set_pr_metadata            │
                           │     - finish                     │
                           │       ↓                          │
                           │   Result → back into Claude      │
                           │   (ReAct loop, max 12 iterations)│
                           │       ↓                          │
                           │   Final proposals                │
                           └──────────┬───────────────────────┘
                                      ↓
                           ┌──────────────────────────────────┐
                           │  Octokit Git Data API             │
                           │  blobs → tree → commit → ref → PR │
                           └──────────────────────────────────┘
                                      ↓
                                  GitHub
```

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | RSC for the scan page, file-based API routes, native streaming |
| Language | **TypeScript** (strict) | Catches integration bugs across ~15 modules |
| Styling | **Tailwind v4** + custom `@layer` CSS | Futuristic dark theme with cyan/violet accents |
| Auth | **iron-session** (encrypted httpOnly cookie) | Zero-DB session state |
| GitHub | **`@octokit/rest`** | Typed SDK, handles trees / blobs / commits / PRs |
| Validation | **Zod** | Every API route parses its body |
| HTML scanning | **`node-html-parser`** | Cheap HTML parse for title/meta checks |
| AI | **Vercel AI Gateway** + `openai` SDK → `anthropic/claude-haiku-4.5` | OpenAI-compatible endpoint, one key, low latency |
| Streaming | **Server-Sent Events** over `ReadableStream` | POST-friendly (EventSource is GET-only) |

No database. No queue. No external job runner. Everything runs in the request lifecycle.

### Why no persistent storage?

Everything the user needs — their GitHub token, which repo they connected, the scan results, the raised PR — lives for one short-lived session. There's no "user history to look up," no cross-device sync, no multi-tenant data to isolate. Adding Postgres/Redis/etc. would be pure ceremony that slows deploys, adds a failure mode, and solves no user problem today.

Concretely:

- The **GitHub token + identity + connected repo** → held in an encrypted `iron-session` httpOnly cookie (~1-2 KB, AES-GCM encrypted with `SESSION_SECRET`). Survives page reloads; destroyed by Disconnect or after 7 idle days.
- The **scan results** → computed fresh on each `/scan/[owner]/[repo]` visit. Fast enough (~2 s) that caching isn't needed.
- The **agent's proposed file changes** → held in an in-memory `Map` scoped to that one `/api/fix/stream` request, then flushed to a GitHub commit. Nothing persisted.

If we later need scan history, multi-user access, or scheduled re-scans, Postgres goes in at that point — but it'd be solving a real product need, not "we should have a database because real apps do." YAGNI until proven otherwise.

---

## The AI agent pattern

This is the interesting part. Claude doesn't have filesystem or GitHub access — it can only read text we put in front of it and produce text back.

So the agent works as a **ReAct loop** over four tools:

| Tool | What it does | Who runs it |
|---|---|---|
| `list_files(contains?)` | Return paths in the repo tree (cached from one GitHub call) | Our code |
| `read_file(path)` | Fetch a file's content via Octokit's `git.getBlob` | Our code |
| `propose_file_change(path, content, kind)` | Stage a file change (in memory — not written yet) | Our code |
| `set_pr_metadata(title, commit_message)` | Let Claude draft a specific PR title + commit body | Our code |
| `finish()` | Signal the loop to end | Our code |

Each iteration: Claude outputs a structured tool-call request → we execute → we feed the result back → Claude plans the next step. When Claude stops calling tools (or hits `finish`), we batch every staged proposal into a single commit via the Git Data API and open the PR.

### Guardrails

Every `propose_file_change` call runs through validators before being accepted. If validation fails, we return an error to Claude as the tool result — **Claude reads the error and self-corrects** in the next iteration. No human-in-the-loop needed for the common failure modes:

- **Truncation** — modified file < 90% of original → "Output the COMPLETE file."
- **Lost structure** — original had `<!DOCTYPE`, `<head`, `<%` etc. and the modified version doesn't → "Don't rewrite, only insert what's missing."
- **Missing required markup** — head-description fix doesn't contain `name="description"` → "Your fix must actually contain the meta tag."
- **Path safety** — blocked paths (`node_modules/`, `.git/`, `vendor/bundle/`, etc.) → refused.
- **Sitemap / robots structure** — must have `<urlset>` / `<loc>` / `User-agent:`.

### Bounded execution

- Max **12** tool-call iterations per run.
- Max **55 seconds** wall-clock time (with AbortController).
- Each Claude call capped at **1500** output tokens, `temperature: 0.2`.

Typical run: 5–9 iterations, ~$0.02 in Claude tokens, ~15–25 seconds.

---

## What it scans (v1 rules)

Four rules, all universal (work on any stack):

| Rule | Category | Detection |
|---|---|---|
| `robots-txt` | SEO | No `robots.txt` at root or `public/` |
| `sitemap-xml` | SEO | No `sitemap.xml` (or Next.js `app/sitemap.ts`) |
| `head-title` | SEO | No `<title>` tag grep-found in templates, AND no Next.js `metadata.title` export |
| `head-description` | SEO | No `<meta name="description">` grep-found, AND no Next.js `metadata.description` export |

The grep looks across `.html`, `.erb`, `.haml`, `.heex`, `.blade.php`, `.vue`, `.svelte`, `.astro`, `.tsx`, `.jsx`, and more — up to 20 likely-layout files (names containing `layout`, `base`, `application`, `root`, `index`, `+layout`) fetched in parallel.

Server-rendered stacks (Rails / Django / Phoenix / Laravel / Go / Rust) are detected via marker files (`Gemfile`, `manage.py`, `mix.exs`, etc.) and labeled **"Server-rendered or unrecognized stack"** — only file-presence rules fire, no false positives from head-tag scans against framework error pages.

Adding a 5th rule is a one-file change: export a `Rule` from `lib/rules/index.ts` and push it into the `RULES` array.

---

## Project structure

```
seo-github-pr-bot/
├─ app/
│  ├─ layout.tsx                    # Root layout with dark theme
│  ├─ page.tsx                      # Home — routes to Connect or RepoLanding
│  ├─ icon.svg                      # Tab favicon (G logo)
│  ├─ globals.css                   # Tailwind v4 + custom @layer base/components
│  │
│  ├─ api/
│  │  ├─ auth/github/login/         # OAuth start (redirect to GitHub)
│  │  ├─ auth/github/callback/      # OAuth finish (code exchange, set session)
│  │  ├─ session/pat/               # POST: verify PAT, set session
│  │  ├─ session/                   # DELETE: clear session (Disconnect)
│  │  ├─ repo/                      # POST/DELETE: connect / disconnect repo
│  │  ├─ repos/                     # GET: list user's accessible repos
│  │  └─ fix/stream/                # POST: SSE — runs scan + agent + opens PR
│  │
│  └─ scan/[owner]/[repo]/
│     ├─ page.tsx                   # Server component, runs scan, renders results
│     └─ loading.tsx                # Streaming loading state
│
├─ components/
│  ├─ ConnectScreen.tsx             # OAuth + PAT side-by-side panels
│  ├─ Header.tsx                    # @login + Disconnect
│  ├─ RepoForm.tsx                  # Searchable repo combobox
│  ├─ RepoLanding.tsx               # Post-connect landing (pick / connected)
│  ├─ ScanSummary.tsx               # Top card on scan page
│  ├─ ScanResultsClient.tsx         # Selection state + owner of PR state
│  ├─ IssueCard.tsx                 # Per-issue card with checkbox or "View PR"
│  ├─ AgentStreamPanel.tsx          # Bottom dock — Raise PR, live log, View PR
│  ├─ PatForm.tsx                   # PAT input with scope check
│  ├─ DisconnectButton.tsx          # Session disconnect
│  └─ RepoDisconnectButton.tsx      # Per-repo disconnect
│
├─ lib/
│  ├─ types.ts                      # Shared types (Issue, Fix, RepoContext, ...)
│  ├─ session.ts                    # iron-session helpers
│  ├─ oauth.ts                      # OAuth flow + public-origin derivation
│  │
│  ├─ github/
│  │  ├─ client.ts                  # Octokit factory + authenticate + fetchRepo
│  │  ├─ repoContext.ts             # Build RepoContext with tree + lazy file cache
│  │  └─ pr.ts                      # Git Data API commit + PR creation
│  │
│  ├─ rules/
│  │  └─ index.ts                   # All 4 rules + helpers in one file
│  │
│  ├─ scan/
│  │  ├─ detect.ts                  # Stack detection (next / html / unknown)
│  │  └─ runScan.ts                 # Parallel rule execution with per-rule error reporting
│  │
│  ├─ ai/
│  │  └─ client.ts                  # OpenAI SDK pointed at Vercel AI Gateway
│  │
│  └─ agent/
│     ├─ types.ts                   # AgentEvent, AgentProposal
│     ├─ tools.ts                   # Tool schemas + executors
│     ├─ guards.ts                  # Proposal validation (ReAct self-correction)
│     ├─ runAgent.ts                # ReAct loop with Claude
│     ├─ sse.ts                     # SSE writer
│     └─ buildPrBody.ts             # Rich PR description builder
│
├─ next.config.ts                   # Image hosts + allowedDevOrigins for ngrok
├─ .env.example                     # Template for required env vars
└─ README.md
```

---

## Local development

```bash
npm install
cp .env.example .env.local
# Generate a SESSION_SECRET — one-liner is in .env.example.
# Fill in AI_GATEWAY_API_KEY from your Vercel account.
# OAuth vars are optional — PAT works without them.
npm run dev
```

Open http://localhost:3000 and connect with a GitHub PAT (fastest path, needs `repo` scope).

### Enabling GitHub OAuth (optional)

Register a one-time OAuth App at <https://github.com/settings/applications/new>:

| Field | Value |
|---|---|
| Application name | anything (e.g. `GEO Forge — local`) |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |

Fill the three `GITHUB_*` env vars in `.env.local` with the App's credentials and restart `npm run dev`. The **Continue with GitHub** button activates.

For ngrok or production, the callback URL on the OAuth App must match `GITHUB_REDIRECT_URI` exactly (including protocol).

---

## Environment variables

| Var | Required | What |
|---|---|---|
| `SESSION_SECRET` | **yes** | 32+ bytes base64. Encrypts the iron-session cookie (AES-GCM). |
| `AI_GATEWAY_API_KEY` | **yes** (for the agent) | Your Vercel AI Gateway key (`vck_…`). |
| `AI_GATEWAY_BASE_URL` | no | Defaults to `https://ai-gateway.vercel.sh/v1`. |
| `AI_GATEWAY_MODEL` | no | Defaults to `anthropic/claude-haiku-4.5`. |
| `GITHUB_CLIENT_ID` | for OAuth | From the OAuth App. |
| `GITHUB_CLIENT_SECRET` | for OAuth | From the OAuth App. |
| `GITHUB_REDIRECT_URI` | for OAuth | Must match the callback URL on the OAuth App. |
| `ALLOWED_DEV_ORIGINS` | optional | Extra hostnames for Next.js dev (comma-separated, useful for ngrok). |

Generate `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Deployment (Vercel)

1. Import the repo at <https://vercel.com/new>.
2. During import, pick a Project Name — your URL will be `https://<name>.vercel.app`.
3. Set all env vars listed above. For `GITHUB_REDIRECT_URI`, use the `https://<name>.vercel.app/api/auth/github/callback` that matches your project name.
4. Register (or update) the GitHub OAuth App with the same callback URL.
5. Deploy. First load takes ~2 s; agent runs usually finish in ~15–25 s and stay well under the 60 s Vercel function limit.

---

## Design decisions

| Decision | Why |
|---|---|
| **No database** | Single-session tool, not a SaaS. Cookie holds everything. Smaller surface area, simpler deploy. |
| **OAuth AND PAT, side-by-side** | Spec said "OAuth or PAT" — neither is primary. User picks. PAT is scope-checked upfront (`repo` required for classic PATs). |
| **Code for detection, AI for fixing** | Detection is cheap and predictable (regex + file presence). Fixing needs understanding — that's where AI earns its cost. |
| **4 universal rules** | Over an earlier wider ruleset, trimmed to rules that (a) apply to any stack and (b) have real auto-fixes. Adding more is a one-line change in `lib/rules/index.ts`. |
| **Agent with tools vs. rule-based fix templates** | A template for `<meta name=description>` on a Next.js layout.tsx is different from one on a Rails ERB layout. Writing templates for every stack × rule combination doesn't scale. Claude already knows every stack's conventions from training — let it do the work, just give it eyes + hands. |
| **Guardrails inside the tool** (ReAct) | If the agent truncates a file or forgets the required tag, the tool rejects the proposal with a specific error. Claude reads the error and retries in the next iteration — self-correcting, no human recovery needed. |
| **Git Data API for PR creation** | One clean commit with N file changes. The Contents API would produce one commit per file — noisy, unprofessional diff. |
| **SSE over fetch ReadableStream** | Native browser API, POST-friendly (EventSource is GET-only), works on Vercel without extra config. |
| **Read-only repo detection** | Check `permissions.push` on repo connect. If false, the scan still runs but the **Raise PR** button shows "Read-only — can't raise PR" (backend also has a pre-flight so we never burn AI tokens on a repo we can't commit to). |
| **Per-issue PR linking** | Once a PR is raised, each card in the selection flips to a **View PR #N ↗** button. Cards not in the PR stay checkbox-selectable, so the user can raise a follow-up PR for the rest. |

---

## What's intentionally not here

- **Database / multi-user** — out of scope for a single-session tool.
- **Per-rule AST editing** — riskier than giving Claude the whole file and validating its output with guardrails.
- **Auto-merge / auto-deploy** — every PR is reviewed by the user.
- **Rescan-after-fix verification** — today we trust the guardrails + human review. A second scan pass against agent-modified file contents would close the loop. Follow-up.
- **GitHub App** (vs. OAuth App) — would give finer-grained per-repo install control + JWTs + installation tokens. Not worth the complexity for the demo.
- **Recovery from mid-session token revocation** — we don't auto-detect 401s from GitHub after initial connect. User would see a confusing error and have to disconnect manually. Follow-up.

---

## Future improvements (in rough priority order)

1. **Rescan-after-fix** — run the scanner again against agent-proposed file contents, mark each issue, loop if any remain.
2. **Per-issue commit messages** — the agent already calls `set_pr_metadata` for the whole PR; could break into per-file commits with rule-specific messages.
3. **More stacks** — add explicit detection + rules for Astro, SvelteKit, Remix, Jekyll. The agent handles them already, but better detection = better UX.
4. **Scan history** — a simple "this repo was last scanned on X; here's the diff vs. then" view. Needs a database.
5. **Scheduled re-scans** — Vercel Cron that pings connected repos weekly and auto-opens PRs for new issues.
6. **GitHub App version** — per-repo install picker, no OAuth App registration ceremony.

---

## Scripts

```bash
npm run dev     # Next.js dev server with Turbopack
npm run build   # Production build (strict TypeScript + ESLint run separately)
npm run start   # Serve the built output locally
npm run lint    # ESLint — not part of build in Next 16
```
