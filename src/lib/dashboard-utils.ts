import type { CompanyStatus, SelectionPhaseConfig } from "@/lib/constants/status";
import {
  COMPANY_SELECTION_PHASE_COLUMNS,
  TERMINAL_COMPANY_STATUSES,
  getSelectionPhaseForStatus,
  getStatusConfig,
} from "@/lib/constants/status";
import type { CompanyLogoCandidate, CompanyLogoProvider } from "@/lib/company-logo-types";

const LOGO_DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export type PipelineColumn = SelectionPhaseConfig;
export const PIPELINE_COLUMNS = COMPANY_SELECTION_PHASE_COLUMNS;

interface CompanyForPipeline {
  id: string;
  name: string;
  status: CompanyStatus;
  corporateUrl: string | null;
  estimatedLogoDomains?: string[] | null;
  estimatedLogoCandidates?: CompanyLogoCandidate[] | null;
  estimatedFaviconUrl?: string | null;
  nearestDeadline: {
    title: string;
    dueDate: string;
    type: string;
    daysLeft: number;
  } | null;
}

export interface PipelineData {
  columns: {
    key: string;
    label: string;
    color: string;
    companies: CompanyForPipeline[];
  }[];
  totalActive: number;
}

function groupCompaniesBySelectionPhase<T extends CompanyForPipeline>(
  companies: T[],
  options: { includeTerminal?: boolean } = {}
): PipelineData {
  const includeTerminal = options.includeTerminal ?? true;
  const visibleCompanies = includeTerminal
    ? companies
    : companies.filter((company) => !TERMINAL_COMPANY_STATUSES.includes(company.status));

  const columns = COMPANY_SELECTION_PHASE_COLUMNS.map((phase) => ({
    key: phase.key,
    label: phase.label,
    color: phase.color,
    companies: visibleCompanies.filter((company) => getSelectionPhaseForStatus(company.status).key === phase.key),
  }));

  return { columns, totalActive: visibleCompanies.length };
}

export function groupCompaniesByPipeline<T extends CompanyForPipeline>(
  companies: T[]
): PipelineData {
  return groupCompaniesBySelectionPhase(companies, { includeTerminal: false });
}

export function getStatusLabel(status: CompanyStatus): string {
  return getStatusConfig(status).label;
}

export interface CompanyLogoSources {
  primary: string;
  fallbacks: string[];
}

export function getCompanyLogoSources(
  corporateUrl: string | null,
  estimatedFaviconUrl?: string | null,
  companyName?: string,
  estimatedLogoDomains?: string[] | null,
  estimatedLogoCandidates?: CompanyLogoCandidate[] | null
): CompanyLogoSources | null {
  const sources: string[] = [];
  const logoCandidates = normalizeLogoCandidates(estimatedLogoCandidates, estimatedLogoDomains);
  const domains = normalizeLogoDomains(logoCandidates, estimatedLogoDomains, corporateUrl);
  const nameCandidates = logoCandidates.filter((candidate) => candidate.kind === "allowlisted-name");
  const officialAssets = logoCandidates.filter((candidate) => candidate.kind === "official-asset");

  for (const candidate of officialAssets) {
    sources.push(buildLogoProxyUrl({ provider: "official", asset: candidate.assetKey }));
  }

  for (const domain of domains) {
    sources.push(buildLogoProxyUrl({ provider: "logo-dev", domain }));
    sources.push(buildLogoProxyUrl({ provider: "brandfetch", domain }));
  }

  if (domains.length === 0) {
    for (const candidate of nameCandidates) {
      sources.push(buildLogoProxyUrl({ provider: "logo-dev-name", nameKey: candidate.nameKey }));
      sources.push(buildLogoProxyUrl({ provider: "brandfetch-name", nameKey: candidate.nameKey }));
    }
    const normalizedName = normalizeCompanyLogoName(companyName);
    if (normalizedName) {
      sources.push(buildLogoProxyUrl({ provider: "logo-dev-name", name: normalizedName }));
      sources.push(buildLogoProxyUrl({ provider: "brandfetch-name", name: normalizedName }));
    }
  }

  void estimatedFaviconUrl;

  const uniqueSources = Array.from(new Set(sources));
  const [primary, ...fallbacks] = uniqueSources;
  return primary ? { primary, fallbacks } : null;
}

function buildLogoProxyUrl(input: {
  provider: CompanyLogoProvider;
  asset?: string;
  domain?: string;
  nameKey?: string;
  name?: string;
}): string {
  const params = new URLSearchParams({ provider: input.provider });
  if (input.asset) params.set("asset", input.asset);
  if (input.domain) params.set("domain", input.domain);
  if (input.nameKey) params.set("nameKey", input.nameKey);
  if (input.name) params.set("name", input.name);
  params.set("policy", "official-logo-v2");
  return `/api/company-logos?${params.toString()}`;
}

function normalizeLogoCandidates(
  estimatedLogoCandidates: CompanyLogoCandidate[] | null | undefined,
  estimatedLogoDomains: string[] | null | undefined,
): CompanyLogoCandidate[] {
  if (estimatedLogoCandidates?.length) {
    return estimatedLogoCandidates.filter(isUsableLogoCandidate);
  }

  return (estimatedLogoDomains ?? [])
    .map(normalizeDomainCandidate)
    .filter((domain): domain is string => Boolean(domain))
    .map((domain) => ({
      kind: "domain",
      domain,
      source: "mapping.logo_domains",
      confidence: "high",
    } satisfies CompanyLogoCandidate));
}

function isUsableLogoCandidate(candidate: CompanyLogoCandidate): boolean {
  if (candidate.kind === "official-asset") return candidate.assetKey.length > 0;
  if (candidate.kind === "allowlisted-name") return candidate.confidence === "high" && candidate.nameKey.trim().length > 0;
  return Boolean(normalizeDomainCandidate(candidate.domain));
}

function normalizeLogoDomains(
  candidates: CompanyLogoCandidate[],
  estimatedLogoDomains: string[] | null | undefined,
  corporateUrl: string | null | undefined,
): string[] {
  const storedDomains = Array.from(
    new Set([
      ...candidates
        .filter((candidate): candidate is Extract<CompanyLogoCandidate, { kind: "domain" }> => candidate.kind === "domain")
        .map((candidate) => normalizeDomainCandidate(candidate.domain)),
      ...(estimatedLogoDomains ?? []).map(normalizeDomainCandidate),
    ].filter((domain): domain is string => Boolean(domain))),
  );

  if (storedDomains.length > 0) {
    return storedDomains;
  }

  const corporateDomain = normalizeDomainCandidate(corporateUrl ?? null);
  return corporateDomain ? [corporateDomain] : [];
}

function normalizeDomainCandidate(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const parsed = new URL(domain.includes("://") ? domain : `https://${domain}`);
    return LOGO_DOMAIN_PATTERN.test(parsed.hostname) ? parsed.hostname : null;
  } catch {
    return null;
  }
}

function normalizeCompanyLogoName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

const AVATAR_COLORS = [
  "bg-red-100 text-red-700",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
  "bg-cyan-100 text-cyan-700",
] as const;

export function getCompanyAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
