import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STREAM_FEATURE_CONFIGS } from "@/lib/fastapi/stream-config";
import { streamBillingPolicySchema } from "./billing";

type ContractFixtures = {
  billingPolicies: unknown[];
};

function readFixtures(): ContractFixtures {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/bff-fastapi-contract-fixtures.json");
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ContractFixtures;
}

describe("FastAPI stream billing policy contract", () => {
  it("parses the three supported billing lifecycle policies", () => {
    const { billingPolicies } = readFixtures();

    expect(billingPolicies.map((policy) => streamBillingPolicySchema.parse(policy))).toEqual([
      { kind: "post_success", creditsPerSuccess: 1 },
      { kind: "three_phase", reserveBeforeStream: true },
      { kind: "free" },
    ]);
  });

  it("rejects post_success policies with zero credits", () => {
    expect(() =>
      streamBillingPolicySchema.parse({ kind: "post_success", creditsPerSuccess: 0 }),
    ).toThrow();
  });

  it("parses existing stream feature billing configs", () => {
    expect(
      Object.values(STREAM_FEATURE_CONFIGS).map((config) =>
        streamBillingPolicySchema.parse(config.billingPolicy),
      ),
    ).toEqual([
      { kind: "post_success", creditsPerSuccess: 1 },
      { kind: "post_success", creditsPerSuccess: 1 },
      { kind: "free" },
      { kind: "three_phase", reserveBeforeStream: true },
    ]);
  });
});
