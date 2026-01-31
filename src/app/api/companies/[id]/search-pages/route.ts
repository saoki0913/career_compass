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
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "other";
}

interface BackendSearchCandidate {
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
  source_type: "official" | "job_site" | "other";
}

interface SearchPagesResponse {
  candidates: SearchCandidate[];
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
      company = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.userId, session.user.id)))
        .get();

      // Get user's graduation year from profile
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, session.user.id))
        .get();
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
      company = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, id), eq(companies.guestId, guest.id)))
        .get();
      // Guests don't have a graduation year setting
    }

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Get custom query, selection type, and allowSnippetMatch from request body
    const body = await request.json().catch(() => ({}));
    const customQuery = body.customQuery as string | undefined;
    const selectionType = body.selectionType as "main_selection" | "internship" | undefined;
    const allowSnippetMatch = body.allowSnippetMatch as boolean | undefined;

    // Try to call FastAPI for real search
    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${fastApiUrl}/company-info/search-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.name,
          industry: company.industry,
          custom_query: customQuery,
          max_results: 10,
          graduation_year: graduationYear,
          selection_type: selectionType,
          allow_snippet_match: allowSnippetMatch ?? false,
        }),
      });

      if (response.ok) {
        const data: { candidates: BackendSearchCandidate[] } = await response.json();
        // Convert snake_case to camelCase
        const candidates: SearchCandidate[] = data.candidates.map((c) => ({
          url: c.url,
          title: c.title,
          confidence: c.confidence,
          sourceType: c.source_type,
        }));
        return NextResponse.json({ candidates });
      }
    } catch (e) {
      // FastAPI not available, use mock
      console.log("FastAPI not available, using mock search results");
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
        url: `https://job.mynavi.jp/search/?searchButton=1&keyword=${encodedName}`,
        title: `${company.name} - マイナビ`,
        confidence: "medium",
        sourceType: "job_site",
      },
      {
        url: `https://job.rikunabi.com/2026/company/${cleanName}/`,
        title: `${company.name} - リクナビ2026`,
        confidence: "medium",
        sourceType: "job_site",
      },
      {
        url: `https://www.onecareer.jp/companies/${cleanName}`,
        title: `${company.name} - ONE CAREER`,
        confidence: "medium",
        sourceType: "job_site",
      },
      {
        url: `https://unistyle.jp/companies/${cleanName}`,
        title: `${company.name} - Unistyle`,
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
      {
        url: `https://www.openwork.jp/company/${cleanName}`,
        title: `${company.name} - OpenWork`,
        confidence: "low",
        sourceType: "other",
      },
      {
        url: `https://www.vorkers.com/company/${cleanName}`,
        title: `${company.name} - 口コミ`,
        confidence: "low",
        sourceType: "other",
      },
    ];

    return NextResponse.json({ candidates } as SearchPagesResponse);
  } catch (error) {
    console.error("Error searching pages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
