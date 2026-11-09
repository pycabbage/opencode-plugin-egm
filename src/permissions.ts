type Row = [string, string, string];
const rules = (rows: Row[]) =>
  rows.map(([action, resource, effect]) => ({ action, resource, effect }));

export const reviewerPermissions = (bundle: string) =>
  rules([
    ["*", "*", "deny"],
    ["read", "*", "allow"],
    ["read", "*.env", "deny"],
    ["read", "*.env.*", "deny"],
    ["read", "*.env.example", "allow"],
    ["read", "AGENTS.md", "deny"],
    ["read", "*/AGENTS.md", "deny"],
    ["read", "CLAUDE.md", "deny"],
    ["read", "*/CLAUDE.md", "deny"],
    ["glob", "*", "allow"],
    ["grep", "*", "deny"],
    ["external_directory", "*", "deny"],
    ["external_directory", `${bundle}/**`, "allow"],
  ]);

export const primaryPermissions = (bundle: string, reviewers: string[]) =>
  rules([
    ["*", "*", "ask"],
    ["write", "*", "allow"],
    ["edit", "*", "allow"],
    ["shell", "*", "allow"],
    ["read", "*", "allow"],
    ["read", "*.env", "ask"],
    ["read", "*.env.*", "ask"],
    ["read", "*.env.example", "allow"],
    ["glob", "*", "allow"],
    ["grep", "*", "allow"],
    ["skill", "*", "deny"],
    ["skill", "egm-*", "allow"],
    ["subagent", "*", "deny"],
    ...reviewers.map((id): Row => ["subagent", id, "allow"]),
    ["external_directory", "*", "ask"],
    ["external_directory", `${bundle}/**`, "allow"],
  ]);
