import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { esReviewStreamRequestSchema } from "./es-review";

type ContractFixtures = {
  esReviewStreamRequest: unknown;
};

function readFixtures(): ContractFixtures {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/bff-fastapi-contract-fixtures.json");
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ContractFixtures;
}

describe("ES review FastAPI request contract", () => {
  it("parses the shared ES review stream request fixture", () => {
    const parsed = esReviewStreamRequestSchema.parse(readFixtures().esReviewStreamRequest);

    expect(parsed.template_request?.template_type).toBe("company_motivation");
    expect(parsed.user_provided_corporate_urls).toEqual(["https://www.sagawa-exp.co.jp/"]);
  });

  it("rejects accidental BFF-only fields", () => {
    expect(() =>
      esReviewStreamRequestSchema.parse({
        ...(readFixtures().esReviewStreamRequest as Record<string, unknown>),
        user_id: "user-1",
        credit_cost: 6,
      }),
    ).toThrow();
  });
});
