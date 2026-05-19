import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("NewCompanyPage auth and duplicate handling", () => {
  it("waits for user or guest identity before loading company count", () => {
    expect(source).toContain("canLoadCompanies");
    expect(source).toContain("isReady && (isAuthenticated || isGuest)");
    expect(source).toContain("enabled: canLoadCompanies");
  });

  it("does not decide first-company redirect until count loading has completed", () => {
    expect(source).toContain("hasCompanyCount");
    expect(source).toContain("!companiesLoading");
    expect(source).toContain("hasCompanyCount && count === 0");
    expect(source).toContain("const canSubmit = hasCompanyCount && !isSubmitting");
    expect(source).toContain("disabled={!canSubmit}");
  });

  it("reads duplicate company details from structured API error extra data", () => {
    expect(source).toContain("COMPANY_DUPLICATE");
    expect(source).toContain("error.extra?.existingCompany");
    expect(source).toContain("response.clone().json()");
  });
});
