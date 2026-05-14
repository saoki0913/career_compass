import fs from "fs";
import path from "path";
import type { CompanyLogoAssetKey, CompanyLogoCandidate } from "@/lib/company-logo-types";

/**
 * Company domain estimator
 *
 * Estimates a corporate URL for companies that don't have one stored,
 * using the domain mappings from backend/data/company_mappings.json.
 * This enables favicon display for companies without a corporateUrl.
 */

interface CompanyMappingsFile {
  mappings: Record<string, string[] | CompanyMappingObject>;
  short_domain_allowlist?: Record<string, string[]>;
}

interface CompanyMappingObject {
  domains: string[];
  logo_asset_key?: CompanyLogoAssetKey;
  logo_domains?: string[];
  logo_names?: CompanyLogoNameMapping[];
  logo_name_lookup_allowed?: boolean;
  parent?: string;
  allow_parent_domains_for?: string[];
}

interface CompanyLogoNameMapping {
  key: string;
  name: string;
}

interface CompanyDomainEntry {
  domains: string[];
  logoAssetKey: CompanyLogoAssetKey | null;
  logoDomains: string[];
  logoNames: CompanyLogoNameMapping[];
}

export interface CompanyLogoProfile {
  candidates: CompanyLogoCandidate[];
  logoDomains: string[];
  logoAssetKey: CompanyLogoAssetKey | null;
  fallback: { kind: "initials" };
  fallbackFaviconUrl: null;
}

/** Module-level cache: loaded once per process */
let cachedMappings: Map<string, CompanyDomainEntry> | null = null;
const MAX_LOGO_DOMAINS = 8;

/**
 * Strips common Japanese corporate suffixes / prefixes from a company name.
 * e.g. "株式会社トヨタ" -> "トヨタ", "トヨタ(株)" -> "トヨタ"
 */
function normalizeCompanyName(name: string): string {
  return name
    .replace(/株式会社/g, "")
    .replace(/\(株\)/g, "")
    .replace(/（株）/g, "")
    .replace(/㈱/g, "")
    .replace(/有限会社/g, "")
    .replace(/合同会社/g, "")
    .replace(/一般社団法人/g, "")
    .replace(/一般財団法人/g, "")
    .trim();
}

function isCompanyMappingObject(
  value: string[] | CompanyMappingObject
): value is CompanyMappingObject {
  return (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "domains" in value &&
    Array.isArray((value as CompanyMappingObject).domains)
  );
}

function loadMappings(): Map<string, CompanyDomainEntry> {
  if (cachedMappings) {
    return cachedMappings;
  }

  const filePath = path.join(
    process.cwd(),
    "backend/data/company_mappings.json"
  );

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data: CompanyMappingsFile = JSON.parse(fileContent);

    const result = new Map<string, CompanyDomainEntry>();

    for (const [key, value] of Object.entries(data.mappings)) {
      // Skip section/subsection headers
      if (key.startsWith("_")) {
        continue;
      }

      const domains = isCompanyMappingObject(value)
        ? value.domains
        : value;
      const logoAssetKey = isCompanyMappingObject(value)
        ? value.logo_asset_key ?? null
        : null;
      const logoDomains = isCompanyMappingObject(value)
        ? value.logo_domains ?? []
        : [];
      const logoNames = isCompanyMappingObject(value)
        ? normalizeLogoNameMappings(key, value)
        : [];

      if (Array.isArray(domains) && domains.length > 0) {
        result.set(key, { domains, logoAssetKey, logoDomains, logoNames });
      }
    }

    cachedMappings = result;
    return result;
  } catch {
    // File not found or parse error -- return empty map; caller gets null
    return new Map();
  }
}

/**
 * Returns true if the token looks like a full domain (contains a dot).
 * e.g. "sagawa-exp.co.jp" -> true, "sagawa" -> false
 */
function isDomainWithTld(token: string): boolean {
  return token.includes(".");
}

/**
 * Estimate a corporate URL for the given company name using
 * backend/data/company_mappings.json.
 *
 * Returns a URL string (e.g. "https://sagawa-exp.co.jp") or null
 * if no mapping is found.
 */
export function estimateCorporateUrl(companyName: string): string | null {
  const entry = getMappingEntry(companyName);
  return entry ? domainToUrl(entry.domains) : null;
}

