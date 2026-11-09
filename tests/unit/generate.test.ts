import { describe, expect, test } from "bun:test";
import { ADAPTER_NAME, plannedOutputs } from "../../src/generate.ts";
import { sha256Hex } from "../../src/manifest.ts";

describe("scaffold", () => {
  test("adapter name", () => {
    expect(ADAPTER_NAME).toBe("opencode-plugin-egm");
  });

  test("planned outputs include the manifest and the config", () => {
    const paths = plannedOutputs().map((o) => o.path);
    expect(paths).toContain("opencode.json");
    expect(paths).toContain("installation.json");
  });

  test("sha256Hex matches the known empty-input digest", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
