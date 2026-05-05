import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

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

export interface NormalizedPublicUrlResult {
  ok: boolean;
  value: string | null;
  code?: PublicUrlValidationCode;
  userMessage?: string;
}

type GuardedFetchOptions = {
  maxRedirects?: number;
};

const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set(["", "443"]);

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: number) => void;

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
  const ipv4MappedMatch = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4MappedMatch) {
    return isBlockedIpv4(ipv4MappedMatch[1]);
  }
  if (normalized.startsWith("::ffff:")) {
    return true;
  }

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

function headersInitToRecord(headersInit: HeadersInit | undefined): Record<string, string> {
  const headers = new Headers(headersInit);
  return Object.fromEntries(headers.entries());
}

function bodyInitToBuffer(body: BodyInit | null | undefined): Buffer | string | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error("Unsupported guarded fetch body");
}

function nodeHeadersToFetchHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        result.append(name, entry);
      }
      continue;
    }
    if (value !== undefined) {
      result.set(name, value);
    }
  }
  return result;
}

async function fetchWithPinnedIp(url: URL, resolvedIps: string[], init?: RequestInit): Promise<Response> {
  const body = bodyInitToBuffer(init?.body);
  const baseHeaders = headersInitToRecord(init?.headers);
  const path = `${url.pathname || "/"}${url.search}`;
  const method = init?.method ?? (body === undefined ? "GET" : "POST");
  const abortSignal = init?.signal ?? null;
  let lastError: unknown;

  for (const address of resolvedIps) {
    try {
      return await new Promise<Response>((resolve, reject) => {
        const request = httpsRequest({
          protocol: "https:",
          hostname: url.hostname,
          port: url.port ? Number(url.port) : 443,
          path,
          method,
          headers: baseHeaders,
          servername: url.hostname,
          lookup: (_hostname: string, _options: unknown, callback: LookupCallback) => {
            callback(null, address, isIP(address));
          },
        }, (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            resolve(new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 0,
              statusText: response.statusMessage,
              headers: nodeHeadersToFetchHeaders(response.headers),
            }));
          });
        });

        request.on("error", reject);
        if (abortSignal) {
          if (abortSignal.aborted) {
            request.destroy(new Error("Request aborted"));
            return;
          }
          abortSignal.addEventListener("abort", () => {
            request.destroy(new Error("Request aborted"));
          }, { once: true });
        }
        if (body !== undefined) {
          request.write(body);
        }
        request.end();
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Pinned fetch failed");
}

export async function validatePublicUrl(input: string): Promise<PublicUrlValidationResult> {
  let url: URL;
  try {
    url = new URL(input.trim());
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

export async function normalizePublicHttpsUrl(input: unknown): Promise<NormalizedPublicUrlResult> {
  if (input === null || input === undefined || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return {
      ok: false,
      value: null,
      code: "INVALID_URL",
      userMessage: "URLの形式を確認してください。",
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  const validation = await validatePublicUrl(trimmed);
  if (!validation.allowed || !validation.url) {
    return {
      ok: false,
      value: null,
      code: validation.code,
      userMessage: validation.userMessage || "公開された HTTPS のURLを指定してください。",
    };
  }

  validation.url.hash = "";
  return {
    ok: true,
    value: validation.url.toString(),
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

    const response = await fetchWithPinnedIp(validation.url, validation.resolvedIps, init);

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
