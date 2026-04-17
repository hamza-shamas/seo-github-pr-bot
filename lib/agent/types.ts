/** Events the agent emits over the SSE stream. */
export type AgentEvent =
  | { type: "start"; repo: string; issueIds: string[] }
  | { type: "iteration"; n: number }
  | { type: "thought"; text: string }
  | { type: "tool_call"; id: string; name: string; argsPreview: string }
  | { type: "tool_result"; id: string; name: string; summary: string; ok: boolean }
  | { type: "proposal"; path: string; kind: "create" | "update"; bytes: number }
  | { type: "agent_done"; iterations: number; proposalCount: number }
  | { type: "pr_opened"; url: string; number: number; branch: string }
  | { type: "pr_existing"; url: string; number: number; createdAt: string }
  | { type: "error"; message: string }
  | { type: "end" };

export interface AgentProposal {
  path: string;
  kind: "create" | "update";
  content: string;
}
