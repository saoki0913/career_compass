import { describe, expect, it } from "vitest";

import { resolveGenerationStatus } from "./generation-modal-status";

describe("resolveGenerationStatus", () => {
  it("returns generating when isGenerating, regardless of other flags", () => {
    expect(resolveGenerationStatus({ hasResult: true, canGenerate: true, isGenerating: true })).toBe("generating");
    expect(resolveGenerationStatus({ hasResult: false, canGenerate: false, isGenerating: true })).toBe("generating");
  });

  it("returns done when a result exists and not generating", () => {
    expect(resolveGenerationStatus({ hasResult: true, canGenerate: false, isGenerating: false })).toBe("done");
    expect(resolveGenerationStatus({ hasResult: true, canGenerate: true, isGenerating: false })).toBe("done");
  });

  it("returns ready when generation is allowed and no result yet", () => {
    expect(resolveGenerationStatus({ hasResult: false, canGenerate: true, isGenerating: false })).toBe("ready");
  });

  it("returns locked when generation is not yet allowed and no result", () => {
    expect(resolveGenerationStatus({ hasResult: false, canGenerate: false, isGenerating: false })).toBe("locked");
  });
});
