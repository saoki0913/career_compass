import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("EventDetailModal", () => {
  it("does not render inline deleteError banner (reportUserFacingError handles snackbar)", async () => {
    const source = await readFile(new URL("./EventDetailModal.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("deleteError");
    expect(source).not.toContain("bg-red-50 border border-red-200");
  });
});
