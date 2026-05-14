import { type NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import {
  checkRateLimit,
  createAnonymousRateLimitKey,
  createRateLimitKey,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { logError, logWarn } from "@/lib/logger";
import {
  isCompanyLogoAssetKey,
  type CompanyLogoAssetKey,
  type CompanyLogoProvider,
} from "@/lib/company-logo-types";
import { resolveMappedCompanyLogoName } from "@/lib/server/company-domain-estimator";

type OfficialLogoAsset =
  | { kind: "remote-svg"; url: string }
  | { kind: "inline-svg-symbol"; pageUrl: string; symbolId: string };
type LogoDevSearchResult = {
  name: string;
  domain: string;
};
type BrandfetchSearchResult = {
  domain: string;
  claimed: boolean;
};

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const PRIVATE_HOST_PATTERN = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|0\.0\.0\.0)/i;
const SUCCESS_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const MISS_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
const TRANSIENT_MISS_CACHE_CONTROL = "no-store";
const MAX_LOGO_BYTES = 512 * 1024;
const OFFICIAL_LOGO_ASSETS: Record<CompanyLogoAssetKey, OfficialLogoAsset> = {
  "mitsui-corporate-horizontal": {
    kind: "inline-svg-symbol",
    pageUrl: "https://www.mitsui.com/jp/ja/",
    symbolId: "logo-corporate-horizontal",
  },
  "mitsuifudosan-corporate": {
    kind: "remote-svg",
    url: "https://www.mitsuifudosan.co.jp/assets/image/common/logo.svg",
  },
  "tokio-marine-nichido": {
    kind: "remote-svg",
    url: "https://www.tokiomarine-nichido.co.jp/shared/img/logo-header.svg",
  },
};

function logoMissResponse(cacheControl = MISS_CACHE_CONTROL): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const policy = searchParams.get("policy");
  const provider = normalizeProvider(searchParams.get("provider"));
  const asset = normalizeAssetKey(searchParams.get("asset"));
  const domain = normalizeDomain(searchParams.get("domain"));
  const logoName = resolveLogoName(searchParams.get("nameKey"), searchParams.get("name"));

  if (policy !== "official-logo-v2" || !provider) {
    return logoMissResponse();
  }

  const identity = await getRequestIdentity(request);
  if (!identity) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "COMPANY_LOGO_AUTH_REQUIRED",
      userMessage: "ログイン状態を確認して、もう一度お試しください。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      developerMessage: "Authentication required",
      logContext: "company-logo-auth",
    });
  }

  const rateLimitKey = identity.userId || identity.guestId
    ? createRateLimitKey("companyLogo", identity.userId, identity.guestId)
    : createAnonymousRateLimitKey("companyLogo", request.headers);
  const rateLimit = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.companyLogo,
    "companyLogo",
  );
  if (!rateLimit.allowed) {
    const response = createApiErrorResponse(request, {
      status: 429,
      code: "COMPANY_LOGO_RATE_LIMITED",
      userMessage: "しばらく待ってから再試行してください。",
      action: `${rateLimit.resetIn}秒ほど待ってから、もう一度お試しください。`,
      retryable: true,
      logContext: "company-logo-rate-limit",
    });
    response.headers.set("Retry-After", String(rateLimit.resetIn));
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
    return response;
  }

  if (provider === "official") {
    if (!asset) {
      return logoMissResponse();
    }
    return await fetchOfficialLogo(asset);
  }

  if (provider === "logo-dev-name" || provider === "brandfetch-name") {
    if (!logoName) {
      return logoMissResponse();
    }
  } else if (!domain) {
    return logoMissResponse();
  }

  if (provider === "brandfetch-name") {
    return await fetchBrandfetchNameLogo(logoName);
  }

  if (provider === "logo-dev-name") {
    return await fetchLogoDevNameLogo(logoName);
  }

  const upstreams = buildUpstreamUrls(provider, { domain, logoName });
  if (upstreams.length === 0) {
    return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);
  }

  return await fetchRasterLogoFromUpstreams(provider, upstreams);
}

