/**
 * Install manifest (installation.json) generation and verification.
 *
 * Design: docs/design/opencode-v2-adapter-design.md (sections 6.3, G5).
 * The manifest covers bundled files plus the generated config itself;
 * the manifest file itself is excluded (self-reference). Symlinks are
 * recorded by hashing their target path.
 */
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ManifestEntry {
  path: string;
  sha256: string;
}

export interface InstallManifest {
  name: string;
  version: string;
  adapterVersion: string;
  hostVersion: string;
  status: "experimental";
  sha256: Record<string, string>;
}

/** Hash one file's bytes with SHA-256 and return the hex digest. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function walk(dir: string, base: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, base, out);
    } else {
      out.push(relative(base, full));
    }
  }
}

/** Build the manifest for an install tree rooted at `root`. */
export async function buildManifest(
  root: string,
  meta: { name: string; version: string; adapterVersion: string; hostVersion: string },
): Promise<InstallManifest> {
  const files: string[] = [];
  await walk(root, root, files);
  const sha256: Record<string, string> = {};
  for (const rel of files.sort()) {
    if (rel === "installation.json") continue;
    const full = join(root, rel);
    const st = await lstat(full);
    if (st.isSymbolicLink()) {
      const target = await readlink(full);
      sha256[rel] = await sha256Hex(new TextEncoder().encode(`symlink:${target}`));
    } else {
      sha256[rel] = await sha256Hex(await readFile(full));
    }
  }
  return { ...meta, status: "experimental", sha256 };
}

/** Recompute hashes under `root` and list entries that differ from the manifest. */
export async function verifyManifest(
  root: string,
  manifest: InstallManifest,
): Promise<{ ok: boolean; mismatches: string[] }> {
  const rebuilt = await buildManifest(root, manifest);
  const mismatches: string[] = [];
  const keys = new Set([...Object.keys(manifest.sha256), ...Object.keys(rebuilt.sha256)]);
  for (const key of keys) {
    if (manifest.sha256[key] !== rebuilt.sha256[key]) mismatches.push(key);
  }
  return { ok: mismatches.length === 0, mismatches };
}
