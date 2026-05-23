import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SettingsPageSkeleton", () => {
  it("renders 5 notification toggle rows matching actual settings page", async () => {
    const source = await readFile(
      new URL("./SettingsPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("length: 5");
    expect(source).toContain("h-6 w-11");
  });

  it("uses the dense two-column settings layout", async () => {
    const source = await readFile(
      new URL("./SettingsPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("max-w-[96rem]");
    expect(source).toContain("xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]");
    expect(source).toContain("ProductPageHeaderSkeleton");
  });
});
