import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";

const SECRET = "test-secret-for-career-principal";

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + padding, "base64").toString(
    "utf8",
  );
}

function verifySignature(token: string, secret: string) {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return expected === signatureB64;
}

describe("career-principal", () => {
  const originalSecret = process.env.CAREER_PRINCIPAL_HMAC_SECRET;

  beforeEach(() => {
    process.env.CAREER_PRINCIPAL_HMAC_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.CAREER_PRINCIPAL_HMAC_SECRET = originalSecret;
  });

  it("produces a valid HS256 token with expected claims for company scope", async () => {
    const { createCareerPrincipalHeader } = await import("@/lib/fastapi/career-principal");

    const token = createCareerPrincipalHeader({
      scope: "company",
      actor: { kind: "user", id: "user-1" },
      plan: "standard",
      companyId: "company-1",
      nowSeconds: 1_700_000_000,
    });

    expect(token.split(".")).toHaveLength(3);
    expect(verifySignature(token, SECRET)).toBe(true);

    const [headerB64, payloadB64] = token.split(".");
    const header = JSON.parse(decodeBase64Url(headerB64));
    const payload = JSON.parse(decodeBase64Url(payloadB64));

    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(payload.iss).toBe("next-bff");
    expect(payload.aud).toBe("career-compass-fastapi");
    expect(payload.scope).toBe("company");
    expect(payload.actor).toEqual({ kind: "user", id: "user-1" });
    expect(payload.plan).toBe("standard");
    expect(payload.company_id).toBe("company-1");
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.nbf).toBe(1_700_000_000 - 5);
    expect(payload.exp).toBe(1_700_000_000 + 60);
    expect(typeof payload.jti).toBe("string");
    expect(payload.jti.length).toBeGreaterThan(0);
  });

  it("allows ai-stream scope without companyId", async () => {
    const { createCareerPrincipalHeader } = await import("@/lib/fastapi/career-principal");

    const token = createCareerPrincipalHeader({
      scope: "ai-stream",
      actor: { kind: "guest", id: "guest-1" },
      plan: "guest",
    });

    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(decodeBase64Url(payloadB64));
    expect(payload.scope).toBe("ai-stream");
    expect(payload.company_id).toBeNull();
  });

  it("rejects company scope without companyId", async () => {
    const { createCareerPrincipalHeader } = await import("@/lib/fastapi/career-principal");

    expect(() =>
      createCareerPrincipalHeader({
        scope: "company",
        actor: { kind: "user", id: "user-1" },
        plan: "standard",
        companyId: null,
      }),
    ).toThrow(/company scope requires companyId/);
  });

  it("throws when the HMAC secret is not configured", async () => {
    process.env.CAREER_PRINCIPAL_HMAC_SECRET = "";
    const { createCareerPrincipalHeader } = await import("@/lib/fastapi/career-principal");

    expect(() =>
      createCareerPrincipalHeader({
        scope: "company",
        actor: { kind: "user", id: "user-1" },
        plan: "standard",
        companyId: "company-1",
      }),
    ).toThrow(/CAREER_PRINCIPAL_HMAC_SECRET/);
  });
});