async function fetchRasterLogoFromUpstreams(
  provider: CompanyLogoProvider,
  upstreams: string[],
): Promise<NextResponse> {
  let sawTransientFailure = false;
  for (const upstream of upstreams) {
    try {
      const response = await fetch(upstream, {
        headers: {
          Accept: "image/avif,image/webp,image/png,image/*;q=0.8",
        },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status >= 500) {
          sawTransientFailure = true;
          logWarn("company-logo-upstream-rejected", {
            provider,
            status: response.status,
            route: "/api/company-logos",
          });
        }
        continue;
      }

      const contentType = response.headers.get("content-type");
      if (!isRasterImageContentType(contentType)) {
        logWarn("company-logo-upstream-non-image", {
          provider,
          status: response.status,
          route: "/api/company-logos",
        });
        continue;
      }

      const headers = new Headers();
      headers.set("content-type", contentType || "image/png");
      headers.set("cache-control", SUCCESS_CACHE_CONTROL);
      headers.set("x-content-type-options", "nosniff");
      const body = await response.arrayBuffer();
      if (body.byteLength > MAX_LOGO_BYTES) {
        logWarn("company-logo-upstream-too-large", {
          provider,
          route: "/api/company-logos",
        });
        continue;
      }
      return new NextResponse(body, { status: 200, headers });
    } catch (error) {
      logError("company-logo-fetch-failed", new Error("Company logo upstream fetch failed"), {
        provider,
        route: "/api/company-logos",
        errorName: error instanceof Error ? error.name : undefined,
      });
      return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);
    }
  }

  return logoMissResponse(sawTransientFailure ? TRANSIENT_MISS_CACHE_CONTROL : MISS_CACHE_CONTROL);
}

function normalizeProvider(value: string | null): CompanyLogoProvider | null {
  if (value === null || value === "auto") return "auto";
  return value === "logo-dev" || value === "brandfetch" || value === "official" || value === "logo-dev-name" || value === "brandfetch-name"
    ? value
    : null;
}

function normalizeAssetKey(value: string | null): CompanyLogoAssetKey | null {
  if (!value) return null;
  return isCompanyLogoAssetKey(value) && value in OFFICIAL_LOGO_ASSETS ? value : null;
}

function normalizeDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    const hostname = parsed.hostname.toLowerCase();
    if (!DOMAIN_PATTERN.test(hostname) || PRIVATE_HOST_PATTERN.test(hostname)) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

function resolveLogoName(nameKey: string | null, name: string | null): string | null {
  const key = nameKey?.trim();
  if (key) {
    return resolveMappedCompanyLogoName(key);
  }
  return normalizeLogoName(name);
}

function buildUpstreamUrls(
  provider: CompanyLogoProvider,
  input: { domain: string | null; logoName: string | null },
): string[] {
  if (provider === "official" || provider === "brandfetch-name") return [];

  if (provider === "auto") {
    return [
      ...buildUpstreamUrls("logo-dev", { domain: input.domain, logoName: null }),
      ...buildUpstreamUrls("brandfetch", { domain: input.domain, logoName: null }),
    ];
  }

  if (provider === "logo-dev" || provider === "logo-dev-name") {
    const token = getLogoDevToken();
    if (!token) return [];
    const path =
      provider === "logo-dev-name"
        ? input.logoName
          ? `/name/${encodeURIComponent(input.logoName)}`
          : null
        : input.domain
          ? `/${encodeURIComponent(input.domain)}`
          : null;
    if (!path) return [];
    const url = new URL(path, "https://img.logo.dev");
    url.searchParams.set("token", token);
    url.searchParams.set("size", "128");
    url.searchParams.set("format", "png");
    url.searchParams.set("retina", "true");
    url.searchParams.set("fallback", "404");
    return [url.toString()];
  }

  if (!input.domain) return [];

  if (provider === "brandfetch") {
    const clientId = getBrandfetchClientId();
    if (!clientId) return [];
    const url = new URL(
      `/domain/${encodeURIComponent(input.domain)}/w/128/h/128/type/logo/fallback/404`,
      "https://cdn.brandfetch.io",
    );
    url.searchParams.set("c", clientId);
    return [url.toString()];
  }

  return [];
}

