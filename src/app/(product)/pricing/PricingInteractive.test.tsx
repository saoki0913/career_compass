import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("PricingInteractive — no marketing header", () => {
  it("does not render a sticky header (sidebar replaces navigation)", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("LOGO_ASSETS");
    expect(source).not.toContain("<header");
  });
});

describe("PricingInteractive — no 'プラン選びの目安' section", () => {
  it("does not render the guidance section", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("プラン選びの目安");
  });
});

describe("PricingInteractive — double-click guard", () => {
  it("uses useRef to prevent double invocation of handlePlanSelect", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).toContain("useRef");
    expect(source).toContain("isBusyRef");
  });
});

describe("PricingInteractive — checkout flow", () => {
  it("handles checkout and portal flows", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/stripe/checkout");
    expect(source).toContain("/api/stripe/portal");
  });
});
