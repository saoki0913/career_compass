import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type PublicUrlValidationCode =
  | "INVALID_URL"
  | "INVALID_PROTOCOL"
  | "INVALID_PORT"
  | "URL_HAS_CREDENTIALS"
  | "LOCAL_ADDRESS"
  | "PRIVATE_NETWORK"
  | "DNS_LOOKUP_FAILED"
  | "REDIRECT_MISSING_LOCATION"
  | "TOO_MANY_REDIRECTS";

export interface PublicUrlValidationResult {
  allowed: boolean;
  code?: PublicUrlValidationCode;
  userMessage?: string;
  resolvedIps: string[];
  url?: URL;
}

type GuardedFetchOptions = {
  maxRedirects?: number;
};

const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set(["", "443"]);

function blockedResult(
  code: PublicUrlValidationCode,
  userMessage: string,
  resolvedIps: string[] = [],
): PublicUrlValidationResult {
  return {
    allowed: false,
    code,
    userMessage,
    resolvedIps,
  };
}

function normalizeIpv6(ip: string): string {
  return ip.toLowerCase();
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = normalizeIpv6(ip);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8") ||
    normalized.startsWith("2001:10")
  );
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
}

async function resolveHostIps(hostname: string): Promise<string[]> {
  const version = isIP(hostname);
  if (version !== 0) {
    return [hostname];
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function validatePublicUrl(input: string): Promise<PublicUrlValidationResult> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return blockedResult("INVALID_URL", "無効なURLです。");
  }

  if (url.protocol !== "https:") {
    return blockedResult("INVALID_PROTOCOL", "公開された HTTPS のURLのみ利用できます。");
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    return blockedResult("INVALID_PORT", "公開された HTTPS のURLのみ利用できます。");
  }

  if (url.username || url.password) {
    return blockedResult("URL_HAS_CREDENTIALS", "認証情報付きURLは利用できません。");
  }

  let resolvedIps: string[];
  try {
    resolvedIps = await resolveHostIps(url.hostname);
  } catch {
    return blockedResult("DNS_LOOKUP_FAILED", "URLの安全性を確認できませんでした。");
  }

  if (resolvedIps.length === 0) {
    return blockedResult("DNS_LOOKUP_FAILED", "URLの安全性を確認できませんでした。");
  }

  if (resolvedIps.some((ip) => isBlockedIp(ip))) {
    const code = isIP(url.hostname) !== 0 || url.hostname === "localhost" ? "LOCAL_ADDRESS" : "PRIVATE_NETWORK";
    return blockedResult(code, "内部アドレスにはアクセスできません。", resolvedIps);
  }

  return {
    allowed: true,
    resolvedIps,
    url,
  };
}

export async function guardedFetch(
  input: string,
  init?: RequestInit,
  options?: GuardedFetchOptions,
): Promise<Response> {
  const maxRedirects = options?.maxRedirects ?? MAX_REDIRECTS;
  let currentUrl = input;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validation = await validatePublicUrl(currentUrl);
    if (!validation.allowed || !validation.url) {
      throw new Error(validation.userMessage || "URL validation failed");
    }

    const response = await fetch(validation.url.toString(), {
      ...init,
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect location is missing");
    }

    currentUrl = new URL(location, validation.url).toString();
  }

  throw new Error("Too many redirects");
}
