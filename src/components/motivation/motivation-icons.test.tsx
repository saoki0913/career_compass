import { describe, it, expect } from "vitest";
import { LoadingSpinner, ResetIcon } from "./motivation-icons";

describe("motivation-icons", () => {
  it("exports LoadingSpinner", () => {
    expect(LoadingSpinner).toBeDefined();
  });

  it("exports ResetIcon", () => {
    expect(ResetIcon).toBeDefined();
  });
});
