import { describe, expect, test } from "bun:test";
import { Agent, Location, Skill } from "@opencode/plugin";
import type { AgentDomain, AgentEditor } from "@opencode/plugin/promise/agent";
import type {
  CommandDefinition,
  CommandDomain,
  CommandEditor,
} from "@opencode/plugin/promise/command";
import type { Context } from "@opencode/plugin/promise/plugin";
import type { SessionDomain } from "@opencode/plugin/promise/session";
import type { SkillDomain, SkillEditor } from "@opencode/plugin/promise/skill";
import { PromptInput } from "@opencode/schema/prompt-input";
import { Session } from "@opencode/schema/session";
import { Schema } from "effect";
import type { Types } from "effect";
import plugin from "../../src/index.ts";

const stub = (): never => {
  throw new Error("test double: not implemented");
};

const agents = new Map<string, Types.DeepMutable<Agent.Info>>();
let defaultAgent: string | undefined;
const agentEditor: AgentEditor = {
  list: () => [...agents.values()],
  get: (id) => agents.get(id),
  default: (id) => {
    defaultAgent = id;
  },
  update: (id, fn) => {
    const draft = agents.get(id) ?? Agent.Info.default(Agent.ID.make(id));
    fn(draft);
    agents.set(id, draft);
  },
  remove: (id) => {
    agents.delete(id);
  },
};
const skills: Skill.Info[] = [];
const skillEditor: SkillEditor = {
  list: () => skills,
  get: (id) => skills.find((s) => s.id === id),
  add: (s) => {
    skills.push(s);
  },
  update: () => {},
  remove: () => {},
};
const commands: CommandDefinition[] = [];
const commandEditor: CommandEditor = {
  add: (c) => {
    commands.push(c);
  },
};
type PromptCall = Parameters<SessionDomain["prompt"]>[0];
const prompts: PromptCall[] = [];
const registration = { dispose: async () => {} };
const ctx: Context = {
  app: { name: "test", version: "0.0.0", channel: "test" },
  location: Schema.decodeSync(Location.Info)({
    directory: "/tmp",
    project: { id: "test", directory: "/tmp", canonical: "/tmp" },
  }),
  options: {},
  agent: {
    get: stub,
    list: stub,
    transform: async (fn) => {
      fn(agentEditor);
      return registration;
    },
    reload: stub,
  } satisfies AgentDomain,
  aisdk: { hook: stub },
  command: {
    list: stub,
    transform: async (fn) => {
      fn(commandEditor);
      return registration;
    },
    reload: stub,
  } satisfies CommandDomain,
  credential: { activate: stub },
  event: { subscribe: stub },
  experimental: {
    terminal: { read: stub },
    generate: { text: stub, image: stub, decisions: stub },
    artifact: { transform: stub, reload: stub },
  },
  integration: {
    list: stub,
    get: stub,
    connect: { key: stub, external: stub },
    oauth: { connect: stub, status: stub, complete: stub, cancel: stub },
    command: { connect: stub, status: stub, cancel: stub },
    transform: stub,
    reload: stub,
    connection: { active: stub, resolve: stub, status: stub },
  },
  mcp: { list: stub, transform: stub, reload: stub },
  model: { list: stub, default: stub, transform: stub, reload: stub },
  generate: { text: stub },
  permission: { list: stub, get: stub, reply: stub, hook: stub, assert: stub },
  plugin: { list: stub },
  provider: { list: stub, get: stub, transform: stub, reload: stub },
  reference: { list: stub, transform: stub, reload: stub },
  rpc: Object.assign(
    (): never => {
      throw new Error("test double: not implemented");
    },
    { register: stub },
  ),
  session: {
    list: stub,
    create: stub,
    get: stub,
    remove: stub,
    switchAgent: stub,
    switchModel: stub,
    prompt: async (input) => {
      prompts.push(input);
      return {
        id: "msg_test",
        sessionID: input.sessionID,
        time: { created: 0 },
        type: "user",
        payload: { text: input.text },
        delivery: "steer",
      };
    },
    generate: stub,
    command: stub,
    compact: stub,
    synthetic: stub,
    interrupt: stub,
    update: stub,
    move: stub,
    context: stub,
    wait: stub,
    instructions: { entry: { list: stub, put: stub, remove: stub } },
    hook: stub,
  } satisfies SessionDomain,
  shell: { hook: stub },
  skill: {
    list: stub,
    transform: async (fn) => {
      fn(skillEditor);
      return registration;
    },
    reload: stub,
  } satisfies SkillDomain,
  storage: { get: stub, set: stub, remove: stub, scan: stub },
  tool: { list: stub, hook: stub, transform: stub, reload: stub },
  vcs: {
    get: stub,
    base: stub,
    status: stub,
    branch: { list: stub },
    diff: stub,
    transform: stub,
    reload: stub,
  },
  websearch: { providers: stub, query: stub, transform: stub, reload: stub },
  worktree: {
    list: stub,
    create: stub,
    remove: stub,
    refresh: stub,
    transform: stub,
    reload: stub,
  },
};
await plugin.setup(ctx);