export function estimateCompanyLogoProfile(companyName: string): CompanyLogoProfile | null {
  const entry = getMappingEntry(companyName);
  if (!entry) return null;

  const explicitLogoDomains = unique(entry.logoDomains.flatMap(resolveLogoDomainCandidates)).slice(0, MAX_LOGO_DOMAINS);
  const promotedLogoDomains = unique(
    entry.domains.flatMap(resolvePromotedLogoDomainCandidates).filter((domain) => !explicitLogoDomains.includes(domain))
  ).slice(0, Math.max(0, MAX_LOGO_DOMAINS - explicitLogoDomains.length));
  const logoDomains = [...explicitLogoDomains, ...promotedLogoDomains];
  const candidates: CompanyLogoCandidate[] = [
    ...explicitLogoDomains.map((domain) => ({
      kind: "domain",
      domain,
      source: "mapping.logo_domains",
      confidence: "high",
    } satisfies CompanyLogoCandidate)),
    ...promotedLogoDomains.map((domain) => ({
      kind: "domain",
      domain,
      source: "promoted.mapping.domains",
      confidence: "low",
    } satisfies CompanyLogoCandidate)),
    ...(entry.logoAssetKey
      ? [
          {
            kind: "official-asset" as const,
            assetKey: entry.logoAssetKey,
            source: "mapping.logo_asset_key" as const,
            confidence: "high" as const,
          },
        ]
      : []),
    ...entry.logoNames.map((logoName) => ({
      kind: "allowlisted-name",
      nameKey: logoName.key,
      source: "mapping.logo_names",
      confidence: "high",
    } satisfies CompanyLogoCandidate)),
  ];

  return {
    candidates,
    logoDomains,
    logoAssetKey: entry.logoAssetKey,
    fallback: { kind: "initials" },
    fallbackFaviconUrl: null,
  };
}

export function isMappedCompanyLogoDomain(domain: string): boolean {
  const normalized = normalizeDomainToken(domain);
  if (!normalized) return false;

  for (const entry of loadMappings().values()) {
    const explicitLogoDomains = unique(entry.logoDomains.flatMap(resolveLogoDomainCandidates));
    const logoDomains = unique([
      ...explicitLogoDomains,
      ...entry.domains.flatMap(resolvePromotedLogoDomainCandidates).filter((candidate) => !explicitLogoDomains.includes(candidate)),
    ]);
    if (logoDomains.includes(normalized)) {
      return true;
    }
  }

  return false;
}

export function resolveMappedCompanyLogoName(nameKey: string): string | null {
  const normalizedKey = normalizeLogoNameKey(nameKey);
  if (!normalizedKey) return null;

  for (const entry of loadMappings().values()) {
    const match = entry.logoNames.find((logoName) => logoName.key === normalizedKey);
    if (match) return match.name;
  }

  return null;
}

function getMappingEntry(companyName: string): CompanyDomainEntry | null {
  const mappings = loadMappings();
  const direct = mappings.get(companyName);
  if (direct) return direct;

  const normalized = normalizeCompanyName(companyName);
  if (normalized === companyName || normalized.length === 0) {
    return null;
  }
  return mappings.get(normalized) ?? null;
}

/**
 * Convert the first suitable domain token to a full URL.
 * - If a token contains a dot (e.g. "smbc.co.jp"), treat as full domain
 * - Otherwise (e.g. "mitsubishicorp"), append ".co.jp"
 */
function domainToUrl(domains: string[]): string {
  // Prefer a token that already looks like a full domain
  const fullDomain = domains.find(isDomainWithTld);
  if (fullDomain) {
    return `https://${fullDomain}`;
  }

  // Fall back to first bare token + .co.jp
  return `https://${domains[0]}.co.jp`;
}

function resolveLogoDomainCandidates(token: string): string[] {
  const domain = normalizeDomainToken(token);
  if (!domain) return [];
  if (isRealHostname(domain)) return [domain];
  if (domain.includes(".")) return [`${domain}.jp`, `${domain}.com`];
  return [`${domain}.co.jp`, `${domain}.com`, `${domain}.jp`];
}

function resolvePromotedLogoDomainCandidates(token: string): string[] {
  const domain = normalizeDomainToken(token);
  if (!domain || !isRealHostname(domain)) return [];
  return [domain];
}

function normalizeDomainToken(token: string): string | null {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function isRealHostname(domain: string): boolean {
  return /\.(?:co\.jp|ne\.jp|or\.jp|go\.jp|ac\.jp|ed\.jp|com|jp|net|org|co|io|ai|bank)$/i.test(domain);
}

function normalizeLogoNameMappings(
  companyKey: string,
  value: CompanyMappingObject,
): CompanyLogoNameMapping[] {
  const names = (value.logo_names ?? [])
    .map((entry) => {
      const key = normalizeLogoNameKey(entry.key);
      const name = normalizeLogoNameValue(entry.name);
      return key && name ? { key, name } : null;
    })
    .filter((entry): entry is CompanyLogoNameMapping => entry !== null);

  if (names.length > 0 || !value.logo_name_lookup_allowed) {
    return names;
  }

  const key = normalizeLogoNameKey(`company:${companyKey}`);
  const name = normalizeLogoNameValue(companyKey);
  return key && name ? [{ key, name }] : [];
}

function normalizeLogoNameKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return null;
  return trimmed;
}

function normalizeLogoNameValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) return null;
  return trimmed;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Clear the cached mappings. Useful for testing.
 * @internal
 */
export function _clearCache(): void {
  cachedMappings = null;
}
