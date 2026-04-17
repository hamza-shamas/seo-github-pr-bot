import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { aiClient, aiModel, isAiEnabled } from "../ai/client";
import type { Issue, RepoContext } from "../types";
import { AGENT_TOOLS, executeTool, type ToolExecutionContext } from "./tools";
import type { AgentEvent, AgentProposal } from "./types";

const SYSTEM_PROMPT = `You are an SEO and Generative-Engine-Optimization (GEO) coding agent. The user has connected a GitHub repo and selected a list of issues for you to fix.

You operate by calling tools:
  - list_files(contains?)         — explore the repo tree
  - read_file(path)               — inspect a specific file
  - propose_file_change(...)      — stage a file change for the final PR commit
  - finish()                      — signal you're done

Your goal: for each selected issue, identify the right file(s) to modify and stage the changes via propose_file_change. When you've handled every issue, call finish().

Hard rules:
  - For UPDATES: read the file first. Then output the COMPLETE modified file in propose_file_change.content (not a diff). Preserve all existing code, indentation, ERB / Blade / HEEx tags, and comments. Only add what's needed.
  - For meta description / title: read the project README first to draft accurate copy. Don't invent facts.
  - For sitemap.xml + robots.txt: BEFORE falling back to https://example.com, try to discover a real production URL by reading these in order: (1) the user-supplied "Site URL" in the user prompt if present, (2) README.md (look for "https://..." links, deploy badges, "Live at:", "demo:", etc.), (3) package.json "homepage" field, (4) vercel.json / netlify.toml / fly.toml. Only use https://example.com if you genuinely can't find any signal.
  - For sitemap.xml: try to read the routes file (config/routes.rb for Rails, urls.py for Django, app/**/page.tsx for Next.js, etc.) and generate real route entries.
  - For robots.txt: a sensible default is User-agent: * + Allow: / + a Sitemap line pointing at the discovered (or fallback) host.
  - Don't touch unrelated files. Don't refactor. Don't add comments to existing code.
  - You have at most 12 tool-call iterations. Use them efficiently — list once, read only what you need, then propose.
  - If you genuinely can't fix an issue (e.g., no layout file exists in the repo), skip it and call finish() — don't loop.`;

const MAX_ITERATIONS = 12;
const MAX_TOTAL_MS = 55_000;

export interface RunAgentInput {
  ctx: RepoContext;
  issues: Issue[];
  /** Optional user-supplied production URL — overrides any URL the agent
   * might otherwise infer from the README. */
  siteUrl?: string;
}

export interface RunAgentResult {
  proposals: AgentProposal[];
  iterations: number;
  finishedCleanly: boolean;
}

export async function runAgent(
  input: RunAgentInput,
  emit: (event: AgentEvent) => void
): Promise<RunAgentResult> {
  if (!isAiEnabled()) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set — the agent needs the Vercel AI Gateway to run."
    );
  }

  const proposals = new Map<string, AgentProposal>();
  const finished = { value: false };
  const exec: ToolExecutionContext = {
    ctx: input.ctx,
    proposals,
    finished,
    issues: input.issues,
  };

  emit({
    type: "start",
    repo: input.ctx.fullName,
    issueIds: input.issues.map((i) => i.id),
  });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  const startedAt = Date.now();
  let iteration = 0;

  while (iteration < MAX_ITERATIONS && !finished.value) {
    if (Date.now() - startedAt > MAX_TOTAL_MS) {
      throw new Error(`Agent exceeded ${MAX_TOTAL_MS / 1000}s time budget`);
    }
    iteration++;
    emit({ type: "iteration", n: iteration });

    const completion = await callModel(messages);

    if (completion.text) {
      emit({ type: "thought", text: completion.text });
    }

    if (completion.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: completion.text || "" });
      finished.value = true;
      break;
    }

    messages.push({
      role: "assistant",
      content: completion.text || null,
      tool_calls: completion.toolCalls,
    });

    for (const tc of completion.toolCalls) {
      const fn = "function" in tc ? tc.function : { name: "", arguments: "" };
      const argsPreview = previewArgs(fn.arguments);
      emit({ type: "tool_call", id: tc.id, name: fn.name, argsPreview });

      const result = await executeTool(fn.name, fn.arguments, exec);

      emit({
        type: "tool_result",
        id: tc.id,
        name: fn.name,
        summary: result.summary,
        ok: result.ok,
      });

      if (
        result.ok &&
        fn.name === "propose_file_change" &&
        result.data &&
        typeof result.data === "object"
      ) {
        const data = result.data as { path: string; kind: "create" | "update"; bytes: number };
        emit({ type: "proposal", path: data.path, kind: data.kind, bytes: data.bytes });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({
          ok: result.ok,
          data: result.data,
          error: result.error,
          summary: result.summary,
        }),
      });
    }
  }

  const proposalsList = [...proposals.values()];
  emit({
    type: "agent_done",
    iterations: iteration,
    proposalCount: proposalsList.length,
  });

  return {
    proposals: proposalsList,
    iterations: iteration,
    finishedCleanly: finished.value,
  };
}

function buildUserPrompt(input: RunAgentInput): string {
  const lines: string[] = [
    `Repository: ${input.ctx.fullName} (default branch: ${input.ctx.defaultBranch})`,
    `Detected stack mode: ${input.ctx.mode}`,
  ];
  if (input.siteUrl) {
    lines.push(`Site URL (user-supplied — use this as the host for sitemap.xml / robots.txt): ${input.siteUrl}`);
  }
  lines.push(``, `Issues to fix:`);
  for (const issue of input.issues) {
    lines.push(`  - [${issue.ruleId}] ${issue.title}`);
    if (issue.evidence) lines.push(`      evidence: ${issue.evidence}`);
  }
  lines.push("");
  lines.push(
    "Start by listing the repo's structure (use list_files with no filter, or with hints like 'layout', 'routes', 'README'). Then read the files you actually need. Stage each fix via propose_file_change. Call finish() when done."
  );
  return lines.join("\n");
}

function previewArgs(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs || "{}");
    const text = JSON.stringify(parsed);
    return text.length > 160 ? text.slice(0, 157) + "..." : text;
  } catch {
    return rawArgs.length > 160 ? rawArgs.slice(0, 157) + "..." : rawArgs;
  }
}

interface CallResult {
  text: string;
  toolCalls: ChatCompletionMessageToolCall[];
}

async function callModel(messages: ChatCompletionMessageParam[]): Promise<CallResult> {
  let completion;
  try {
    completion = await aiClient().chat.completions.create({
      model: aiModel(),
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
      max_tokens: 1500,
      temperature: 0.2,
    });
  } catch (err) {
    // Surface real error context — "Connection error" alone is unhelpful.
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    const detail =
      err && typeof err === "object" && "message" in err
        ? (err as { message?: string }).message
        : String(err);
    console.error("[agent] AI Gateway call failed:", err);
    throw new Error(
      `AI Gateway call failed${status ? ` (HTTP ${status})` : ""}: ${detail}. Verify AI_GATEWAY_BASE_URL, AI_GATEWAY_API_KEY, and AI_GATEWAY_MODEL.`
    );
  }

  const choice = completion.choices[0];
  const text = choice?.message?.content?.trim() ?? "";
  const toolCalls = (choice?.message?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
  return { text, toolCalls };
}
