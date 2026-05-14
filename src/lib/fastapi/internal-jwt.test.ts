/**
 * Tests for src/lib/fastapi/internal-jwt.ts.
 *
 * Implementation migrated from process.env to serverEnv (T3 Env).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const SECRET = "test-secret-for-internal-jwt-32chars!!";

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/") + padding,
    "base64",
  ).toString("utf8");
}

describe("createInternalServiceJwt", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.INTERNAL_API_JWT_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_JWT_SECRET;
  });

  it("returns null for localhost when secret is absent", async () => {
    delete process.env.INTERNAL_API_JWT_SECRET;
    const { createInternalServiceJwt } = await import("./internal-jwt");
    expect(createInternalServiceJwt("http://localhost:8000")).toBeNull();
  });

  it("produces a valid HS256 JWT", async () => {
    const { createInternalServiceJwt } = await import("./internal-jwt");
    const jwt = createInternalServiceJwt("https://api.example.com");
    expect(jwt).toBeTruthy();

    const parts = jwt!.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(decodeBase64Url(parts[0]));
    expect(header.alg).toBe("HS256");

    const payload = JSON.parse(decodeBase64Url(parts[1]));
    expect(payload.iss).toBe("next-bff");
    expect(payload.aud).toBe("career-compass-fastapi");
  });

  it("signature is verifiable with the secret", async () => {
    const { createInternalServiceJwt } = await import("./internal-jwt");
    const jwt = createInternalServiceJwt("https://api.example.com")!;
    const [header, payload, sig] = jwt.split(".");

    const expected = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(sig).toBe(expected);
  });
});