async function fetchOfficialLogo(assetKey: CompanyLogoAssetKey): Promise<NextResponse> {
  const asset = OFFICIAL_LOGO_ASSETS[assetKey];

  try {
    if (asset.kind === "remote-svg") {
      return await fetchRemoteSvg(asset.url);
    }
    return await fetchInlineSvgSymbol(asset.pageUrl, asset.symbolId);
  } catch (error) {
    logError("company-logo-official-fetch-failed", new Error("Official company logo fetch failed"), {
      provider: "official",
      route: "/api/company-logos",
      assetKey,
      errorName: error instanceof Error ? error.name : undefined,
    });
    return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);
  }
}

async function fetchBrandfetchNameLogo(logoName: string | null): Promise<NextResponse> {
  if (!logoName) return logoMissResponse();
  const clientId = getBrandfetchClientId();
  if (!clientId) return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);

  const searchUrl = new URL(`/v2/search/${encodeURIComponent(logoName)}`, "https://api.brandfetch.io");
  searchUrl.searchParams.set("c", clientId);

  try {
    const response = await fetch(searchUrl.toString(), {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        logWarn("company-logo-brandfetch-search-rejected", {
          provider: "brandfetch-name",
          status: response.status,
          route: "/api/company-logos",
        });
        return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);
      }
      return logoMissResponse();
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_LOGO_BYTES) {
      logWarn("company-logo-brandfetch-search-too-large", {
        provider: "brandfetch-name",
        route: "/api/company-logos",
      });
      return logoMissResponse();
    }

    const domain = pickBrandfetchSearchDomain(JSON.parse(body));
    if (!domain) return logoMissResponse();

    return await fetchRasterLogoFromUpstreams("brandfetch-name", buildUpstreamUrls("brandfetch", { domain, logoName: null }));
  } catch (error) {
    logError("company-logo-brandfetch-search-failed", new Error("Brandfetch logo search failed"), {
      provider: "brandfetch-name",
      route: "/api/company-logos",
      errorName: error instanceof Error ? error.name : undefined,
    });
    return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);
  }
}

async function fetchLogoDevNameLogo(logoName: string | null): Promise<NextResponse> {
  if (!logoName) return logoMissResponse();

  const domain = await resolveLogoDevDomainByName(logoName);
  if (domain) {
    const byDomain = buildUpstreamUrls("logo-dev", { domain, logoName: null });
    const response = await fetchRasterLogoFromUpstreams("logo-dev-name", byDomain);
    if (response.ok) return response;
  }

  const byName = buildUpstreamUrls("logo-dev-name", { domain: null, logoName });
  if (byName.length === 0) return logoMissResponse(TRANSIENT_MISS_CACHE_CONTROL);
  return await fetchRasterLogoFromUpstreams("logo-dev-name", byName);
}

async function resolveLogoDevDomainByName(logoName: string): Promise<string | null> {
  const secret = getLogoDevSearchSecret();
  if (!secret) return null;

  const searchUrl = new URL("/search", "https://api.logo.dev");
  searchUrl.searchParams.set("q", logoName);
  searchUrl.searchParams.set("strategy", "match");

  try {
    const response = await fetch(searchUrl.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      if (response.status >= 500) {
        logWarn("company-logo-logodev-search-rejected", {
          provider: "logo-dev-name",
          status: response.status,
          route: "/api/company-logos",
        });
      }
      return null;
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_LOGO_BYTES) {
      logWarn("company-logo-logodev-search-too-large", {
        provider: "logo-dev-name",
        route: "/api/company-logos",
      });
      return null;
    }

    return pickLogoDevSearchDomain(JSON.parse(body));
  } catch (error) {
    logError("company-logo-logodev-search-failed", new Error("Logo.dev brand search failed"), {
      provider: "logo-dev-name",
      route: "/api/company-logos",
      errorName: error instanceof Error ? error.name : undefined,
    });
    return null;
  }
}

