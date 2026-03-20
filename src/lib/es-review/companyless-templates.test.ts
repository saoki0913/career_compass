import { describe, expect, it } from "vitest";
import {
  COMPANYLESS_EXPLICIT_TEMPLATE_TYPES,
  isCompanylessExplicitTemplateType,
  resolveEffectiveTemplateTypeWithoutCompany,
} from "./companyless-templates";

describe("companyless-templates", () => {
  it("lists three explicit types", () => {
    expect(COMPANYLESS_EXPLICIT_TEMPLATE_TYPES).toEqual(["gakuchika", "self_pr", "work_values"]);
  });

  it("rejects non-companyless explicit", () => {
    expect(isCompanylessExplicitTemplateType("company_motivation")).toBe(false);
    expect(isCompanylessExplicitTemplateType("gakuchika")).toBe(true);
  });

  it("resolves auto: motivation question falls back to basic", () => {
    const r = resolveEffectiveTemplateTypeWithoutCompany(undefined, "当社を志望する理由を教えてください。");
    expect(r).toEqual({ ok: true, effective: "basic" });
  });

  it("resolves auto: gakuchika question", () => {
    const r = resolveEffectiveTemplateTypeWithoutCompany(undefined, "学生時代に力を入れたことは。");
    expect(r).toEqual({ ok: true, effective: "gakuchika" });
  });

  it("rejects tampered explicit template", () => {
    const r = resolveEffectiveTemplateTypeWithoutCompany("post_join_goals", "");
    expect(r).toEqual({ ok: false });
  });
});
