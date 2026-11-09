/**
 * Install manifest (installation.json) generation and verification.
 *
 * Design: docs/design/opencode-v2-adapter-design.md (sections 6.3, G5).
 * The manifest covers bundled files plus the generated config itself;
 * the manifest file itself is excluded (self-reference).
 */
export interface ManifestEntry {
  path: string;
  sha256: string;
}

/** Hash one file's bytes with SHA-256 and return the hex digest. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
