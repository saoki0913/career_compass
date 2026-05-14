import { describe, expect, it } from "vitest";

describe("CompanyLogo", () => {
  it("keeps a session-level failed URL cache before falling back to initials", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./CompanyLogo.tsx", import.meta.url), "utf8");

    expect(source).toContain("failedLogoUrls");
    expect(source).toContain("findNextSourceIndex");
    expect(source).toContain("failedLogoUrls.add(src)");
    expect(source).toContain("company.name.charAt(0)");
  });
});
