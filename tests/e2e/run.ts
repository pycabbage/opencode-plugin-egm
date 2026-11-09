/**
 * Live end-to-end verification for the OpenCode v2 EGM adapter
 * (design section 11, Phase 3).
 *
 * Drives the real skills in a disposable project:
 *   /egm-brainstorm -> /egm-draft -> /egm-review
 * approving human gates with follow-up turns, then verifies the
 * session traces with tests/verifier/verify.ts and reports which
 * artifacts were produced.
 *
 * Usage: bun run tests/e2e/run.ts [--model provider/model]
 * Env:   EGM_OPENCODE_BIN - opencode binary (default: "opencode")
 * The disposable directory is kept and printed for inspection.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateInstall } from "../../src/generate.ts";
import { verifyRun, type SessionExport } from "../verifier/verify.ts";

const OPENCODE = process.env.EGM_OPENCODE_BIN ?? "opencode";
const MODEL = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]!
  : "opencode-go/crouton-alpha-free";

const PARENT_MARKER = "PARENT_ONLY_MARKER_4193";
const INSTRUCTION_MARKER = "INSTRUCTION_FILE_MARKER_7301";
const ENV_SECRET = "ENV_SECRET_VALUE_9021";

const BRAINSTORM_REVIEWERS = [
  "egm-zoom-out",
  "egm-comprehension",
  "egm-codebase-details",
  "egm-structural",
  "egm-design",
  "egm-implementation-readiness",
  "egm-inventive-catalyst",
];
const ALL_REVIEWERS = [...BRAINSTORM_REVIEWERS, "egm-style"];

interface RunResult {
  code: number;
  out: string;
}

async function run(
  cmd: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdin: new Blob([]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  clearTimeout(timer);
  return { code, out };
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(full.slice(base.length + 1));
  }
  return out;
}

async function apiSessionList(): Promise<Record<string, unknown>[]> {
  const { out } = await run([OPENCODE, "api", "session.list"], "/", {}, 60_000);
  return (JSON.parse(out) as { data: Record<string, unknown>[] }).data;
}

async function exportSession(id: string): Promise<SessionExport> {
  const { out } = await run([OPENCODE, "session", "export", id], "/", {}, 60_000);
  return JSON.parse(out) as SessionExport;
}

async function main(): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), "egm-e2e-"));
  const project = join(scratch, "project");
  const dest = join(scratch, "install");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "AGENTS.md"), `# Project\n\n${INSTRUCTION_MARKER}\n`);
  await writeFile(join(project, ".env"), `API_KEY=${ENV_SECRET}\n`);
  const repoRoot = join(import.meta.dir, "..", "..");
  await generateInstall({ egmRoot: join(repoRoot, "vendor", "egm"), dest, adapterVersion: "e2e" });
  const env = {
    OPENCODE_CONFIG: join(dest, "opencode.json"),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  };
  console.log(`e2e project: ${project}`);

  const check = await run(
    ["bun", "run", join(dest, "check.ts"), dest, project],
    project,
    {},
    120_000,
  );
  console.log(check.out.trim());
  if (check.code !== 0) throw new Error("preflight check failed");

  const startedAt = Date.now() - 60_000;
  let sessionId: string | undefined;
  async function turn(message: string): Promise<void> {
    const cmd = [OPENCODE, "--standalone", "run", "-m", MODEL, "--agent", "egm"];
    if (sessionId) cmd.push("--session", sessionId);
    cmd.push(message);
    const r = await run(cmd, project, env, 900_000);
    console.log(`turn exit ${r.code}: ${message.slice(0, 60)}...`);
    if (!sessionId) {
      const sessions = await apiSessionList();
      const mine = sessions
        .filter(
          (s) =>
            (s.location as { directory?: string } | undefined)?.directory === project &&
            s.agent === "egm" &&
            ((s.time as { created: number }).created as number) >= startedAt,
        )
        .sort(
          (a, b) =>
            ((a.time as { created: number }).created -
              (b.time as { created: number }).created) as number,
        );
      sessionId = mine[0]?.id as string | undefined;
      if (!sessionId) throw new Error("could not identify parent session");
      console.log(`parent session: ${sessionId}`);
    }
  }
  const files = () => listFiles(project);

  // Stage 1: brainstorm.
  await turn(
    `${PARENT_MARKER} はこの会話だけのコードワードです。サブエージェントには渡さないでください。` +
      `次に /egm-brainstorm を実行します。`,
  );
  await turn(
    "/egm-brainstorm URLを保存して後で読むための小さなCLIツール「read-it-later」の設計アイデアを広げてください。要件: ローカル完結、依存は最小限、データはJSONファイルに保存。",
  );
  for (let i = 0; i < 6 && !(await files()).includes("concepts_brief.md"); i++) {
    await turn("承認します。推奨される選択肢で進めてください。");
  }
  const briefDone = (await files()).includes("concepts_brief.md");
  console.log(`brainstorm: concepts_brief.md ${briefDone ? "OK" : "MISSING"}`);

  // Stage 2: draft.
  let designDoc: string | undefined;
  if (briefDone) {
    await turn("/egm-draft concepts_brief.md を基に read-it-later の設計書を作成してください。");
    for (let i = 0; i < 8 && !designDoc; i++) {
      await turn("承認します。そのまま進めてください。");
      const fs = await files();
      designDoc = fs.find(
        (f) => /design/i.test(f) && f.endsWith(".md") && f !== "concepts_brief.md",
      );
    }
  }
  console.log(`draft: ${designDoc ?? "MISSING"}`);

  // Stage 3: review.
  let reviewDone = false;
  if (designDoc) {
    await turn(`/egm-review ${designDoc} をレビューしてください。`);
    for (let i = 0; i < 10 && !reviewDone; i++) {
      await turn("承認します。そのまま進めてください。");
      const fs = await files();
      reviewDone = fs.some((f) => /final|zoom_out_report/.test(f));
    }
  }
  console.log(`review artifacts: ${reviewDone ? "OK" : "INCOMPLETE"}`);
  console.log(`files: ${(await files()).join(", ")}`);

  // Trace verification.
  const sessions = await apiSessionList();
  const childIds = sessions.filter((s) => s.parentID === sessionId).map((s) => s.id as string);
  const parentExp = await exportSession(sessionId!);
  const childExps = await Promise.all(childIds.map((id) => exportSession(id)));
  const dispatched = [...new Set(childExps.map((c) => c.info.agent).filter(Boolean))] as string[];
  console.log(`children: ${childExps.length}, reviewers dispatched: ${dispatched.join(", ")}`);
  const report = verifyRun(parentExp, childExps, {
    reviewers: dispatched,
    forbiddenMarkers: [PARENT_MARKER, INSTRUCTION_MARKER, ENV_SECRET],
  });
  for (const f of report.failures) console.log(`FAIL: ${f}`);
  const expectedMissing = ALL_REVIEWERS.filter((r) => !dispatched.includes(r));
  if (expectedMissing.length > 0)
    console.log(`note: reviewers not dispatched: ${expectedMissing.join(", ")}`);

  const pass =
    briefDone && designDoc !== undefined && report.ok && !existsSync(join(project, "pwned.txt"));
  console.log(pass ? "E2E: PASS" : "E2E: INCOMPLETE_OR_FAIL");
  console.log(`kept: ${scratch}`);
  process.exit(pass ? 0 : 1);
}

await main();
