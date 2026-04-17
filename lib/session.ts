import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import type { ConnectionSource, SessionData, SessionUser } from "./types";
import { authenticate, type GitHubIdentity } from "./github/client";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return {
    cookieName: "seo_pr_bot_session",
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export async function ironSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await ironSession();
  return session.user ?? null;
}

interface StartSessionInput {
  token: string;
  source: ConnectionSource;
  scopes?: string;
  identity?: GitHubIdentity;
}

export async function startSession(input: StartSessionInput): Promise<SessionUser> {
  const identity = input.identity ?? (await authenticate(input.token)).identity;
  const user: SessionUser = {
    token: input.token,
    source: input.source,
    scopes: input.scopes,
    ...identity,
  };
  const session = await ironSession();
  session.user = user;
  session.oauthState = undefined;
  await session.save();
  return user;
}

export async function clearSession(): Promise<void> {
  const session = await ironSession();
  session.destroy();
  await session.save();
}
