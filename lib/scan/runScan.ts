import { buildRepoContext } from "../github/repoContext";
import { RULES } from "../rules";
import type { Issue, ScanResult } from "../types";

interface RunScanInput {
  token: string;
  owner: string;
  name: string;
  defaultBranch: string;
}

export async function runScan(input: RunScanInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const ctx = await buildRepoContext(input);

  const applicable = RULES.filter((r) => r.applies(ctx));
  const settled = await Promise.allSettled(applicable.map((r) => r.detect(ctx)));

  const issues: Issue[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      issues.push(...result.value);
    } else {
      // Don't silently swallow rule failures — make them visible.
      const ruleId = applicable[i]?.id ?? "unknown";
      console.error(`[scan] rule "${ruleId}" failed:`, result.reason);
    }
  });

  return {
    repo: {
      owner: ctx.owner,
      name: ctx.repo,
      fullName: ctx.fullName,
      mode: ctx.mode,
    },
    issues,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
