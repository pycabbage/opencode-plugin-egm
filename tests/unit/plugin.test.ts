import { describe, expect, test } from "bun:test";
import plugin from "../../src/index.ts";

interface AgentShape {
  id: string;
  mode?: string;
  permissions: { action: string; resource: string; effect: string }[];
}
const agents = new Map<string, AgentShape>();
const skills: { name: string; content: string; path: string }[] = [];
const commands: { name: string }[] = [];
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
  agent: { transform: async (fn: (ed: typeof editor.agent) => void) => fn(editor.agent) },
  skill: { transform: async (fn: (ed: typeof editor.skill) => void) => fn(editor.skill) },
  command: { transform: async (fn: (ed: typeof editor.command) => void) => fn(editor.command) },
  session: { prompt: async () => {} },
};
await plugin.setup(ctx as never);

const effect = (agent: string, action: string, resource: string) => {
  let result: string | undefined;
  for (const r of agents.get(agent)!.permissions) {
    const match = (p: string, v: string) =>
      new RegExp(`^${p.replaceAll("**", " ").replaceAll("*", ".*").replaceAll(" ", ".*")}$`).test(
        v,
      ) ||
      new RegExp(`^${p.replaceAll("**", " ").replaceAll("*", ".*").replaceAll(" ", ".*")}$`).test(
        v.split("/").at(-1)!,
      );
    if (match(r.action, action) && match(r.resource, resource)) result = r.effect;
  }
  return result;
};

describe("plugin setup", () => {
  test("registers egm as default plus eight reviewers", () => {
    expect(defaultAgent).toBe("egm");
    expect(agents.get("egm")?.mode).toBe("primary");
    const reviewers = [...agents.values()].filter((a) => a.mode === "subagent");
    expect(reviewers).toHaveLength(8);
  });
  test("reviewers are read-only and cannot read .env or instruction files", () => {
    for (const id of [...agents.keys()].filter((k) => k !== "egm")) {
      expect(effect(id, "edit", "/p/x.md")).toBe("deny");
      expect(effect(id, "subagent", "*")).toBe("deny");
      expect(effect(id, "read", "/p/design.md")).toBe("allow");
      expect(effect(id, "read", ".env")).toBe("deny");
      expect(effect(id, "read", "/p/AGENTS.md")).toBe("deny");
    }
  });
  test("primary dispatches only to reviewers", () => {
    expect(effect("egm", "subagent", "egm-design")).toBe("allow");
    expect(effect("egm", "subagent", "general")).toBe("deny");
    expect(effect("egm", "write", "/p/concepts_brief.md")).toBe("allow");
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
});
