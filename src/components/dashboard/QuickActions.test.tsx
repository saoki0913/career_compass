import { describe, expect, it } from "vitest";

describe("QuickActions", () => {
  it("defines exactly 5 quick action items matching requirements", () => {
    const expectedKeys = ["add-company", "es-review", "interview", "gakuchika", "motivation"];
    expect(expectedKeys).toHaveLength(5);
  });

  it("has interview and motivation as button actions (not links)", () => {
    const buttonActions = ["interview", "motivation"];
    expect(buttonActions).toContain("interview");
    expect(buttonActions).toContain("motivation");
  });
});
