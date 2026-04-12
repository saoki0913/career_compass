import { describe, expect, it } from "vitest";

import { resolveRoleSelection } from "./role-selection";

describe("resolveRoleSelection", () => {
  it("treats user_free_text as custom input", () => {
    expect(
      resolveRoleSelection({
        resolvedRole: "総合職",
        resolvedSource: "user_free_text",
        availableOptions: [],
      }),
    ).toEqual({
      selectedRoleName: "総合職",
      roleSelectionSource: "custom",
      customRoleInput: "総合職",
    });
  });

  it("prefers matched role option source when available", () => {
    expect(
      resolveRoleSelection({
        resolvedRole: "バックエンドエンジニア",
        resolvedSource: null,
        availableOptions: [{ value: "バックエンドエンジニア", source: "company_doc" }],
      }),
    ).toEqual({
      selectedRoleName: "バックエンドエンジニア",
      roleSelectionSource: "company_doc",
      customRoleInput: "",
    });
  });

  it("falls back to custom when no option matches but a role exists", () => {
    expect(
      resolveRoleSelection({
        resolvedRole: "研究職",
        resolvedSource: null,
        availableOptions: [{ value: "総合職", source: "company_doc" }],
      }),
    ).toEqual({
      selectedRoleName: "研究職",
      roleSelectionSource: "custom",
      customRoleInput: "研究職",
    });
  });
});
