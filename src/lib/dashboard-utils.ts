import type { CompanyStatus } from "@/lib/constants/status";
import { getStatusConfig } from "@/lib/constants/status";

export interface PipelineColumn {
  key: string;
  label: string;
  color: string;
  statuses: CompanyStatus[];
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    key: "not_applied",
    label: "未応募",
    color: "slate",
    statuses: ["inbox", "needs_confirmation"],
  },
  {
    key: "es_test",
    label: "ES・テスト",
    color: "blue",
    statuses: ["info_session", "es", "web_test", "coding_test", "case_study", "group_discussion"],
  },
  {
    key: "interview",
    label: "面接中",
    color: "purple",
    statuses: ["interview_1", "interview_2", "final_interview"],
  },
  {
    key: "waiting",
    label: "結果待ち",
    color: "amber",
    statuses: ["waiting_result"],
  },
  {
    key: "offer",
    label: "内定",
    color: "green",
    statuses: ["offer", "summer_pass", "autumn_pass", "winter_pass"],
  },
];

export const EXCLUDED_STATUSES: CompanyStatus[] = [
  "es_rejected",
  "gd_rejected",
  "interview_1_rejected",
  "interview_2_rejected",
  "withdrawn",
  "archived",
];

interface CompanyForPipeline {
  id: string;
  name: string;
  status: CompanyStatus;
  corporateUrl: string | null;
  estimatedLogoDomains?: string[] | null;
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

export function groupCompaniesByPipeline<T extends CompanyForPipeline>(
  companies: T[]
): PipelineData {
  const active = companies.filter(
    (c) => !EXCLUDED_STATUSES.includes(c.status)
  );

  const columns = PIPELINE_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    color: col.color,
    companies: active.filter((c) =>
      (col.statuses as readonly string[]).includes(c.status)
    ),
  }));

  return { columns, totalActive: active.length };
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
  estimatedLogoDomains?: string[] | null
): CompanyLogoSources | null {
  const sources: string[] = [];
  const logoDomains = extractLogoDomains(corporateUrl, estimatedFaviconUrl, estimatedLogoDomains);
  const logoDevToken = getLogoDevToken();
  const brandfetchClientId = getBrandfetchClientId();

  if (logoDevToken) {
    for (const domain of logoDomains) {
      sources.push(
        `https://img.logo.dev/${domain}?token=${encodeURIComponent(logoDevToken)}&size=128&format=png&retina=true&fallback=404`
      );
    }
  }

  if (brandfetchClientId) {
    for (const domain of logoDomains) {
      sources.push(
        `https://cdn.brandfetch.io/domain/${domain}/w/128/h/128/type/icon/fallback/404?c=${encodeURIComponent(brandfetchClientId)}`
      );
    }
  }

  if (logoDevToken && companyName) {
    sources.push(
      `https://img.logo.dev/name/${encodeURIComponent(companyName)}?token=${encodeURIComponent(logoDevToken)}&size=128&format=png&retina=true&fallback=404`
    );
  }

  const directFavicon = normalizeExternalImageUrl(estimatedFaviconUrl);
  if (directFavicon) sources.push(directFavicon);

  for (const domain of logoDomains) {
    sources.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  }
  for (const domain of logoDomains) {
    sources.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  }

  const uniqueSources = Array.from(new Set(sources));
  const [primary, ...fallbacks] = uniqueSources;
  return primary ? { primary, fallbacks } : null;
}

function getLogoDevToken(): string | null {
  const value = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getBrandfetchClientId(): string | null {
  const value = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractLogoDomains(
  corporateUrl: string | null | undefined,
  estimatedFaviconUrl: string | null | undefined,
  estimatedLogoDomains: string[] | null | undefined
): string[] {
  return Array.from(
    new Set([
      ...(estimatedLogoDomains ?? []).map(normalizeDomainCandidate).filter((domain): domain is string => Boolean(domain)),
      extractHostname(corporateUrl),
      extractFaviconServiceDomain(estimatedFaviconUrl),
      extractHostname(estimatedFaviconUrl),
    ].filter((domain): domain is string => Boolean(domain)))
  );
}

function extractFaviconServiceDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.google.com" && parsed.pathname === "/s2/favicons") {
      return parsed.searchParams.get("domain");
    }
    if (parsed.hostname === "icons.duckduckgo.com") {
      const match = parsed.pathname.match(/^\/ip3\/(.+)\.ico$/);
      return match ? match[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

function extractHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeDomainCandidate(domain: string): string | null {
  try {
    const parsed = new URL(domain.includes("://") ? domain : `https://${domain}`);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function normalizeExternalImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
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