async function fetchRemoteSvg(url: string): Promise<NextResponse> {
  const response = await fetch(url, {
    headers: { Accept: "image/svg+xml,image/*;q=0.8" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || !isImageContentType(response.headers.get("content-type"))) {
    return logoMissResponse();
  }

  const body = await response.text();
  if (!isSafeSvg(body) || new TextEncoder().encode(body).byteLength > MAX_LOGO_BYTES) {
    return logoMissResponse();
  }

  return svgResponse(body);
}

async function fetchInlineSvgSymbol(pageUrl: string, symbolId: string): Promise<NextResponse> {
  const response = await fetch(pageUrl, {
    headers: { Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    return logoMissResponse();
  }

  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > MAX_LOGO_BYTES) {
    return logoMissResponse();
  }

  const svg = extractSvgById(html, symbolId);
  if (!svg || !isSafeSvg(svg)) {
    return logoMissResponse();
  }

  return svgResponse(svg);
}

function extractSvgById(html: string, symbolId: string): string | null {
  const escapedId = symbolId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<svg\\b(?=[^>]*\\bid=["']${escapedId}["'])[^>]*>[\\s\\S]*?<\\/svg>`, "i"));
  return match?.[0] ?? null;
}

function isSafeSvg(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("<svg") && !lower.includes("<script") && !lower.includes("javascript:") && !/\son[a-z]+\s*=/.test(lower);
}

function svgResponse(svg: string): NextResponse {
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": SUCCESS_CACHE_CONTROL,
      "content-security-policy": "default-src 'none'; img-src 'none'; style-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

function isImageContentType(value: string | null): boolean {
  return Boolean(value?.toLowerCase().startsWith("image/"));
}

function isRasterImageContentType(value: string | null): boolean {
  const normalized = value?.toLowerCase().split(";")[0]?.trim();
  return normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp" || normalized === "image/avif" || normalized === "image/gif";
}

function normalizeLogoName(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function pickBrandfetchSearchDomain(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const results = value.map(parseBrandfetchSearchResult).filter((result): result is BrandfetchSearchResult => result !== null);
  const preferred = results.find((result) => result.claimed) ?? results[0];
  return preferred ? normalizeDomain(preferred.domain) : null;
}

function pickLogoDevSearchDomain(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const results = value.map(parseLogoDevSearchResult).filter((result): result is LogoDevSearchResult => result !== null);
  return results[0] ? normalizeDomain(results[0].domain) : null;
}

function parseLogoDevSearchResult(value: unknown): LogoDevSearchResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.domain !== "string") return null;
  return {
    name: record.name,
    domain: record.domain,
  };
}

function parseBrandfetchSearchResult(value: unknown): BrandfetchSearchResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.domain !== "string") return null;
  return {
    domain: record.domain,
    claimed: record.claimed === true,
  };
}

function getLogoDevToken(): string | null {
  const value = process.env.LOGO_DEV_TOKEN?.trim() || process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

function getLogoDevSearchSecret(): string | null {
  const explicitSecret = process.env.LOGO_DEV_SECRET_KEY?.trim();
  if (explicitSecret) return explicitSecret;

  const token = process.env.LOGO_DEV_TOKEN?.trim();
  return token?.startsWith("sk_") ? token : null;
}

function getBrandfetchClientId(): string | null {
  const value = process.env.BRANDFETCH_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID?.trim();
  return value && value.length > 0 ? value : null;
}
