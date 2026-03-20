import { describe, expect, it } from "vitest";
import { submissionCreateSchema, submissionUpdateSchema } from "./validation";

describe("submission schemas", () => {
  it("accepts valid creation payloads", () => {
    const result = submissionCreateSchema.safeParse({
      type: "portfolio",
      name: "提出ポートフォリオ",
      isRequired: true,
      notes: "作品集の最新版",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsafe file urls on update", () => {
    const result = submissionUpdateSchema.safeParse({
      fileUrl: "javascript:alert(1)",
    });

    expect(result.success).toBe(false);
  });
});
