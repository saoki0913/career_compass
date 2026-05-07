import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SettingsPageSkeleton", () => {
  it("renders 5 notification toggle rows matching actual settings page", async () => {
    const source = await readFile(
      new URL("./SettingsPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("length: 5");
    // Switch toggle approximation
    expect(source).toContain("h-6 w-11");
  });

  it("uses max-w-3xl layout matching settings page", async () => {
    const source = await readFile(
      new URL("./SettingsPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("max-w-3xl");
  });
});
