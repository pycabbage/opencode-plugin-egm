/**
 * Preflight check for an EGM adapter installation (design section 6.5).
 *
 * Runs `opencode debug agents` under the adapter launch profile
 * (OPENCODE_CONFIG + OPENCODE_DISABLE_PROJECT_CONFIG + --standalone),
 * reads the effective permission rulesets of the `egm` primary agent
 * and the reviewer subagents, and verifies the expectations of the
 * design: reviewers are read-only (writes, shell, delegation, network
 * denied; .env reads denied; project reads allowed), and the primary
 * may dispatch only to the registered reviewers. Exits non-zero and
 * prints every mismatch when the effective configuration differs.
 *
 * This file is copied into the installation destination by the
 * generator so an install is self-contained.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluatePermissions, type PermissionRule } from "./permissions.ts";

export interface EffectiveAgent {
  id: string;
  mode?: string;
  permissions: PermissionRule[];
}

export interface CheckExpectation {
  agent: string;
  action: string;
  resource: string;
  expect: "allow" | "deny" | "ask";
}

export function reviewerExpectations(agentId: string, sampleTarget: string): CheckExpectation[] {
  return [
    { agent: agentId, action: "edit", resource: sampleTarget, expect: "deny" },
    { agent: agentId, action: "bash", resource: "*", expect: "deny" },
    { agent: agentId, action: "shell", resource: "*", expect: "deny" },
    { agent: agentId, action: "subagent", resource: "*", expect: "deny" },
    { agent: agentId, action: "webfetch", resource: "*", expect: "deny" },
    { agent: agentId, action: "skill", resource: "*", expect: "deny" },
    { agent: agentId, action: "grep", resource: "*", expect: "deny" },
    { agent: agentId, action: "read", resource: sampleTarget, expect: "allow" },
    { agent: agentId, action: "read", resource: ".env", expect: "deny" },
    { agent: agentId, action: "read", resource: "config/.env.production", expect: "deny" },
    { agent: agentId, action: "read", resource: ".env.example", expect: "allow" },
    { agent: agentId, action: "read", resource: "AGENTS.md", expect: "deny" },
    { agent: agentId, action: "read", resource: "docs/CLAUDE.md", expect: "deny" },
    { agent: agentId, action: "glob", resource: "*", expect: "allow" },
  ];
}

export function primaryExpectations(reviewerIds: string[]): CheckExpectation[] {
  const out: CheckExpectation[] = [
    { agent: "egm", action: "write", resource: "/proj/artifact.md", expect: "allow" },
    { agent: "egm", action: "edit", resource: "/proj/artifact.md", expect: "allow" },
    { agent: "egm", action: "shell", resource: "*", expect: "allow" },
    { agent: "egm", action: "subagent", resource: "general", expect: "deny" },
    { agent: "egm", action: "subagent", resource: "explore", expect: "deny" },
    { agent: "egm", action: "skill", resource: "egm-review", expect: "allow" },
    { agent: "egm", action: "skill", resource: "unrelated-skill", expect: "deny" },
  ];
  for (const id of reviewerIds) {
    out.push({ agent: "egm", action: "subagent", resource: id, expect: "allow" });
  }
  return out;
}

export function runExpectations(
  agents: Map<string, EffectiveAgent>,
  expectations: CheckExpectation[],
): string[] {
  const failures: string[] = [];
  for (const exp of expectations) {
    const agent = agents.get(exp.agent);
    if (!agent) {
      failures.push(`${exp.agent}: agent not found`);
      continue;
    }
    const got = evaluatePermissions(agent.permissions, exp.action, exp.resource);
    if (got !== exp.expect) {
      failures.push(
        `${exp.agent}: ${exp.action} ${exp.resource} expected ${exp.expect}, got ${got ?? "no-match"}`,
      );
    }
  }
  return failures;
}

export async function loadInstall(dest: string): Promise<{ reviewerIds: string[] }> {
  const config = JSON.parse(await readFile(join(dest, "opencode.json"), "utf8")) as {
    agents: Record<string, { mode?: string }>;
  };
  const reviewerIds = Object.entries(config.agents)
    .filter(([id, a]) => id !== "egm" && a.mode === "subagent")
    .map(([id]) => id);
  return { reviewerIds };
}

export async function fetchEffectiveAgents(
  dest: string,
  cwd: string,
): Promise<Map<string, EffectiveAgent>> {
  const bin = process.env.EGM_OPENCODE_BIN ?? "opencode";
  const proc = Bun.spawn([bin, "--standalone", "debug", "agents"], {
    cwd,
    env: {
      ...process.env,
      OPENCODE_CONFIG: join(dest, "opencode.json"),
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`opencode debug agents failed (exit ${code})`);
  }
  const list = JSON.parse(text) as EffectiveAgent[];
  return new Map(list.map((a) => [a.id, a]));
}

async function main(): Promise<void> {
  const dest = process.argv[2];
  const cwd = process.argv[3] ?? process.cwd();
  if (!dest) {
    console.error("usage: check.ts <install-dest> [project-cwd]");
    process.exit(2);
  }
  const { reviewerIds } = await loadInstall(dest);
  const agents = await fetchEffectiveAgents(dest, cwd);
  const sampleTarget = join(cwd, "some-target.md");
  const expectations: CheckExpectation[] = [
    ...reviewerIds.flatMap((id) => reviewerExpectations(id, sampleTarget)),
    ...primaryExpectations(reviewerIds),
  ];
  const failures = runExpectations(agents, expectations);
  if (failures.length > 0) {
    console.error("EGM preflight check FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(
    `EGM preflight check passed: egm + ${reviewerIds.length} reviewers, ${expectations.length} expectations.`,
  );
}

if (import.meta.main) {
  await main();
}
