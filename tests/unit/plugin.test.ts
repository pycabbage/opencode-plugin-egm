import { describe, expect, test } from "bun:test";
import plugin from "../../src/index.ts";

interface AgentShape {
  id: string;
  mode?: string;
  permissions: { action: string; resource: string; effect: string }[];
}
const agents = new Map<string, AgentShape>();
const skills: { name: string; description: string; content: string; path: string }[] = [];
const commands: {
  name: string;
  execute: (input: { sessionID: string; prompt: { text: string } }) => Promise<void>;
}[] = [];
const prompts: unknown[] = [];
let defaultAgent: string | undefined;
const editor = {
  agent: {
    list: () => [],
    get: (id: string) => agents.get(id),
    default: (id: string | undefined) => {
      defaultAgent = id;
    },
    update: (id: string, fn: (a: AgentShape) => void) => {
      const a = agents.get(id) ?? ({ id, permissions: [] } as AgentShape);
      fn(a);
      agents.set(id, a);
    },
    remove: (id: string) => agents.delete(id),
  },
  skill: {
    list: () => skills,
    get: (id: string) => skills.find((s) => s.name === id),
    add: (s: never) => skills.push(s),
    update: () => {},
    remove: () => {},
  },
  command: {
    add: (c: never) => commands.push(c),
  },
};
const ctx = {
  agent: { transform: (fn: (ed: typeof editor.agent) => void) => fn(editor.agent) },
  skill: { transform: (fn: (ed: typeof editor.skill) => void) => fn(editor.skill) },
  command: { transform: (fn: (ed: typeof editor.command) => void) => fn(editor.command) },
  session: { prompt: async (input: unknown) => prompts.push(input) },
};
await plugin.setup(ctx as never);

const rows = (agent: string) =>
  agents.get(agent)!.permissions.map((r) => [r.action, r.resource, r.effect] as const);
const indexOf = (agent: string, row: [string, string, string]) =>
  rows(agent).findIndex((r) => r[0] === row[0] && r[1] === row[1] && r[2] === row[2]);

describe("plugin setup", () => {
  test("registers egm as default plus eight reviewers", () => {
    expect(defaultAgent).toBe("egm");
    expect(agents.get("egm")?.mode).toBe("primary");
    const reviewers = [...agents.values()].filter((a) => a.mode === "subagent");
    expect(reviewers).toHaveLength(8);
  });
  test("reviewers are read-only and cannot read .env or instruction files", () => {
    for (const id of [...agents.keys()].filter((k) => k !== "egm")) {
      const p = rows(id);
      expect(p[0]).toEqual(["*", "*", "deny"]);
      for (const row of [
        ["read", "*.env", "deny"],
        ["read", "*.env.*", "deny"],
        ["read", "**/.env", "deny"],
        ["read", "**/.env.*", "deny"],
        ["read", "**/*.env", "deny"],
        ["read", "**/*.env.*", "deny"],
        ["read", "*.env.example", "allow"],
        ["read", "AGENTS.md", "deny"],
        ["read", "*/AGENTS.md", "deny"],
        ["read", "**/AGENTS.md", "deny"],
        ["read", "CLAUDE.md", "deny"],
        ["read", "*/CLAUDE.md", "deny"],
        ["read", "**/CLAUDE.md", "deny"],
        ["read", "mcp:*", "deny"],
        ["grep", "*", "deny"],
        ["external_directory", "*", "deny"],
      ] as [string, string, string][]) {
        expect(indexOf(id, row)).toBeGreaterThan(indexOf(id, ["read", "*", "allow"]));
      }
      expect(indexOf(id, ["read", "*.env.example", "allow"])).toBeGreaterThan(
        indexOf(id, ["read", "**/*.env.*", "deny"]),
      );
    }
  });
  test("primary grep of .env asks instead of bypassing the read ask", () => {
    const p = rows("egm");
    expect(p[0]).toEqual(["*", "*", "ask"]);
    for (const row of [
      ["grep", "*", "allow"],
      ["grep", "*.env", "ask"],
      ["grep", "*.env.*", "ask"],
      ["grep", "**/*.env", "ask"],
      ["grep", "**/*.env.*", "ask"],
      ["read", "mcp:*", "deny"],
    ] as [string, string, string][]) {
      expect(indexOf("egm", row)).toBeGreaterThan(0);
    }
    expect(indexOf("egm", ["grep", "*.env", "ask"])).toBeGreaterThan(
      indexOf("egm", ["grep", "*", "allow"]),
    );
  });
  test("primary dispatches only to reviewers", () => {
    expect(indexOf("egm", ["subagent", "*", "deny"])).toBeGreaterThan(0);
    for (const id of [...agents.keys()].filter((k) => k !== "egm")) {
      expect(indexOf("egm", ["subagent", id, "allow"])).toBeGreaterThan(
        indexOf("egm", ["subagent", "*", "deny"]),
      );
    }
    expect(indexOf("egm", ["subagent", "general", "allow"])).toBe(-1);
    expect(indexOf("egm", ["write", "*", "allow"])).toBeGreaterThan(0);
  });
  test("registers seven skills and seven commands", () => {
    expect(skills.map((s) => s.name).sort()).toEqual([
      "egm-bootstrap",
      "egm-brainstorm",
      "egm-draft",
      "egm-drift-report",
      "egm-resolve",
      "egm-review",
      "egm-review-loop",
    ]);
    expect(skills[0]!.content.length).toBeGreaterThan(100);
    expect(commands).toHaveLength(7);
  });
  test("skill descriptions survive YAML folded scalars", () => {
    for (const s of skills) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.description).not.toBe(">-");
    }
    expect(skills.find((s) => s.name === "egm-brainstorm")!.description).toStartWith(
      "Interactive ideation and brainstorming",
    );
  });
  test("commands prompt the session with a flat sessionID and text", async () => {
    const cmd = commands.find((c) => c.name === "egm-brainstorm")!;
    await cmd.execute({ sessionID: "ses_1", prompt: { text: "/egm-brainstorm /tmp/x.md" } });
    const sent = prompts[0] as { sessionID: string; text: string; files?: string[] };
    expect(sent.sessionID).toBe("ses_1");
    expect("prompt" in (prompts[0] as object)).toBe(false);
    expect(sent.text).toContain("Read and execute");
    expect(sent.text).toContain("/egm-brainstorm /tmp/x.md");
    await cmd.execute({ sessionID: "ses_2", prompt: { text: "$(rm -rf /tmp)" } });
    const refused = prompts[1] as { text: string };
    expect(refused.text).toContain("was not run");
    expect(refused.text).toContain("may already have expanded them");
    expect(refused.text).not.toContain("Read and execute");
  });
});
