/**
 * CLI for the OpenCode v2 EGM adapter.
 *
 *   bun run src/cli.ts install <dest> [--egm <vendor-path>]
 *   bun run src/cli.ts check <dest> [project-cwd]
 *   bun run src/cli.ts verify-manifest <dest>
 *
 * Design: docs/design/opencode-v2-adapter-design.md.
 */
import { join, resolve } from "node:path";
import { generateInstall } from "./generate.ts";
import { verifyManifest, type InstallManifest } from "./manifest.ts";
import { readFile } from "node:fs/promises";

const ADAPTER_VERSION = "0.1.0";

function defaultEgmRoot(): string {
  return join(new URL("..", import.meta.url).pathname, "vendor", "egm");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "install") {
    const dest = args.find((a) => !a.startsWith("--"));
    if (!dest) throw new Error("usage: cli.ts install <dest>");
    const egmFlag = args.indexOf("--egm");
    const egmRoot = egmFlag >= 0 ? resolve(args[egmFlag + 1]!) : defaultEgmRoot();
    const result = await generateInstall({
      egmRoot,
      dest: resolve(dest),
      adapterVersion: ADAPTER_VERSION,
    });
    console.log(`Installed EGM adapter to ${result.dest}`);
    console.log(`  config:   ${result.configPath}`);
    console.log(`  bundle:   ${result.bundleRoot}`);
    console.log(`  agents:   egm + ${result.reviewerIds.length} reviewers`);
    console.log(`  skills:   ${result.skillNames.length} (${result.skillNames.join(", ")})`);
    console.log(`  launcher: ${join(result.dest, "egm-opencode.sh")}`);
    return;
  }
  if (command === "verify-manifest") {
    const dest = args[0];
    if (!dest) throw new Error("usage: cli.ts verify-manifest <dest>");
    const manifest = JSON.parse(
      await readFile(join(resolve(dest), "installation.json"), "utf8"),
    ) as InstallManifest;
    const { ok, mismatches } = await verifyManifest(resolve(dest), manifest);
    if (!ok) {
      console.error(`Manifest verification FAILED: ${mismatches.join(", ")}`);
      process.exit(1);
    }
    console.log(`Manifest verified: ${Object.keys(manifest.sha256).length} files.`);
    return;
  }
  if (command === "check") {
    // Delegate to check.ts so the same code path serves installed copies.
    const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "check.ts"), ...args], {
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exit(await proc.exited);
  }
  console.error("usage: cli.ts <install|check|verify-manifest> ...");
  process.exit(2);
}

await main();
