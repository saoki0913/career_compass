import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

interface SearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "other";
}

interface BackendSearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  source_type: "official" | "job_site" | "other";
}

interface SearchCorporateResponse {
  candidates: SearchCandidate[];
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
        const candidates: SearchCandidate[] = data.candidates.map((c) => ({
          url: c.url,
          title: c.title,
          snippet: c.snippet,
          confidence: c.confidence,
          sourceType: c.source_type,
        }));
        return NextResponse.json({ candidates } as SearchCorporateResponse);
      }
    } catch (e) {
      console.log("FastAPI not available for corporate search");
    }

    return NextResponse.json({ candidates: [] } as SearchCorporateResponse);
  } catch (error) {
    console.error("Error searching corporate pages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
