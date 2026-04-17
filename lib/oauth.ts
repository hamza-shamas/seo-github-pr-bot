import { randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

export const OAUTH_SCOPES = "repo";

interface OAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function oauthEnv(): OAuthEnv {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / GITHUB_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET &&
      process.env.GITHUB_REDIRECT_URI
  );
}

/**
 * The canonical public origin the user is browsing from.
 * Derived from GITHUB_REDIRECT_URI so OAuth callback redirects always land
 * back on the same host the user came in through (ngrok, Vercel, etc.) —
 * never on the underlying dev origin (http://localhost:3000) which the
 * Next.js handler sees behind a tunnel.
 */
export function publicAppOrigin(fallback: string | URL): string {
  const uri = process.env.GITHUB_REDIRECT_URI;
  if (uri) {
    try {
      return new URL(uri).origin;
    } catch {
      // fall through
    }
  }
  return new URL("/", fallback).origin;
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = oauthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
    allow_signup: "true",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

export interface ExchangedToken {
  accessToken: string;
  scopes: string;
}

export async function exchangeCodeForToken(code: string): Promise<ExchangedToken> {
  const { clientId, clientSecret, redirectUri } = oauthEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (json.error || !json.access_token) {
    throw new Error(json.error_description || json.error || "OAuth token exchange failed");
  }

  return { accessToken: json.access_token, scopes: json.scope ?? "" };
}
