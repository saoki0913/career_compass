import { describe, expect, it } from "vitest";
import { inferTemplateTypeFromQuestion } from "./infer-template-type";

describe("inferTemplateTypeFromQuestion", () => {
  it("infers gakuchika", () => {
    expect(inferTemplateTypeFromQuestion("学生時代に力を入れたことは何ですか。")).toBe("gakuchika");
  });

  it("infers company motivation", () => {
    expect(inferTemplateTypeFromQuestion("当社を志望する理由を教えてください。")).toBe("company_motivation");
  });

  it("defaults to basic for generic titles", () => {
    expect(inferTemplateTypeFromQuestion("自由記述")).toBe("basic");
  });
});
