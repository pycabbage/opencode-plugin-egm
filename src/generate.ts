/**
 * Bundle and config generator for the OpenCode v2 EGM adapter.
 *
 * Design: docs/design/opencode-v2-adapter-design.md (section 6.3).
 * Implementation lands in Phase 1, after the Phase 0 spike (D1-D7)
 * fixes the generated config format.
 */
export const ADAPTER_NAME = "opencode-plugin-egm";

export interface PlannedOutput {
  /** Path relative to the installation destination. */
  path: string;
  /** What this output is, in one line. */
  purpose: string;
}

/** Outputs the generator will produce. Stub: returns the planned set. */
export function plannedOutputs(): PlannedOutput[] {
  return [
    { path: "bundle/", purpose: "Canonical EGM trees (skills, agents, resources, docs)" },
    { path: "skills/", purpose: "Aliases to the canonical skill directories" },
    { path: "opencode.json", purpose: "Generated OpenCode v2 configuration" },
    { path: "installation.json", purpose: "Install manifest with SHA-256 hashes" },
  ];
}
