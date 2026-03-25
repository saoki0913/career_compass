import { describe, expect, it } from "vitest";

import { buildSafeLikePattern, sanitizeSearchInput } from "@/lib/search/utils";

describe("search utils", () => {
  it("removes control characters and normalizes whitespace", () => {
    expect(sanitizeSearchInput("  A\u0000B\tC\nD  ")).toBe("A B C D");
  });

  it("escapes SQL LIKE metacharacters after sanitizing", () => {
    expect(buildSafeLikePattern("%admin_user%")).toBe("%\\%admin\\_user\\%%");
  });
});
