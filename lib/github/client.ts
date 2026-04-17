import { Octokit } from "@octokit/rest";
import type { ConnectedRepo } from "../types";

export function octokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: "seo-github-pr-bot/0.1",
    request: {
      // Cut retries from the default 3 to 1 so a flaky GitHub fails fast
      // instead of stalling the page render for 10+ seconds.
      retries: 1,
      retryAfter: 1,
    },
  });
}

export interface GitHubIdentity {
  githubId: number;
  githubLogin: string;
  avatarUrl: string | null;
}

export type TokenType = "classic-pat" | "fine-grained-pat" | "oauth" | "unknown";

export interface AuthInfo {
  identity: GitHubIdentity;
  scopes: string[];
  tokenType: TokenType;
}

/** Required classic-PAT scope to read trees + open PRs. */
export const REQUIRED_CLASSIC_SCOPE = "repo";

export function detectTokenType(token: string): TokenType {
  if (token.startsWith("ghp_")) return "classic-pat";
  if (token.startsWith("github_pat_")) return "fine-grained-pat";
  if (token.startsWith("gho_")) return "oauth";
  return "unknown";
}

/**
 * Authenticate a token against GET /user and pull the granted scopes
 * out of the X-OAuth-Scopes response header.
 *
 * Notes:
 *  - Classic PATs ("ghp_…") populate X-OAuth-Scopes with comma-separated scopes.
 *  - Fine-grained PATs ("github_pat_…") leave the header empty — their
 *    permissions are per-repository and only visible when an operation runs.
 *  - OAuth user tokens ("gho_…") populate the header from the granted scopes.
 */
export async function authenticate(token: string): Promise<AuthInfo> {
  const client = octokit(token);
  const response = await client.request("GET /user");
  const header = (response.headers["x-oauth-scopes"] ?? "") as string;
  const scopes = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    identity: {
      githubId: response.data.id,
      githubLogin: response.data.login,
      avatarUrl: response.data.avatar_url ?? null,
    },
    scopes,
    tokenType: detectTokenType(token),
  };
}

export interface ScopeCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Strict scope check for PAT submission.
 *
 * - Classic PATs must include the `repo` scope.
 * - Fine-grained PATs are accepted here; their per-repo permissions are
 *   enforced at /api/repo connect-time and at fix-PR creation time (PR 2).
 * - Unknown shapes (anything not matching a known prefix) are rejected.
 */
export function checkPatScopes(auth: AuthInfo): ScopeCheckResult {
  if (auth.tokenType === "classic-pat") {
    if (!auth.scopes.includes(REQUIRED_CLASSIC_SCOPE)) {
      const granted = auth.scopes.length ? auth.scopes.join(", ") : "(none)";
      return {
        ok: false,
        reason: `Token is missing the required scope. Granted: ${granted}. Generate a fresh classic PAT with the 'repo' scope.`,
      };
    }
    return { ok: true };
  }
  if (auth.tokenType === "fine-grained-pat") {
    return { ok: true };
  }
  if (auth.tokenType === "oauth") {
    if (!auth.scopes.includes(REQUIRED_CLASSIC_SCOPE)) {
      return {
        ok: false,
        reason:
          "OAuth token doesn't have the 'repo' scope. Re-authorize the app and accept the requested permissions.",
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      "Unrecognized token format. Use a classic PAT ('ghp_…'), a fine-grained PAT ('github_pat_…'), or sign in with GitHub.",
  };
}

export async function getCurrentUser(token: string): Promise<GitHubIdentity> {
  const auth = await authenticate(token);
  return auth.identity;
}

export async function fetchRepo(
  token: string,
  owner: string,
  name: string
): Promise<ConnectedRepo> {
  const client = octokit(token);
  const { data } = await client.repos.get({ owner, repo: name });
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    defaultBranch: data.default_branch,
    isPrivate: data.private,
    htmlUrl: data.html_url,
  };
}
