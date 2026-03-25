import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { filterAllowedPublicSourceUrls } from "@/lib/company-info/source-compliance";
import { COMPANY_SEARCH_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";

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
  const complianceMap = new Map(compliance.results.map((result) => [result.url, result]));
  return candidates
    .map((candidate) => {
      const result = complianceMap.get(candidate.url);
      if (!result) {
        return candidate;
      }
      return {
        ...candidate,
        complianceStatus: result.status,
        complianceReasons: result.reasons,
      } satisfies SearchCandidate;
    })
    .filter((candidate) => candidate.complianceStatus !== "blocked");
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
    const session = await auth.api.getSession({ headers: await headers() });
    let company;
    let graduationYear: number | null = null;
    if (session?.user?.id) {
      company = (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.userId, session.user.id)))
        .limit(1))[0];

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, session.user.id))
        .limit(1);
      graduationYear = profile?.graduationYear || null;
    } else {
      const deviceToken = request.headers.get("x-device-token");
      if (!deviceToken) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      const guest = await getGuestUser(deviceToken);
      if (!guest) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      company = (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.guestId, guest.id)))
        .limit(1))[0];
    }

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...COMPANY_SEARCH_RATE_LAYERS],
      session?.user?.id ?? null,
      session?.user?.id ? null : request.headers.get("x-device-token"),
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

    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${fastApiUrl}/company-info/search-corporate-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
    } catch {
      console.log("FastAPI not available for corporate search");
    }

    return NextResponse.json({ candidates: [] } as SearchCorporateResponse);
  } catch (error) {
    console.error("Error searching corporate pages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
