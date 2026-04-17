import type { Issue, RepoContext } from "../types";
import type { AgentProposal } from "./types";
import {
  validateContentForPath,
  validateContentSatisfiesIssue,
  validateProposalShape,
  validateUpdatePreservesOriginal,
} from "./guards";

/** OpenAI-compatible tool schemas (Vercel AI Gateway passes these through
 * to Anthropic's tool_use format). */
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description:
        "List file paths in the repository tree. Optionally filter by a substring (e.g. 'layouts', '.erb', 'routes.rb'). Returns up to 200 paths.",
      parameters: {
        type: "object",
        properties: {
          contains: {
            type: "string",
            description:
              "Optional substring to filter paths. Case-insensitive. Omit to list everything (capped at 200).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description:
        "Read the contents of a single file from the repository. Returns the file as UTF-8 text. Files larger than 64KB are truncated.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repo-relative path, e.g. 'app/views/layouts/application.html.erb'.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_file_change",
      description:
        "Stage a file change for the final PR commit. Use 'create' for new files (robots.txt, sitemap.xml) and 'update' for existing files (layout templates). The change is NOT applied immediately — all proposals are batched into one commit at the end.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repo-relative path of the file to create or update.",
          },
          content: {
            type: "string",
            description:
              "FULL final content of the file. For updates, include the entire original file with your changes applied — do not return a diff.",
          },
          kind: {
            type: "string",
            enum: ["create", "update"],
            description: "Whether the file is being created from scratch or an existing file is being updated.",
          },
        },
        required: ["path", "content", "kind"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "finish",
      description:
        "Call this when you have proposed all the file changes needed to fix the selected issues. After this, the agent loop ends and the PR is opened.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

const READ_FILE_MAX_BYTES = 64 * 1024;
const LIST_FILES_LIMIT = 200;

const SKIP_PATTERNS = [
  /(?:^|\/)node_modules\//,
  /(?:^|\/)\.next\//,
  /(?:^|\/)\.svelte-kit\//,
  /(?:^|\/)dist\//,
  /(?:^|\/)build\//,
  /(?:^|\/)coverage\//,
  /(?:^|\/)\.git\//,
  /(?:^|\/)vendor\/(?:bundle|cache|gems)\//,
  /(?:^|\/)_build\//,
  /(?:^|\/)deps\//,
];

export interface ToolExecutionContext {
  ctx: RepoContext;
  proposals: Map<string, AgentProposal>;
  finished: { value: boolean };
  /** The issues the agent is fixing — used by guardrails to validate
   * that proposals actually contain the markup the issue requires. */
  issues: Issue[];
}

export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  summary: string;
}

export async function executeTool(
  name: string,
  rawArgs: string,
  exec: ToolExecutionContext
): Promise<ToolExecutionResult> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, error: "invalid_json", summary: "tool args weren't valid JSON" };
  }

  switch (name) {
    case "list_files":
      return listFiles(exec.ctx, typeof args.contains === "string" ? args.contains : undefined);
    case "read_file":
      return await readFile(exec.ctx, String(args.path ?? ""));
    case "propose_file_change":
      return await proposeFileChange(
        exec,
        String(args.path ?? ""),
        String(args.content ?? ""),
        String(args.kind ?? "")
      );
    case "finish":
      exec.finished.value = true;
      return { ok: true, summary: "agent finished" };
    default:
      return { ok: false, error: "unknown_tool", summary: `unknown tool: ${name}` };
  }
}

function listFiles(ctx: RepoContext, contains?: string): ToolExecutionResult {
  const needle = contains?.toLowerCase();
  const matches: string[] = [];
  for (const path of ctx.tree.keys()) {
    if (SKIP_PATTERNS.some((re) => re.test(path))) continue;
    if (needle && !path.toLowerCase().includes(needle)) continue;
    matches.push(path);
    if (matches.length >= LIST_FILES_LIMIT) break;
  }
  return {
    ok: true,
    data: { paths: matches, truncated: matches.length === LIST_FILES_LIMIT },
    summary: `${matches.length} path${matches.length === 1 ? "" : "s"}${
      contains ? ` matching "${contains}"` : ""
    }`,
  };
}