const rows = (agent: string): [string, string, string][] => {
  const a = agents.get(agent);
  if (!a) throw new Error(`agent not registered: ${agent}`);
  return a.permissions.map((r): [string, string, string] => [r.action, r.resource, r.effect]);
};
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
    const denyAfterRead: [string, string, string][] = [
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
    ];
    for (const id of [...agents.keys()].filter((k) => k !== "egm")) {
      const p = rows(id);
      expect(p[0]).toEqual(["*", "*", "deny"]);
      for (const row of denyAfterRead) {
        expect(indexOf(id, row)).toBeGreaterThan(indexOf(id, ["read", "*", "allow"]));
      }
      expect(indexOf(id, ["read", "*.env.example", "allow"])).toBeGreaterThan(
        indexOf(id, ["read", "**/*.env.*", "deny"]),
      );
    }
  });
  test("primary grep of .env asks instead of bypassing the read ask", () => {
    const present: [string, string, string][] = [
      ["grep", "*", "allow"],
      ["grep", "*.env", "ask"],
      ["grep", "*.env.*", "ask"],
      ["grep", "**/*.env", "ask"],
      ["grep", "**/*.env.*", "ask"],
      ["read", "mcp:*", "deny"],
    ];
    const p = rows("egm");
    expect(p[0]).toEqual(["*", "*", "ask"]);
    for (const row of present) {
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
    expect(skills.map((s) => `${s.name}`).sort()).toEqual([
      "egm-bootstrap",
      "egm-brainstorm",
      "egm-draft",
      "egm-drift-report",
      "egm-resolve",
      "egm-review",
      "egm-review-loop",
    ]);
    expect((skills[0]?.content ?? "").length).toBeGreaterThan(100);
    expect(commands).toHaveLength(7);
  });
  test("skill descriptions survive YAML folded scalars", () => {
    for (const s of skills) {
      expect(s.description?.length ?? 0).toBeGreaterThan(10);
      expect(s.description).not.toBe(">-");
    }
    expect(skills.find((s) => s.name === "egm-brainstorm")?.description).toStartWith(
      "Interactive ideation and brainstorming",
    );
  });
  test("commands prompt the session with a flat sessionID and text", async () => {
    const cmd = commands.find((c) => c.name === "egm-brainstorm");
    if (!cmd) throw new Error("command not registered: egm-brainstorm");
    await cmd.execute({
      sessionID: Session.ID.make("ses_1"),
      prompt: PromptInput.Prompt.make({
        text: "/egm-brainstorm /tmp/x.md",
        files: [{ uri: "/tmp/x.md" }],
      }),
      delivery: "steer",
    });
    const sent = prompts[0];
    expect(sent?.sessionID).toBe("ses_1");
    expect(Object.keys(sent ?? {})).not.toContain("prompt");
    expect(sent?.text).toContain("Read and execute");
    expect(sent?.text).toContain("/egm-brainstorm /tmp/x.md");
    expect(sent?.files).toEqual([{ uri: "/tmp/x.md" }]);
    await cmd.execute({
      sessionID: Session.ID.make("ses_2"),
      prompt: PromptInput.Prompt.make({ text: "$(rm -rf /tmp)" }),
      delivery: "steer",
    });
    const refused = prompts[1];
    expect(refused?.text).toContain("was not run");
    expect(refused?.text).toContain("may already have expanded them");
    expect(refused?.text).not.toContain("Read and execute");
  });
});
