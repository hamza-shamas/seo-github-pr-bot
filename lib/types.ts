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

// ---------- scan + rules ----------

export type Severity = "high" | "medium" | "low";
export type RepoMode = "next" | "html" | "unknown";
export type RuleCategory = "seo" | "geo";

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface RepoContext {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  mode: RepoMode;
  treeTruncated: boolean;
  /** path -> entry */
  tree: Map<string, TreeEntry>;
  /** Helpers */
  hasPath(path: string): boolean;
  hasAnyPath(paths: string[]): boolean;
  /** Lazy file fetch with per-context cache. Returns null if missing or unfetchable. */
  getFile(path: string): Promise<string | null>;
}

export interface FixAction {
  kind: "create" | "update";
  path: string;
  content: string;
}

export interface Fix {
  id: string;
  description: string;
  actions: FixAction[];
}

export interface Issue {
  id: string;
  ruleId: string;
  category: RuleCategory;
  title: string;
  severity: Severity;
  whyItMatters: string;
  evidence?: string;
  /** Present iff this issue is auto-fixable. PR 2a never sets this; PR 2b will. */
  fix?: Fix;
  /** Present iff "manual fix recommended". A copy-paste snippet for the user. */
  manualSnippet?: string;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  applies(ctx: RepoContext): boolean;
  detect(ctx: RepoContext): Promise<Issue[]>;
}

export interface ScanResult {
  repo: { owner: string; name: string; fullName: string; mode: RepoMode };
  issues: Issue[];
  scannedAt: string;
  durationMs: number;
}