async function readFile(ctx: RepoContext, path: string): Promise<ToolExecutionResult> {
  if (!path) return { ok: false, error: "missing_path", summary: "no path given" };
  if (SKIP_PATTERNS.some((re) => re.test(path))) {
    return { ok: false, error: "blocked_path", summary: `blocked path: ${path}` };
  }
  const content = await ctx.getFile(path);
  if (content === null) {
    return { ok: false, error: "not_found", summary: `${path} not found or not readable` };
  }
  const truncated = content.length > READ_FILE_MAX_BYTES;
  const body = truncated ? content.slice(0, READ_FILE_MAX_BYTES) : content;
  return {
    ok: true,
    data: { path, content: body, truncated, originalBytes: content.length },
    summary: `${path} (${content.length} bytes${truncated ? ", truncated" : ""})`,
  };
}

const PROPOSAL_MAX_BYTES = 256 * 1024;

async function proposeFileChange(
  exec: ToolExecutionContext,
  path: string,
  content: string,
  kind: string
): Promise<ToolExecutionResult> {
  // ---- Path / shape guards ----
  if (!path) return { ok: false, error: "missing_path", summary: "no path given" };
  if (kind !== "create" && kind !== "update") {
    return { ok: false, error: "bad_kind", summary: `kind must be 'create' or 'update', got: ${kind}` };
  }
  if (SKIP_PATTERNS.some((re) => re.test(path))) {
    return { ok: false, error: "blocked_path", summary: `refusing to write blocked path: ${path}` };
  }
  if (content.length > PROPOSAL_MAX_BYTES) {
    return {
      ok: false,
      error: "too_large",
      summary: `proposed content is ${content.length} bytes (max ${PROPOSAL_MAX_BYTES})`,
    };
  }
  if (kind === "update" && !exec.ctx.hasPath(path)) {
    return {
      ok: false,
      error: "missing_for_update",
      summary: `cannot update ${path} — it doesn't exist; use kind: 'create' instead`,
    };
  }

  // ---- Content shape guard ----
  const shapeCheck = validateProposalShape(content);
  if (!shapeCheck.ok) {
    return { ok: false, error: "bad_shape", summary: shapeCheck.reason ?? "bad content shape" };
  }

  // ---- Path-specific guard (sitemap.xml structure, robots.txt directives, …) ----
  const pathCheck = validateContentForPath(path, content);
  if (!pathCheck.ok) {
    return { ok: false, error: "bad_content", summary: pathCheck.reason ?? "bad content" };
  }

  // ---- Update-preserves-original guard (no truncation, no rewrite) ----
  if (kind === "update") {
    const original = await exec.ctx.getFile(path);
    if (original) {
      const preserveCheck = validateUpdatePreservesOriginal(original, content);
      if (!preserveCheck.ok) {
        return {
          ok: false,
          error: "bad_update",
          summary: preserveCheck.reason ?? "update doesn't preserve original",
        };
      }
    }
  }

  // ---- Issue-satisfaction guard ----
  // If the agent claims this proposal fixes a specific issue (matched by
  // path heuristics), require the new content to actually contain the
  // expected markup. This catches "I changed a comment but forgot to add
  // the meta tag" mistakes.
  for (const issue of relevantIssuesForPath(exec.issues, path, kind)) {
    const issueCheck = validateContentSatisfiesIssue(issue.ruleId, content);
    if (!issueCheck.ok) {
      return {
        ok: false,
        error: "missing_required_markup",
        summary: issueCheck.reason ?? "proposal doesn't satisfy the issue",
      };
    }
  }

  exec.proposals.set(path, { path, kind, content });
  return {
    ok: true,
    data: { path, kind, bytes: content.length },
    summary: `staged ${kind} of ${path} (${content.length} bytes)`,
  };
}

/** Pick which selected issues a given path-change is plausibly satisfying.
 * Conservative: only match when the path obviously corresponds to the rule. */
function relevantIssuesForPath(issues: Issue[], path: string, kind: string): Issue[] {
  const lower = path.toLowerCase();
  const matched: Issue[] = [];
  for (const issue of issues) {
    if (issue.ruleId === "head-title" || issue.ruleId === "head-description") {
      // These rules edit a layout / template file. Don't apply the
      // markup-required check to unrelated file creates (e.g. robots.txt).
      if (kind === "update") matched.push(issue);
    }
    // robots-txt and sitemap-xml are already covered by the path-specific
    // structure check above; no additional markup requirement needed.
  }
  return matched;
}
