import { guardedFetch, validatePublicUrl } from "@/lib/security/public-url";

const POLICY_VERSION = "2026-03-22";
const DEFAULT_USER_AGENT = "ShukatsuPassBot/1.0 (+https://www.shupass.jp)";

const LOGIN_SIGNAL_PATTERN =
  /(^|[/?#._-])(mypage|login|signin|sign-in|auth|account|session)([/?#._-]|$)/i;
const TERMS_LINK_PATTERN =
  /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const TERMS_TEXT_PATTERN =
  /(利用規約|terms|legal|site\s*policy|サイトポリシー|policy)/i;
const PROHIBITED_TERMS_PATTERN =
  /(スクレイピング|クローリング|自動取得|bot|robot|automated access|data mining|data collection)/i;
const NEGATIVE_TERMS_CONTEXT_PATTERN =
  /(禁止|禁じ|してはならない|認めません|不可|prohibited|must not|may not|forbidden|without prior written consent)/i;
const FALLBACK_TERMS_PATHS = [
  "/terms",
  "/terms/",
  "/legal",
  "/legal/",
  "/policy",
  "/policy/",
];

export type PublicSourceComplianceStatus = "allowed" | "warning" | "blocked";
export type PublicSourceRobotsStatus = "allowed" | "disallowed" | "missing" | "error";
export type PublicSourceTermsStatus = "allowed" | "blocked" | "unknown";

export interface PublicSourceCheckResult {
  url: string;
  status: PublicSourceComplianceStatus;
  reasons: string[];
  robotsStatus: PublicSourceRobotsStatus;
  termsStatus: PublicSourceTermsStatus;
  checkedAt: string;
  policyVersion: string;
}

export interface PublicSourceBatchResult {
  results: PublicSourceCheckResult[];
  allowedUrls: string[];
  warningResults: PublicSourceCheckResult[];
  blockedResults: PublicSourceCheckResult[];
}

function buildResult(
  url: string,
  partial: Pick<PublicSourceCheckResult, "status" | "reasons" | "robotsStatus" | "termsStatus">,
): PublicSourceCheckResult {
  return {
    url,
    checkedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    ...partial,
  };
}

function isBlockedByLoginSignals(url: URL): boolean {
  const haystack = `${url.hostname}${url.pathname}${url.search}${url.hash}`;
  return LOGIN_SIGNAL_PATTERN.test(haystack);
}

function extractTermsLinks(html: string, baseUrl: URL): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(TERMS_LINK_PATTERN)) {
    const href = match[1];
    const label = match[2]?.replace(/<[^>]+>/g, " ") ?? "";
    if (!href || !TERMS_TEXT_PATTERN.test(`${href} ${label}`)) {
      continue;
    }
    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!links.includes(absolute)) {
        links.push(absolute);
      }
    } catch {
      continue;
    }
  }
  return links;
}

function termsPageProhibitsAutomation(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!PROHIBITED_TERMS_PATTERN.test(normalized)) {
    return false;
  }
  return NEGATIVE_TERMS_CONTEXT_PATTERN.test(normalized);
}

async function fetchText(url: string): Promise<Response> {
  return guardedFetch(url, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
    },
  });
}

function robotsAllowsPath(robotsText: string, pathname: string): boolean {
  const lines = robotsText.split(/\r?\n/);
  let appliesToAll = false;
  const disallowRules: string[] = [];
  const allowRules: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [fieldRaw, ...valueParts] = line.split(":");
    const field = fieldRaw?.trim().toLowerCase();
    const value = valueParts.join(":").trim();
    if (!field) continue;
    if (field === "user-agent") {
      appliesToAll = value === "*";
      continue;
    }
    if (!appliesToAll) {
      continue;
    }
    if (field === "disallow") {
      disallowRules.push(value);
    }
    if (field === "allow") {
      allowRules.push(value);
    }
  }

  const bestAllow = allowRules
    .filter((rule) => rule && pathname.startsWith(rule))
    .sort((a, b) => b.length - a.length)[0];
  const bestDisallow = disallowRules
    .filter((rule) => rule && pathname.startsWith(rule))
    .sort((a, b) => b.length - a.length)[0];

  if (!bestDisallow) {
    return true;
  }
  if (!bestAllow) {
    return false;
  }
  return bestAllow.length >= bestDisallow.length;
}

