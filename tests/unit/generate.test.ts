import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateInstall, validateDestination } from "../../src/generate.ts";
import { verifyManifest } from "../../src/manifest.ts";

const EGM_ROOT = join(import.meta.dir, "..", "..", "vendor", "egm");
const created: string[] = [];

async function freshDest(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "egm-install-"));
  await rm(dir, { recursive: true, force: true });
  created.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of created) await rm(dir, { recursive: true, force: true });
});

describe("validateDestination", () => {
  test("rejects existing paths, glob characters, and .env. paths", async () => {
    await expect(validateDestination("/tmp", EGM_ROOT)).rejects.toThrow(
      /already exists|symbolic link/,
    );
    await expect(validateDestination("/tmp/egm[bad]", EGM_ROOT)).rejects.toThrow(/glob characters/);
    await expect(validateDestination("/tmp/x.env.y/egm", EGM_ROOT)).rejects.toThrow(/\.env/);
    await expect(validateDestination(join(EGM_ROOT, "inside"), EGM_ROOT)).rejects.toThrow(
      /source tree/,
    );
  });
});

describe("generateInstall", () => {
  test("produces bundle, config, launcher, and a verifiable manifest", async () => {
    const dest = await freshDest();
    const result = await generateInstall({ egmRoot: EGM_ROOT, dest, adapterVersion: "test" });
    expect(existsSync(join(dest, "bundle", "skills", "egm-review", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "skills", "egm-review", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "egm-opencode.sh"))).toBe(true);
    expect(existsSync(join(dest, "check.ts"))).toBe(true);

    const config = JSON.parse(await readFile(join(dest, "opencode.json"), "utf8"));
    expect(config.default_agent).toBe("egm");
    expect(Object.keys(config.agents)).toHaveLength(9);
    expect(Object.keys(config.commands)).toHaveLength(7);
    expect(result.reviewerIds).toHaveLength(8);
    expect(result.skillNames).toHaveLength(7);

    const { ok, mismatches } = await verifyManifest(dest, result.manifest);
    expect(mismatches).toEqual([]);
    expect(ok).toBe(true);
    expect(result.manifest.sha256["opencode.json"]).toBeDefined();
  });

  test("rejects dangling-symlink destinations and symlinked parents", async () => {
    const base = await mkdtemp(join(tmpdir(), "egm-link-"));
    created.push(base);
    const dangling = join(base, "dangling");
    await symlink(join(base, "nowhere"), dangling);
    await expect(validateDestination(dangling, EGM_ROOT)).rejects.toThrow(/symbolic link/);
    const realDir = join(base, "real");
    await mkdir(realDir);
    const linkDir = join(base, "linkdir");
    await symlink(realDir, linkDir, "dir");
    await expect(validateDestination(join(linkDir, "install"), EGM_ROOT)).rejects.toThrow(
      /symbolic link/,
    );
  });

  test("refuses to install twice into the same destination", async () => {
    const dest = await freshDest();
    await generateInstall({ egmRoot: EGM_ROOT, dest, adapterVersion: "test" });
    await expect(
      generateInstall({ egmRoot: EGM_ROOT, dest, adapterVersion: "test" }),
    ).rejects.toThrow(/already exists/);
  });

  test("bundle contents are reproducible across destinations", async () => {
    const a = await generateInstall({
      egmRoot: EGM_ROOT,
      dest: await freshDest(),
      adapterVersion: "t",
    });
    const b = await generateInstall({
      egmRoot: EGM_ROOT,
      dest: await freshDest(),
      adapterVersion: "t",
    });
    const bundleHash = (m: typeof a.manifest) =>
      Object.entries(m.sha256).filter(([k]) => k.startsWith("bundle/"));
    expect(bundleHash(a.manifest)).toEqual(bundleHash(b.manifest));
  });
});
