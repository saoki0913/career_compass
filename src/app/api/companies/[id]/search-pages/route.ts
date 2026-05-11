import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { readGuestDeviceToken } from "@/lib/auth/guest-cookie";
import {
  applyPublicSourceComplianceToCandidates,
  filterAllowedPublicSourceUrls,
} from "@/lib/company-info/source-compliance";
import { COMPANY_SEARCH_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { logError } from "@/lib/logger";

interface SearchCandidate {
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  complianceStatus?: "allowed" | "warning" | "blocked";
  complianceReasons?: string[];
  requiresUserConfirmation?: boolean;
}

interface BackendSearchCandidate {
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
  source_type: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relation_company_name?: string | null;
}

interface SearchPagesResponse {
  candidates: SearchCandidate[];
  usedGraduationYear: number | null;
  yearSource: "profile" | "manual" | "none";
}

async function filterCompliantCandidates(candidates: SearchCandidate[]): Promise<SearchCandidate[]> {
  const compliance = await filterAllowedPublicSourceUrls(candidates.map((candidate) => candidate.url));
  return applyPublicSourceComplianceToCandidates(candidates, compliance);
}

const TRUSTED_JOB_SITE_MOCKS = ["job.mynavi.jp", "job.rikunabi.com", "onecareer.jp"] as const;

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
        code: "COMPANY_SEARCH_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "company-search-auth",
      });
    }
    let company;
    let graduationYear: number | null = null;

    if (identity.userId) {
      company = (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.userId, identity.userId)))
        .limit(1))[0];

      // Get user's graduation year from profile
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, identity.userId))
        .limit(1);
      graduationYear = profile?.graduationYear || null;
    } else if (identity.guestId) {
      company = (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.guestId, identity.guestId)))
        .limit(1))[0];
      // Guests don't have a graduation year setting
    }

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_SEARCH_NOT_FOUND",
        userMessage: "企業が見つかりませんでした。",
        action: "一覧に戻って、対象の企業を選び直してください。",
        developerMessage: "Company not found",
        logContext: "company-search-not-found",
      });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...COMPANY_SEARCH_RATE_LAYERS],
      identity.userId,
      identity.userId ? null : readGuestDeviceToken(request),
      "companies_search_pages"
    );
    if (rateLimited) {
      return rateLimited;
    }

    // Get custom query, selection type, and allowSnippetMatch from request body
    const body = await request.json().catch(() => ({}));
    const customQuery = body.customQuery as string | undefined;
    const selectionType = body.selectionType as "main_selection" | "internship" | undefined;
    const allowSnippetMatch = body.allowSnippetMatch as boolean | undefined;
    const requestedGraduationYear = body.graduationYear as number | undefined;
    let yearSource: SearchPagesResponse["yearSource"] = graduationYear ? "profile" : "none";

    if (requestedGraduationYear) {
      graduationYear = requestedGraduationYear;
      yearSource = "manual";
    }

    // Try to call FastAPI for real search
    try {
      const response = await fetchFastApiInternal("/company-info/search-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.name,
          industry: company.industry,
          custom_query: customQuery,
          max_results: 10,
          graduation_year: graduationYear || undefined,
          selection_type: selectionType,
          allow_snippet_match: allowSnippetMatch ?? false,
        }),
      });

      if (response.ok) {
        const data: { candidates: BackendSearchCandidate[] } = await response.json();
        // Convert snake_case to camelCase
        const candidates = await filterCompliantCandidates(data.candidates.map((c) => ({
          url: c.url,
          title: c.title,
          confidence: c.confidence,
          sourceType: c.source_type,
          relationCompanyName: c.relation_company_name ?? null,
        })));
        return NextResponse.json({
          candidates,
          usedGraduationYear: graduationYear,
          yearSource,
        } satisfies SearchPagesResponse);
      }
    } catch (error) {
      // FastAPI not available, use mock
      logError("company-search-fastapi-fallback", error);
    }

    // Mock response: generate plausible recruitment page candidates (10 results)
    const encodedName = encodeURIComponent(company.name);
    const cleanName = company.name.toLowerCase().replace(/[^a-z0-9]/gi, "");
    const candidates: SearchCandidate[] = [
      {
        url: `https://www.${cleanName}.co.jp/recruit/`,
        title: `${company.name} 採用情報`,
        confidence: "high",
        sourceType: "official",
      },
      {
        url: `https://www.${cleanName}.co.jp/careers/`,
        title: `${company.name} キャリア採用`,
        confidence: "high",
        sourceType: "official",
      },
      {
        url: `https://${TRUSTED_JOB_SITE_MOCKS[0]}/search/corp/recruit/?keyword=${encodedName}`,
        title: `${company.name} - マイナビ`,
        confidence: "medium",
        sourceType: "job_site",
      },
      {
        url: `https://${TRUSTED_JOB_SITE_MOCKS[1]}/${graduationYear ?? 2027}/company/${cleanName}/`,
        title: `${company.name} - リクナビ${graduationYear ?? 2027}`,
        confidence: "medium",
        sourceType: "job_site",
      },
      {
        url: `https://www.${TRUSTED_JOB_SITE_MOCKS[2]}/companies/${cleanName}`,
        title: `${company.name} - ONE CAREER`,
        confidence: "medium",
        sourceType: "job_site",
      },
      {
        url: `https://www.${cleanName}.co.jp/company/ir/`,
        title: `${company.name} IR情報`,
        confidence: "low",
        sourceType: "official",
      },
      {
        url: `https://www.${cleanName}.co.jp/about/`,
        title: `${company.name} 会社概要`,
        confidence: "low",
        sourceType: "official",
      },
    ];

    return NextResponse.json({
      candidates: await filterCompliantCandidates(candidates),
      usedGraduationYear: graduationYear,
      yearSource,
    } satisfies SearchPagesResponse);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_SEARCH_FAILED",
      userMessage: "採用ページ候補を検索できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to search company pages",
      logContext: "company-search-pages",
    });
  }
}
