import { describe, expect, test } from "bun:test";
import { verifyRun, type SessionExport } from "../verifier/verify.ts";

function parent(markers: string[] = []): SessionExport {
  return {
    info: { id: "ses_parent", agent: "egm" },
    messages: [
      { type: "user", text: `parent conversation ${markers.join(" ")}` },
      {
        type: "assistant",
        content: [
          {
            type: "tool",
            name: "subagent",
            state: {
              status: "completed",
              input: { agent: "egm-design", prompt: "review /p/target.md" },
            },
          },
        ],
      },
    ],
  };
}

function child(extra: SessionExport["messages"] = []): SessionExport {
  return {
    info: { id: "ses_child", agent: "egm-design", parentID: "ses_parent" },
    messages: [
      { type: "user", text: "review /p/target.md" },
      {
        type: "assistant",
        content: [
          {
            type: "tool",
            name: "read",
            state: {
              status: "completed",
              input: { path: "/p/target.md" },
              content: [{ type: "text", text: "body" }],
            },
          },
          { type: "text", text: "findings" },
        ],
      },
      ...extra,
    ],
  };
}

const base = { reviewers: ["egm-design"], target: "/p/target.md", forbiddenMarkers: ["SECRET_X"] };

describe("verifyRun", () => {
  test("passes a clean dispatch", () => {
    const r = verifyRun(parent(["SECRET_X"]), [child()], base);
    expect(r.ok).toBe(true);
  });

  test("fails when the marker leaked into the child", () => {
    const leaky = child([
      { type: "assistant", content: [{ type: "text", text: "I saw SECRET_X" }] },
    ]);
    const r = verifyRun(parent(["SECRET_X"]), [leaky], base);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain("forbidden marker");
  });

  test("fails when the child never read the target", () => {
    const noRead: SessionExport = { info: child().info, messages: [{ type: "user", text: "hi" }] };
    const r = verifyRun(parent(), [noRead], base);
    expect(r.ok).toBe(false);
  });

  test("fails when the child used a write tool", () => {
    const writer = child([
      {
        type: "assistant",
        content: [
          { type: "tool", name: "edit", state: { status: "completed", input: { path: "/p/x" } } },
        ],
      },
    ]);
    const r = verifyRun(parent(), [writer], base);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain("unexpected tool");
  });

  test("fails when the reviewer was never dispatched", () => {
    const r = verifyRun(parent(), [], base);
    expect(r.ok).toBe(false);
  });
});
