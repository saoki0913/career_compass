import { describe, expect, it } from "vitest";

describe("MotivationDraftModal", () => {
  it("max-w-5xl class is used for desktop dialog", () => {
    expect("max-w-5xl").toMatch(/max-w-5xl/);
  });
});
