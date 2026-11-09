/**
 * Permission rulesets for OpenCode v2 agents.
 *
 * Design: docs/design/opencode-v2-adapter-design.md (section 6.4) and
 * docs/design/phase0-results.md (D2). A ruleset is an ordered list of
 * { action, resource, effect }; the last matching rule wins. Host
 * defaults are prepended by OpenCode and the agent's rules are appended
 * after them, so an agent ruleset that starts with a wildcard deny and
 * then opens specific holes produces the intended effective policy.
 */

export type Effect = "allow" | "deny" | "ask";

export interface PermissionRule {
  action: string;
  resource: string;
  effect: Effect;
}

function rule(action: string, resource: string, effect: Effect): PermissionRule {
  return { action, resource, effect };
}

/** Read-only reviewer (Goldfish) ruleset. `bundleRoot` is an absolute path. */
export function reviewerPermissions(bundleRoot: string): PermissionRule[] {
  return [
    rule("*", "*", "deny"),
    rule("read", "*", "allow"),
    rule("read", "*.env", "deny"),
    rule("read", "*.env.*", "deny"),
    rule("read", "*.env.example", "allow"),
    rule("glob", "*", "allow"),
    // grep is denied: content search can bypass per-file read rules.
    rule("grep", "*", "deny"),
    // The bundle lives outside the user's project, so it needs an explicit
    // external-directory exception; everything else external stays denied.
    rule("external_directory", "*", "deny"),
    rule("external_directory", `${bundleRoot}/**`, "allow"),
  ];
}

/** Primary `egm` orchestrator ruleset. */
export function primaryPermissions(bundleRoot: string, reviewerIds: string[]): PermissionRule[] {
  return [
    rule("*", "*", "ask"),
    rule("read", "*", "allow"),
    rule("read", "*.env", "ask"),
    rule("read", "*.env.*", "ask"),
    rule("read", "*.env.example", "allow"),
    rule("glob", "*", "allow"),
    rule("grep", "*", "allow"),
    rule("skill", "*", "deny"),
    rule("skill", "egm-*", "allow"),
    rule("subagent", "*", "deny"),
    ...reviewerIds.map((id) => rule("subagent", id, "allow")),
    rule("external_directory", "*", "ask"),
    rule("external_directory", `${bundleRoot}/**`, "allow"),
  ];
}

/** Convert a glob (`*`, `**`) to a RegExp anchored at both ends. */
export function globToRegExp(glob: string): RegExp {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += ".*";
      }
    } else if ("+?^${}()|[]\\".includes(c)) {
      out += `\\${c}`;
    } else if (c === ".") {
      out += "\\.";
    } else {
      out += c;
    }
  }
  return new RegExp(`${out}$`);
}

/**
 * Evaluate an effective ruleset the way OpenCode does: the last rule
 * whose action and resource patterns both match wins. A resource
 * pattern also matches when it matches the resource's basename, which
 * mirrors how "*.env" style patterns behave for nested paths.
 * Returns undefined when no rule matches.
 */
export function evaluatePermissions(
  rules: PermissionRule[],
  action: string,
  resource: string,
): Effect | undefined {
  let result: Effect | undefined;
  const basename = resource.split("/").at(-1) ?? resource;
  for (const r of rules) {
    if (!globToRegExp(r.action).test(action)) continue;
    const pattern = globToRegExp(r.resource);
    if (pattern.test(resource) || pattern.test(basename)) {
      result = r.effect;
    }
  }
  return result;
}
