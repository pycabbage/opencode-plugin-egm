/**
 * Trace verifier for EGM runs on OpenCode v2 (design section 7.4).
 *
 * Compares a parent session export with its child (reviewer) exports
 * and checks the evidence the support claim rests on:
 *   - every expected reviewer was dispatched as a fresh child session
 *     (parentID matches, a completed `subagent` call exists in the parent)
 *   - each child actually read the review target (completed `read` call)
 *   - children used no write/shell tools
 *   - forbidden markers (parent-only secrets, instruction-file markers,
 *     .env contents) appear nowhere in any child export
 *
 * Works purely on exported JSON, so it can verify any run after the fact.
 */

export interface ToolPart {
  type: "tool";
  name: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    content?: { type: string; text?: string }[];
  };
}

export interface SessionExport {
  info: {
    id: string;
    agent?: string;
    parentID?: string;
    outcome?: string;
    time?: { created?: number };
  };
  messages: {
    type: string;
    text?: string;
    agent?: string;
    content?: ({ type: string; text?: string } | ToolPart)[];
  }[];
}

export interface VerifyExpectations {
  /** Reviewer agent ids that must each have at least one child session. */
  reviewers: string[];
  /** Absolute path of the review target each child must have read. */
  target?: string;
  /** Strings that must not appear anywhere in child exports. */
  forbiddenMarkers: string[];
}

export interface VerifyReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

function allText(exp: SessionExport): string {
  return JSON.stringify(exp);
}

function toolParts(exp: SessionExport): ToolPart[] {
  const out: ToolPart[] = [];
  for (const m of exp.messages) {
    for (const part of m.content ?? []) {
      if (part.type === "tool") out.push(part as ToolPart);
    }
  }
  return out;
}

export function verifyRun(
  parent: SessionExport,
  children: SessionExport[],
  expectations: VerifyExpectations,
): VerifyReport {
  const failures: string[] = [];
  const notes: string[] = [];
  const parentTools = toolParts(parent);

  for (const reviewer of expectations.reviewers) {
    const kids = children.filter((c) => c.info.agent === reviewer);
    if (kids.length === 0) {
      failures.push(`reviewer ${reviewer}: no child session found`);
      continue;
    }
    const dispatches = parentTools.filter(
      (t) =>
        t.name === "subagent" &&
        t.state?.input?.agent === reviewer &&
        t.state?.status === "completed",
    );
    if (dispatches.length < kids.length) {
      failures.push(
        `reviewer ${reviewer}: ${kids.length} child session(s) but only ${dispatches.length} completed dispatch(es) in parent`,
      );
    }
    for (const kid of kids) {
      if (kid.info.parentID !== parent.info.id) {
        failures.push(`reviewer ${reviewer}: child ${kid.info.id} parentID does not match parent`);
      }
      const tools = toolParts(kid);
      if (expectations.target) {
        const read = tools.some(
          (t) =>
            t.name === "read" &&
            t.state?.status === "completed" &&
            t.state?.input?.path === expectations.target,
        );
        if (!read)
          failures.push(`reviewer ${reviewer}: child ${kid.info.id} did not read the target`);
      }
      for (const t of tools) {
        if (!["read", "glob"].includes(t.name)) {
          failures.push(
            `reviewer ${reviewer}: child ${kid.info.id} used unexpected tool ${t.name}`,
          );
        }
      }
      const blob = allText(kid);
      for (const marker of expectations.forbiddenMarkers) {
        if (marker && blob.includes(marker)) {
          failures.push(
            `reviewer ${reviewer}: forbidden marker found in child ${kid.info.id}: ${marker}`,
          );
        }
      }
    }
    notes.push(`reviewer ${reviewer}: ${kids.length} child session(s) verified`);
  }
  return { ok: failures.length === 0, failures, notes };
}

// CLI: verify.ts <parent.json> <child.json...> --target <path> --reviewers a,b --markers m1,m2
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) opts[a.slice(2)] = argv[++i] ?? "";
    else files.push(a);
  }
  if (files.length < 1) {
    console.error(
      "usage: verify.ts <parent.json> [child.json...] --target <path> --reviewers a,b --markers m1,m2",
    );
    process.exit(2);
  }
  const [parent, ...children] = (await Promise.all(
    files.map(async (f) => JSON.parse(await Bun.file(f).text()) as SessionExport),
  )) as [SessionExport, ...SessionExport[]];
  const report = verifyRun(parent, children, {
    reviewers: (opts.reviewers ?? "").split(",").filter(Boolean),
    target: opts.target,
    forbiddenMarkers: (opts.markers ?? "").split(",").filter(Boolean),
  });
  for (const n of report.notes) console.log(`ok: ${n}`);
  for (const f of report.failures) console.error(`FAIL: ${f}`);
  console.log(report.ok ? "VERIFY: PASS" : "VERIFY: FAIL");
  process.exit(report.ok ? 0 : 1);
}