async function checkRobots(url: URL): Promise<{
  robotsStatus: PublicSourceRobotsStatus;
  reason?: string;
}> {
  try {
    const robotsUrl = new URL("/robots.txt", url.origin).toString();
    const response = await fetchText(robotsUrl);
    if (response.status === 404) {
      return { robotsStatus: "missing" };
    }
    if (!response.ok) {
      return {
        robotsStatus: "error",
        reason: "robots.txt を確認できないため取得できません",
      };
    }

    const robotsText = await response.text();
    if (!robotsAllowsPath(robotsText, url.pathname || "/")) {
      return {
        robotsStatus: "disallowed",
        reason: "robots.txt で自動取得が許可されていません",
      };
    }
    return { robotsStatus: "allowed" };
  } catch {
    return {
      robotsStatus: "error",
      reason: "robots.txt を確認できないため取得できません",
    };
  }
}

async function resolveTermsCandidateUrls(url: URL): Promise<string[]> {
  const candidates: string[] = [];
  try {
    const response = await fetchText(url.origin);
    if (response.ok) {
      const html = await response.text();
      for (const link of extractTermsLinks(html, url)) {
        if (!candidates.includes(link)) {
          candidates.push(link);
        }
      }
    }
  } catch {
    // Fall through to static paths
  }

  for (const path of FALLBACK_TERMS_PATHS) {
    const candidate = new URL(path, url.origin).toString();
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function checkTerms(url: URL): Promise<{
  termsStatus: PublicSourceTermsStatus;
  reason?: string;
}> {
  const candidates = await resolveTermsCandidateUrls(url);
  let sawReachableTermsPage = false;

  for (const candidate of candidates) {
    try {
      const response = await fetchText(candidate);
      if (response.status === 404) {
        continue;
      }
      if (!response.ok) {
        continue;
      }
      sawReachableTermsPage = true;
      const text = await response.text();
      if (termsPageProhibitsAutomation(text)) {
        return {
          termsStatus: "blocked",
          reason: "利用規約で自動取得が禁止されているため取得できません",
        };
      }
      return { termsStatus: "allowed" };
    } catch {
      continue;
    }
  }

  return {
    termsStatus: "unknown",
    reason: sawReachableTermsPage
      ? "要確認: 利用規約を確認してください。"
      : "要確認: 利用規約を確認してください。",
  };
}

export async function checkPublicSourceCompliance(input: string): Promise<PublicSourceCheckResult> {
  const validation = await validatePublicUrl(input);
  if (!validation.allowed || !validation.url) {
    return buildResult(input, {
      status: "blocked",
      reasons: [validation.userMessage || "無効なURLです"],
      robotsStatus: "error",
      termsStatus: "unknown",
    });
  }
  const url = validation.url;

  if (isBlockedByLoginSignals(url)) {
    return buildResult(url.toString(), {
      status: "blocked",
      reasons: ["ログインが必要なURLです"],
      robotsStatus: "error",
      termsStatus: "unknown",
    });
  }

  const blockedReasons: string[] = [];
  const warningReasons: string[] = [];
  const robots = await checkRobots(url);
  if (robots.reason) {
    blockedReasons.push(robots.reason);
  }

  const terms = await checkTerms(url);
  if (terms.reason) {
    if (terms.termsStatus === "blocked") {
      blockedReasons.push(terms.reason);
    } else if (terms.termsStatus === "unknown") {
      warningReasons.push(terms.reason);
    }
  }

  const status: PublicSourceComplianceStatus =
    blockedReasons.length > 0
      ? "blocked"
      : warningReasons.length > 0
        ? "warning"
        : "allowed";

  return buildResult(url.toString(), {
    status,
    reasons: status === "warning" ? warningReasons : blockedReasons,
    robotsStatus: robots.robotsStatus,
    termsStatus: terms.termsStatus,
  });
}

export async function filterAllowedPublicSourceUrls(urls: string[]): Promise<PublicSourceBatchResult> {
  const results: PublicSourceCheckResult[] = [];
  for (const url of urls) {
    results.push(await checkPublicSourceCompliance(url));
  }
  return {
    results,
    allowedUrls: results.filter((result) => result.status !== "blocked").map((result) => result.url),
    warningResults: results.filter((result) => result.status === "warning"),
    blockedResults: results.filter((result) => result.status === "blocked"),
  };
}

export function getPrimaryComplianceReason(result: Pick<PublicSourceCheckResult, "reasons">): string {
  return result.reasons[0] || "公開ページのみ取得できます。";
}
