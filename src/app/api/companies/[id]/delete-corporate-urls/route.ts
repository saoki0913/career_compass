/**
 * Company Corporate URL Delete API
 *
 * DELETE: Delete registered URLs and their associated RAG data
 * - Validates user authentication (guests not allowed)
 * - Calls FastAPI backend to delete RAG chunks by source URLs
 * - Updates company record to remove URLs
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

// FastAPI backend URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

interface CorporateInfoUrl {
  url: string;
  type?: "ir" | "business" | "about" | "general";
  contentType?: string;
  secondaryContentTypes?: string[];
  fetchedAt?: string;
}

interface DeleteByUrlsResult {
  success: boolean;
  company_id: string;
  urls_deleted: string[];
  chunks_deleted: number;
  errors: string[];
}

function parseCorporateInfoUrls(
  raw: string | null | undefined
): CorporateInfoUrl[] {
  if (!raw) {
    return [];
  }
  // Guard against data corruption where column name is stored as value
  if (raw === "corporate_info_urls") {
    console.warn(
      "corporateInfoUrls contains column name instead of JSON - data corruption detected"
    );
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const { url } = entry as Partial<CorporateInfoUrl>;
      return typeof url === "string";
      })
      .map((entry) => {
        const urlEntry = entry as CorporateInfoUrl;
        if (!Array.isArray(urlEntry.secondaryContentTypes)) {
          urlEntry.secondaryContentTypes = [];
        } else {
          urlEntry.secondaryContentTypes = urlEntry.secondaryContentTypes.filter(
            (item): item is string => typeof item === "string"
          );
        }
        return urlEntry;
      }) as CorporateInfoUrl[];
  } catch (error) {
    console.warn("Invalid corporateInfoUrls JSON, defaulting to empty.", error);
    return [];
  }
}

async function getAuthenticatedUser(): Promise<{
  userId: string;
  plan: "free" | "standard" | "pro";
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return null;
  }

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);

  return {
    userId: session.user.id,
    plan: (profile?.plan || "free") as "free" | "standard" | "pro",
  };
}

async function verifyCompanyAccess(
  companyId: string,
  userId: string
): Promise<{ valid: boolean; company?: typeof companies.$inferSelect }> {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .limit(1);

  return { valid: !!company, company };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    // Get request body
    const body = await request.json();
    const { urls } = body as { urls: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "削除するURLを指定してください" },
        { status: 400 }
      );
    }

    // Authenticate user (guests not allowed)
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "この機能を利用するにはログインが必要です" },
        { status: 401 }
      );
    }

    const { userId } = authUser;

    // Verify company access
    const access = await verifyCompanyAccess(companyId, userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = access.company;

    // Call FastAPI backend to delete RAG chunks by URLs
    let deleteResult: DeleteByUrlsResult;
    try {
      const response = await fetch(
        `${BACKEND_URL}/company-info/rag/${companyId}/delete-by-urls`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Backend request failed");
      }

      deleteResult = await response.json();
    } catch (error) {
      console.error("Backend delete error:", error);
      return NextResponse.json(
        {
          error: "RAGデータの削除に失敗しました。しばらく後にお試しください。",
        },
        { status: 503 }
      );
    }

    // Update company record - remove deleted URLs
    const existingUrls = parseCorporateInfoUrls(company.corporateInfoUrls);
    const urlsToDeleteSet = new Set(urls);
    const updatedUrls = existingUrls.filter(
      (urlInfo) => !urlsToDeleteSet.has(urlInfo.url)
    );

    await db
      .update(companies)
      .set({
        corporateInfoUrls: JSON.stringify(updatedUrls),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    return NextResponse.json({
      success: deleteResult.success,
      urlsDeleted: deleteResult.urls_deleted,
      chunksDeleted: deleteResult.chunks_deleted,
      updatedUrls,
      errors: deleteResult.errors,
    });
  } catch (error) {
    console.error("Error deleting corporate URLs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
