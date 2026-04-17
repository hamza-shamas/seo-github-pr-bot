# GEO Forge

Connect a GitHub repo, scan it for SEO + GEO (Generative Engine Optimization) gaps, and open a single AI-drafted pull request with the fixes.

This branch (`connect-github-repo`) is **PR 1 of 2**. It ships the connect-GitHub flow only:

- Sign in with **GitHub OAuth** _or_ paste a **Personal Access Token** — user picks.
- Validate access to a specific `owner/repo`.
- Encrypted, http-only session cookie. No database.

The scanner + AI fix-PR generator ships in PR 2.

## Stack

- Next.js 16 (App Router), React 19, Tailwind v4, TypeScript strict.
- `@octokit/rest` for the GitHub API, `iron-session` for the encrypted session cookie, `zod` for input validation.

## Local setup

```bash
npm install
cp .env.example .env.local
# Fill in SESSION_SECRET (the .env.example has a generator one-liner).
# OAuth env vars are optional — leave blank and the OAuth panel becomes a setup hint.
npm run dev
```

Open http://localhost:3000 and either paste a fine-grained GitHub PAT (with `repo` scope) or click **Continue with GitHub** if OAuth is configured.

## Enabling the OAuth panel

OAuth requires a one-time GitHub OAuth App registration:

1. Go to <https://github.com/settings/applications/new>.
2. **Application name**: anything (e.g. `GEO Forge — local`).
3. **Homepage URL**: `http://localhost:3000` (or your deployed URL).
4. **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback` (must match `GITHUB_REDIRECT_URI` exactly).
5. Generate a client secret. Copy the Client ID and Client Secret.
6. Set the three env vars in `.env.local`:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
```

7. Restart `npm run dev`. The **Continue with GitHub** button activates.

For a production deploy, register a separate OAuth App with the production URL as the callback (or add a second one) — preview-deploy URLs differ from production and would break the callback round-trip.

## Env vars

| Var | Required | What |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32+ bytes base64; encrypts the session cookie. |
| `GITHUB_CLIENT_ID` | for OAuth | From the registered OAuth App. |
| `GITHUB_CLIENT_SECRET` | for OAuth | From the registered OAuth App. |
| `GITHUB_REDIRECT_URI` | for OAuth | Must equal the callback URL configured on the OAuth App. |

`SESSION_SECRET` generator:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Scripts

```bash
npm run dev     # Next.js dev server (Turbopack)
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint (Next 16 doesn't run lint as part of build)
```

## What's intentionally not here

- **No database.** Token + GitHub identity + connected repo all live in the encrypted session cookie. Disconnect = cookie gone.
- **No scan logic / AI yet.** That's PR 2 — `lib/rules/`, `lib/ai/`, `lib/github/pr.ts`, `/api/fix`, `/scan/[owner]/[repo]`.
- **No multi-user concept.** This is a single-session tool, not a SaaS.
