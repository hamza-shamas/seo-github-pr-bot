export type ConnectionSource = "oauth" | "pat";

export interface SessionUser {
  token: string;
  source: ConnectionSource;
  githubId: number;
  githubLogin: string;
  avatarUrl: string | null;
  scopes?: string;
}

export interface ConnectedRepo {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
}

export interface SessionData {
  user?: SessionUser;
  oauthState?: string;
  repo?: ConnectedRepo;
}
