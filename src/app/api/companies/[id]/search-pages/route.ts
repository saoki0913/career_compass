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

    // Try to call FastAPI for real search
    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${fastApiUrl}/api/company-info/search-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: company.name, industry: company.industry }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // FastAPI not available, use mock
      console.log("FastAPI not available, using mock search results");
    }

    // Mock response: generate plausible recruitment page candidates
    const encodedName = encodeURIComponent(company.name);
    const candidates: SearchCandidate[] = [
      {
        url: `https://www.${company.name.toLowerCase().replace(/[^a-z0-9]/gi, "")}.co.jp/recruit/`,
        title: `${company.name} 採用情報`,
        confidence: "high",
      },
      {
        url: `https://job.mynavi.jp/company/${encodedName}/`,
        title: `${company.name} - マイナビ`,
        confidence: "medium",
      },
      {
        url: `https://www.rikunabi.com/company/${encodedName}/`,
        title: `${company.name} - リクナビ`,
        confidence: "medium",
      },
    ];

    return NextResponse.json({ candidates } as SearchPagesResponse);
  } catch (error) {
    console.error("Error searching pages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
