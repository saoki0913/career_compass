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
import { companies, companyPdfIngestJobs, userProfiles } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import {
  parseCorporateInfoSources,
  serializeCorporateInfoSources,
  type CorporateInfoSource,
} from "@/lib/company-info/sources";
import { deleteSupabaseObject } from "@/lib/storage/supabase-storage";
import { CORPORATE_DELETE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";

// FastAPI backend URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

interface DeleteByUrlsResult {
  success: boolean;
  company_id: string;
  urls_deleted: string[];
  chunks_deleted: number;
  errors: string[];
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

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CORPORATE_DELETE_RATE_LAYERS],
      authUser.userId,
      null,
      "companies_delete_corporate_urls"
    );
    if (rateLimited) {
      return rateLimited;
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
    const existingUrls = parseCorporateInfoSources(company.corporateInfoUrls);
    const urlsToDeleteSet = new Set(urls);
    const updatedUrls = existingUrls.filter(
      (urlInfo) => !urlsToDeleteSet.has(urlInfo.url)
    );

    const pendingJobs = urls.length
      ? await db
          .select()
          .from(companyPdfIngestJobs)
          .where(
            and(
              eq(companyPdfIngestJobs.companyId, companyId),
              inArray(companyPdfIngestJobs.sourceUrl, urls)
            )
          )
      : [];

    await db.transaction(async (tx) => {
      await tx
        .update(companies)
        .set({
          corporateInfoUrls: serializeCorporateInfoSources(updatedUrls as CorporateInfoSource[]),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      if (pendingJobs.length > 0) {
        await tx
          .delete(companyPdfIngestJobs)
          .where(
            and(
              eq(companyPdfIngestJobs.companyId, companyId),
              inArray(
                companyPdfIngestJobs.id,
                pendingJobs.map((job) => job.id)
              )
            )
          );
      }
    });

    for (const job of pendingJobs) {
      try {
        await deleteSupabaseObject({
          bucket: job.storageBucket,
          path: job.storagePath,
        });
      } catch (error) {
        console.error("Failed to delete deferred PDF object:", error);
      }
    }

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
