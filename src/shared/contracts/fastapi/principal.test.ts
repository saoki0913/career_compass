import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { careerPrincipalPayloadSchema } from "./principal";

type ContractFixtures = {
  principals: Record<string, Record<string, unknown>>;
};

function readFixtures(): ContractFixtures {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/bff-fastapi-contract-fixtures.json");
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ContractFixtures;
}

describe("Career principal contract", () => {
  const { principals } = readFixtures();

  it("parses company-scoped user principals", () => {
    const principal = careerPrincipalPayloadSchema.parse(principals.companyUser);

    expect(principal.scope).toBe("company");
    expect(principal.company_id).toBe("company-1");
    expect(principal.actor.kind).toBe("user");
  });

  it("parses ai-stream guest principals without company_id", () => {
    const principal = careerPrincipalPayloadSchema.parse(principals.aiStreamGuest);

    expect(principal.scope).toBe("ai-stream");
    expect(principal.company_id).toBeNull();
    expect(principal.actor.kind).toBe("guest");
  });

  it("rejects company scope without company_id", () => {
    expect(() =>
      careerPrincipalPayloadSchema.parse({
        ...principals.companyUser,
        company_id: null,
      }),
    ).toThrow();
  });
});
