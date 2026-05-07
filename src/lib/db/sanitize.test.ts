import { describe, expect, it } from "vitest";

import { stripCompanyCredentials } from "@/lib/db/sanitize";

describe("stripCompanyCredentials", () => {
  it("removes normal credential fields and exposes only hasCredentials", () => {
    const result = stripCompanyCredentials({
      id: "company-1",
      name: "Example",
      mypageLoginId: "student@example.com",
      mypagePassword: "encrypted",
    });

    expect(result).toEqual({
      id: "company-1",
      name: "Example",
      hasCredentials: true,
    });
    expect("mypageLoginId" in result).toBe(false);
    expect("mypagePassword" in result).toBe(false);
  });
});
