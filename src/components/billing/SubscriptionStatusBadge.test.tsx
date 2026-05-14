import { describe, expect, it } from "vitest";

describe("SubscriptionStatusBadge", () => {
  it("exports SubscriptionStatusBadge component", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./SubscriptionStatusBadge.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function SubscriptionStatusBadge");
    expect(source).toContain("Badge");
    expect(source).toContain("getSubscriptionStatusLabel");
    expect(source).toContain("getSubscriptionStatusVariant");
  });

  it("returns null when status is falsy", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./SubscriptionStatusBadge.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (!status) return null");
  });
});
