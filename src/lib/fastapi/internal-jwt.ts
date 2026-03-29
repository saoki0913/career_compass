import "server-only";

import { createHmac } from "crypto";

const INTERNAL_SERVICE_ISSUER = "next-bff";
const INTERNAL_SERVICE_AUDIENCE = "career-compass-fastapi";
const INTERNAL_SERVICE_SUBJECT = "next-bff";
const INTERNAL_SERVICE_EXPIRY_SECONDS = 60;

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

function isLocalBackend(baseUrl: string) {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function createInternalServiceJwt(baseUrl: string): string | null {
  const secret = process.env.INTERNAL_API_JWT_SECRET?.trim();
  if (!secret) {
    if (isLocalBackend(baseUrl)) {
      return null;
    }
    throw new Error("INTERNAL_API_JWT_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: INTERNAL_SERVICE_ISSUER,
      aud: INTERNAL_SERVICE_AUDIENCE,
      sub: INTERNAL_SERVICE_SUBJECT,
      service: INTERNAL_SERVICE_SUBJECT,
      iat: now,
      nbf: now - 5,
      exp: now + INTERNAL_SERVICE_EXPIRY_SECONDS,
    })
  );
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}
