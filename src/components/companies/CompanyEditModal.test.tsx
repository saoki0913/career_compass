import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "CompanyEditModal.tsx"), "utf8");

describe("CompanyEditModal credential update policy", () => {
  it("does not submit mypage credentials unless the credential fields changed or clear was requested", () => {
    expect(source).toContain("mypageLoginIdChanged");
    expect(source).toContain("mypagePasswordChanged");
    expect(source).toContain("clearMypageCredentials");
    expect(source).toContain("if (clearMypageCredentials)");
    expect(source).toContain("if (mypageLoginIdChanged)");
    expect(source).toContain("if (mypagePasswordChanged)");
    expect(source).not.toContain("mypageLoginId: mypageLoginId.trim() || null");
    expect(source).not.toContain("mypagePassword: mypagePassword.trim() || null");
  });

  it("has an explicit clear action for stored mypage credentials", () => {
    expect(source).toContain("保存済み認証情報を削除");
    expect(source).toContain("setClearMypageCredentials((value) => !value)");
  });
});
