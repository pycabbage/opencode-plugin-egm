import { describe, expect, test } from "bun:test";
import {
  evaluatePermissions,
  primaryPermissions,
  reviewerPermissions,
} from "../../src/permissions.ts";

const BUNDLE = "/opt/egm/bundle";
const REVIEWERS = ["egm-design", "egm-style"];

describe("reviewerPermissions", () => {
  const rules = reviewerPermissions(BUNDLE);
  test("denies writes, shell, delegation, network, grep, skill", () => {
    for (const action of [
      "edit",
      "bash",
      "shell",
      "subagent",
      "webfetch",
      "websearch",
      "grep",
      "skill",
    ]) {
      expect(evaluatePermissions(rules, action, "*")).toBe("deny");
    }
  });
  test("allows reading normal files and glob", () => {
    expect(evaluatePermissions(rules, "read", "/proj/design.md")).toBe("allow");
    expect(evaluatePermissions(rules, "glob", "*")).toBe("allow");
  });
  test("denies .env reads but allows .env.example", () => {
    expect(evaluatePermissions(rules, "read", ".env")).toBe("deny");
    expect(evaluatePermissions(rules, "read", "config/.env.production")).toBe("deny");
    expect(evaluatePermissions(rules, "read", ".env.example")).toBe("allow");
  });
  test("denies reading instruction files as documents", () => {
    expect(evaluatePermissions(rules, "read", "/proj/AGENTS.md")).toBe("deny");
    expect(evaluatePermissions(rules, "read", "CLAUDE.md")).toBe("deny");
  });
  test("external_directory: bundle allowed, other paths denied", () => {
    expect(evaluatePermissions(rules, "external_directory", `${BUNDLE}/agents/style.md`)).toBe(
      "allow",
    );
    expect(evaluatePermissions(rules, "external_directory", "/etc/passwd")).toBe("deny");
  });
});

describe("primaryPermissions", () => {
  const rules = primaryPermissions(BUNDLE, REVIEWERS);
  test("may write artifacts and run shell steps", () => {
    expect(evaluatePermissions(rules, "write", "/proj/concepts_brief.md")).toBe("allow");
    expect(evaluatePermissions(rules, "edit", "/proj/design.md")).toBe("allow");
    expect(evaluatePermissions(rules, "shell", "*")).toBe("allow");
  });
  test("may dispatch only to registered reviewers", () => {
    expect(evaluatePermissions(rules, "subagent", "egm-design")).toBe("allow");
    expect(evaluatePermissions(rules, "subagent", "general")).toBe("deny");
    expect(evaluatePermissions(rules, "subagent", "explore")).toBe("deny");
  });
  test("skills limited to egm-*", () => {
    expect(evaluatePermissions(rules, "skill", "egm-review")).toBe("allow");
    expect(evaluatePermissions(rules, "skill", "something-else")).toBe("deny");
  });
});
