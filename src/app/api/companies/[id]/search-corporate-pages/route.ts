import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { readGuestDeviceToken } from "@/lib/auth/guest-cookie";
import {
  applyPublicSourceComplianceToCandidates,
  filterAllowedPublicSourceUrls,
} from "@/lib/company-info/source-compliance";
import { isCompanySearchMockFallbackAllowed } from "@/bff/company-search/fallback";
import { COMPANY_SEARCH_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { createCompanyCareerPrincipal } from "@/lib/fastapi/career-principal";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { logError } from "@/lib/logger";

interface SearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  parentAllowed?: boolean;
  complianceStatus?: "allowed" | "warning" | "blocked";
  complianceReasons?: string[];
  requiresUserConfirmation?: boolean;
}

interface BackendSearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  source_type: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relation_company_name?: string | null;
  parent_allowed?: boolean;
}

interface SearchCorporateResponse {
  candidates: SearchCandidate[];
}

async function filterCompliantCandidates(candidates: SearchCandidate[]): Promise<SearchCandidate[]> {
  const compliance = await filterAllowedPublicSourceUrls(candidates.map((candidate) => candidate.url));
  return applyPublicSourceComplianceToCandidates(candidates, compliance);
}

function isRootPath(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
}

function hasEmployeeInterviewSignal(candidate: Pick<SearchCandidate, "url" | "title" | "snippet">): boolean {
  return /(interview|voice|people|member|staff|先輩社員|社員の声|働く人)/i.test(
    `${candidate.url} ${candidate.title} ${candidate.snippet ?? ""}`,
  );
}

function resolveSearchTypeFromContentType(contentType?: string): "ir" | "about" {
  if (!contentType) {
    return "about";
  }
  if (contentType === "ir_materials" || contentType === "midterm_plan") {
    return "ir";
  }
  return "about";
}

function extractPreferredDomain(corporateUrl?: string | null): string | null {
  if (!corporateUrl) {
    return null;
  }
  try {
    const url = new URL(corporateUrl);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANY_CORPORATE_SEARCH_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "company-corporate-search-auth",
      });
    }
    let company;
    let graduationYear: number | null = null;
    let principalPlan: "guest" | "free" | "standard" | "pro" = "guest";
    if (identity.userId) {
      company = (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.userId, identity.userId)))
        .limit(1))[0];

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, identity.userId))
        .limit(1);
      graduationYear = profile?.graduationYear || null;
      principalPlan = (profile?.plan || "free") as "free" | "standard" | "pro";
    } else if (identity.guestId) {
      company = (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.guestId, identity.guestId)))
        .limit(1))[0];
    }

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_CORPORATE_SEARCH_NOT_FOUND",
        userMessage: "企業が見つかりませんでした。",
        action: "一覧に戻って、対象の企業を選び直してください。",
        developerMessage: "Company not found",
        logContext: "company-corporate-search-not-found",
      });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...COMPANY_SEARCH_RATE_LAYERS],
      identity.userId,
      identity.userId ? null : readGuestDeviceToken(request),
      "companies_search_corporate_pages"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => ({}));
    const customQuery = body.customQuery as string | undefined;
    const contentType = body.contentType as string | undefined;  // 9 content types for optimized search
    const allowSnippetMatch = body.allowSnippetMatch as boolean | undefined;
    const cacheMode = body.cacheMode as string | undefined;
    const requestedGraduationYear = body.graduationYear as number | undefined;
    const searchType = resolveSearchTypeFromContentType(contentType);

    const preferredDomain = extractPreferredDomain(company.corporateUrl);
    if (requestedGraduationYear) {
      graduationYear = requestedGraduationYear;
    }

    try {
      const response = await fetchFastApiWithPrincipal("/company-info/search-corporate-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: company.id,
            company_name: company.name,
            search_type: searchType,
            content_type: contentType,  // Pass ContentType for optimized search
            custom_query: customQuery,
            preferred_domain: preferredDomain,
            max_results: 10,
            strict_company_match: true,
            graduation_year: graduationYear || undefined,
            allow_snippet_match: allowSnippetMatch ?? false,
            cache_mode: cacheMode,
          }),
          principal: createCompanyCareerPrincipal({
            identity,
            companyId: company.id,
            plan: principalPlan,
          }),
        });

      if (response.ok) {
        const data: { candidates: BackendSearchCandidate[] } = await response.json();
        // Convert snake_case to camelCase
        const filteredCandidates = await filterCompliantCandidates(
          data.candidates.map((c) => ({
            url: c.url,
            title: c.title,
            snippet: c.snippet,
            confidence: c.confidence,
            sourceType: c.source_type,
            relationCompanyName: c.relation_company_name ?? null,
            parentAllowed: c.parent_allowed === true,
          }))
        );
        const candidates = filteredCandidates.filter((candidate) => {
          if (contentType !== "employee_interviews") {
            return true;
          }
          return !isRootPath(candidate.url) && hasEmployeeInterviewSignal(candidate);
        });
        return NextResponse.json({ candidates } as SearchCorporateResponse);
      }
    } catch (error) {
      logError("company-corporate-search-fastapi-fallback", error);
    }

    if (!isCompanySearchMockFallbackAllowed()) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "COMPANY_CORPORATE_SEARCH_UPSTREAM_UNAVAILABLE",
        userMessage: "企業サイト候補を検索できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        developerMessage: "Company corporate search upstream failed",
        logContext: "company-corporate-search-upstream-unavailable",
      });
    }

    return NextResponse.json({ candidates: [] } as SearchCorporateResponse);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_CORPORATE_SEARCH_FAILED",
      userMessage: "企業サイト候補を検索できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to search corporate pages",
      logContext: "company-search-corporate-pages",
    });
  }
}
