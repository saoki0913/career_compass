import "server-only";

import { createHmac } from "crypto";

/**
 * BFF → FastAPI principal propagation (`X-Career-Principal`)
 *
 * This header is distinct from `Authorization: Bearer <internal-jwt>` and
 * its secret (`CAREER_PRINCIPAL_HMAC_SECRET`) is distinct from
 * `INTERNAL_API_JWT_SECRET`. The internal-JWT authenticates the *service*
 * (next-bff → fastapi) and is shared across every BFF → FastAPI call.
 * `X-Career-Principal` conveys the authenticated *actor* (user/guest) and
 * the *scope* of the downstream operation.
 *
 * FastAPI pairs this with a `scope` claim to prevent a principal minted for
 * one scope (e.g. company-info RAG) from being replayed against a different
 * scope (e.g. AI streaming concurrency).
 *
 * See `docs/security/principal_spec.md` for the full spec.
 */

const PRINCIPAL_ISSUER = "next-bff";
const PRINCIPAL_AUDIENCE = "career-compass-fastapi";
const PRINCIPAL_EXPIRY_SECONDS = 60;
const PRINCIPAL_NOT_BEFORE_SKEW_SECONDS = 5;

export const CAREER_PRINCIPAL_HEADER = "X-Career-Principal";

export type CareerPrincipalScope = "company" | "ai-stream";

export type CareerPrincipalActor = {
  kind: "user" | "guest";
  id: string;
};

export type CareerPrincipalPlan = "guest" | "free" | "standard" | "pro";

export type CreateCareerPrincipalInput = {
  scope: CareerPrincipalScope;
  actor: CareerPrincipalActor;
  plan: CareerPrincipalPlan;
  companyId?: string | null;
  /**
   * Override `now()` for testing. Seconds since epoch.
   */
  nowSeconds?: number;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomJti() {
  // 128-bit random token; base64url to keep the header compact.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Mint a signed `X-Career-Principal` header.
 *
 * `scope: "company"` requires a non-null `companyId`. `scope: "ai-stream"` may
 * leave `companyId` null when the conversation is not tied to a company.
 */
export function createCareerPrincipalHeader(input: CreateCareerPrincipalInput): string {
  const secret = process.env.CAREER_PRINCIPAL_HMAC_SECRET?.trim();
  if (!secret) {
    throw new Error("CAREER_PRINCIPAL_HMAC_SECRET is not configured");
  }

  if (input.scope === "company" && !input.companyId) {
    throw new Error("company scope requires companyId");
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: PRINCIPAL_ISSUER,
      aud: PRINCIPAL_AUDIENCE,
      scope: input.scope,
      actor: { kind: input.actor.kind, id: input.actor.id },
      company_id: input.companyId ?? null,
      plan: input.plan,
      iat: now,
      nbf: now - PRINCIPAL_NOT_BEFORE_SKEW_SECONDS,
      exp: now + PRINCIPAL_EXPIRY_SECONDS,
      jti: randomJti(),
    }),
  );

  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}
