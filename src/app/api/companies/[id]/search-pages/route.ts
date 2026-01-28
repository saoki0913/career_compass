import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

interface SearchCandidate {
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
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
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const company = await db.select().from(companies).where(eq(companies.id, id)).get();
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Get custom query from request body
    const body = await request.json().catch(() => ({}));
    const customQuery = body.customQuery as string | undefined;

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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
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
      },
      {
        url: `https://www.${cleanName}.co.jp/careers/`,
        title: `${company.name} キャリア採用`,
        confidence: "high",
      },
      {
        url: `https://job.mynavi.jp/search/?searchButton=1&keyword=${encodedName}`,
        title: `${company.name} - マイナビ`,
        confidence: "medium",
      },
      {
        url: `https://job.rikunabi.com/2026/company/${cleanName}/`,
        title: `${company.name} - リクナビ2026`,
        confidence: "medium",
      },
      {
        url: `https://www.onecareer.jp/companies/${cleanName}`,
        title: `${company.name} - ONE CAREER`,
        confidence: "medium",
      },
      {
        url: `https://unistyle.jp/companies/${cleanName}`,
        title: `${company.name} - Unistyle`,
        confidence: "medium",
      },
      {
        url: `https://www.${cleanName}.co.jp/company/ir/`,
        title: `${company.name} IR情報`,
        confidence: "low",
      },
      {
        url: `https://www.${cleanName}.co.jp/about/`,
        title: `${company.name} 会社概要`,
        confidence: "low",
      },
      {
        url: `https://www.openwork.jp/company/${cleanName}`,
        title: `${company.name} - OpenWork`,
        confidence: "low",
      },
      {
        url: `https://www.vorkers.com/company/${cleanName}`,
        title: `${company.name} - 口コミ`,
        confidence: "low",
      },
    ];

    return NextResponse.json({ candidates } as SearchPagesResponse);
  } catch (error) {
    console.error("Error searching pages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
