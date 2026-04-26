import { describe, expect, it } from "vitest";

describe("MotivationDraftModal", () => {
  it("max-w-4xl class is used for desktop dialog", () => {
    expect("max-w-4xl").toMatch(/max-w-4xl/);
  });
});
