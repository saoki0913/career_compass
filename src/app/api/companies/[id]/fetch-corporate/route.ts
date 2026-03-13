/**
 * Company Corporate Info Fetch API
 *
 * POST: Fetch and index corporate site pages (IR, business info)
 * - Validates user authentication (guests not allowed)
 * - Checks plan limits
 * - Calls FastAPI backend to crawl and index pages
 * - Updates company record with URLs
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, companyPdfIngestJobs, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import {
  detectContentTypeFromUrl,
  parseCorporateInfoSources,
  serializeCorporateInfoSources,
  type CorporateInfoSource,
} from "@/lib/company-info/sources";

// FastAPI backend URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Page limits by plan
const PAGE_LIMITS = {
  guest: 0,  // Guests cannot use this feature
  free: 10,
  standard: 50,
  pro: 150,
};

interface CrawlResult {
  success: boolean;
  company_id: string;
  pages_crawled: number;
  chunks_stored: number;
  errors: string[];
  url_content_types?: Record<string, string>;
}

async function getAuthenticatedUser(): Promise<{ userId: string; plan: "free" | "standard" | "pro" } | null> {
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
    const { urls, contentType, contentChannel, sourceOrigin } = body as {
      urls: string[];
      contentType?: string; // 9-category content type (e.g., new_grad_recruitment, ir_materials)
      contentChannel?: "corporate_ir" | "corporate_business" | "corporate_general";
      sourceOrigin?: "manual_user" | "prestream_enrichment";
    };
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "URLを指定してください" },
        { status: 400 }
      );
    }
    const contentTypeResolved =
      contentType || detectContentTypeFromUrl(urls[0]) || "corporate_site";
    const contentChannelResolved =
      contentChannel ||
      (contentTypeResolved === "ir_materials" || contentTypeResolved === "midterm_plan"
        ? "corporate_ir"
        : "corporate_general");

    // Authenticate user (guests not allowed)
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "この機能を利用するにはログインが必要です" },
        { status: 401 }
      );
    }

    const { userId, plan } = authUser;

    // Verify company access
    const access = await verifyCompanyAccess(companyId, userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = access.company;

    // Check total page limit per company (not just per request)
    const pageLimit = PAGE_LIMITS[plan];
    const existingUrls = parseCorporateInfoSources(company.corporateInfoUrls);
    const existingUrlSet = new Set(existingUrls.map((u) => u.url));

    const uniqueRequestedUrls = urls
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0 && !existingUrlSet.has(u));

    const remaining = Math.max(0, pageLimit - existingUrlSet.size);
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: `プラン制限: ${plan}プランでは1社あたり最大${pageLimit}ソースまで保存できます（上限に達しています）`,
          limit: pageLimit,
          remaining,
        },
        { status: 402 }
      );
    }
    if (uniqueRequestedUrls.length > remaining) {
      return NextResponse.json(
        {
          error: `プラン制限: ${plan}プランでは1社あたり最大${pageLimit}ソースまで保存できます（残り${remaining}ソース）`,
          limit: pageLimit,
          remaining,
        },
        { status: 402 }
      );
    }

    // Call FastAPI backend to crawl pages
    let crawlResult: CrawlResult;
    try {
    const response = await fetch(`${BACKEND_URL}/company-info/rag/crawl-corporate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          company_name: company.name,
          urls: uniqueRequestedUrls,
          content_channel: contentChannelResolved,
          content_type: contentTypeResolved, // 9-category content type for proper counting
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("[企業情報取得] backend crawl failed", {
          companyId,
          contentType: contentTypeResolved,
          contentChannel: contentChannelResolved,
          urls: uniqueRequestedUrls,
          status: response.status,
          body: errorText,
        });
        throw new Error(errorText || "Backend request failed");
      }

      crawlResult = await response.json();
    } catch (error) {
      console.error("Backend crawl error:", error);
      return NextResponse.json(
        { error: "企業情報の取得に失敗しました。しばらく後にお試しください。" },
        { status: 503 }
      );
    }

    // Update company record with URLs
    const urlContentTypes = crawlResult.url_content_types || {};
    const newUrls: CorporateInfoSource[] = uniqueRequestedUrls
      .map((url) => {
        const resolvedContentType =
          (urlContentTypes[url] as CorporateInfoSource["contentType"]) ||
          (contentTypeResolved as CorporateInfoSource["contentType"]) ||
          detectContentTypeFromUrl(url) ||
          "corporate_site";

        return {
          url,
          kind: "url",
          sourceOrigin: sourceOrigin === "prestream_enrichment" ? "prestream_enrichment" : "manual_user",
          contentType: resolvedContentType,
          secondaryContentTypes: [],
          fetchedAt: new Date().toISOString(),
          status: "completed",
        };
      });

    const updatedUrls = [...existingUrls, ...newUrls];
    const backfilledUrls = updatedUrls.map((entry) => {
      if (entry.contentType) {
        return {
          ...entry,
          secondaryContentTypes: Array.isArray(entry.secondaryContentTypes)
            ? entry.secondaryContentTypes
            : [],
        };
      }
      return {
        ...entry,
        contentType: entry.kind === "upload_pdf"
          ? entry.contentType
          : detectContentTypeFromUrl(entry.url) || "corporate_site",
        secondaryContentTypes: Array.isArray(entry.secondaryContentTypes)
          ? entry.secondaryContentTypes
          : [],
      };
    });

    await db
      .update(companies)
      .set({
        corporateInfoUrls: serializeCorporateInfoSources(backfilledUrls),
        corporateInfoFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    return NextResponse.json({
      success: crawlResult.success,
      pagesCrawled: crawlResult.pages_crawled,
      chunksStored: crawlResult.chunks_stored,
      errors: crawlResult.errors,
      totalUrls: updatedUrls.length,
    });
  } catch (error) {
    console.error("Error fetching corporate info:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Get current corporate info status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    // Authenticate user
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify company access
    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = access.company;

    // Get detailed RAG status from backend
    let ragStatus = {
      has_rag: false,
      total_chunks: 0,
      // Content type counts (9 categories)
      new_grad_recruitment_chunks: 0,
      midcareer_recruitment_chunks: 0,
      corporate_site_chunks: 0,
      ir_materials_chunks: 0,
      ceo_message_chunks: 0,
      employee_interviews_chunks: 0,
      press_release_chunks: 0,
      csr_sustainability_chunks: 0,
      midterm_plan_chunks: 0,
      last_updated: null as string | null,
    };

    try {
      const response = await fetch(
        `${BACKEND_URL}/company-info/rag/status-detailed/${companyId}`
      );
      if (response.ok) {
        ragStatus = await response.json();
      }
    } catch {
      // Ignore errors - return default status
    }

    const corporateInfoUrls = parseCorporateInfoSources(company.corporateInfoUrls);
    const jobs = await db
      .select()
      .from(companyPdfIngestJobs)
      .where(eq(companyPdfIngestJobs.companyId, companyId));

    const jobsBySourceUrl = new Map(jobs.map((job) => [job.sourceUrl, job]));
    const backfilledUrls = corporateInfoUrls.map((entry): CorporateInfoSource => {
      const job = jobsBySourceUrl.get(entry.url);
      const urlBackfilledType =
        entry.contentType ||
        (entry.kind !== "upload_pdf" ? detectContentTypeFromUrl(entry.url) || "corporate_site" : undefined);

      if (!job) {
        return {
          ...entry,
          contentType: urlBackfilledType,
        };
      }

      let secondaryContentTypes = entry.secondaryContentTypes || [];
      if (typeof job.secondaryContentTypes === "string") {
        try {
          const parsedSecondary = JSON.parse(job.secondaryContentTypes);
          if (Array.isArray(parsedSecondary)) {
            secondaryContentTypes = parsedSecondary.filter(
              (value): value is NonNullable<CorporateInfoSource["contentType"]> => typeof value === "string"
            );
          }
        } catch {
          // Ignore invalid JSON in legacy rows.
        }
      }

      return {
        ...entry,
        status: job.status,
        jobId: job.id,
        errorMessage: job.lastError || entry.errorMessage,
        contentType: (job.detectedContentType as CorporateInfoSource["contentType"]) || urlBackfilledType,
        secondaryContentTypes,
        chunksStored: job.chunksStored || entry.chunksStored,
        extractedChars: job.extractedChars || entry.extractedChars,
        extractionMethod: job.extractionMethod || entry.extractionMethod,
        updatedAt: job.updatedAt?.toISOString() || entry.updatedAt,
      };
    });

    if (JSON.stringify(backfilledUrls) !== JSON.stringify(corporateInfoUrls)) {
      await db
        .update(companies)
        .set({
          corporateInfoUrls: serializeCorporateInfoSources(backfilledUrls),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
    }

    return NextResponse.json({
      companyId,
      corporateInfoUrls: backfilledUrls,
      corporateInfoFetchedAt: company.corporateInfoFetchedAt,
      ragStatus: {
        hasRag: ragStatus.has_rag,
        totalChunks: ragStatus.total_chunks,
        // Content type counts (9 categories)
        newGradRecruitmentChunks: ragStatus.new_grad_recruitment_chunks || 0,
        midcareerRecruitmentChunks: ragStatus.midcareer_recruitment_chunks || 0,
        corporateSiteChunks: ragStatus.corporate_site_chunks || 0,
        irMaterialsChunks: ragStatus.ir_materials_chunks || 0,
        ceoMessageChunks: ragStatus.ceo_message_chunks || 0,
        employeeInterviewsChunks: ragStatus.employee_interviews_chunks || 0,
        pressReleaseChunks: ragStatus.press_release_chunks || 0,
        csrSustainabilityChunks: ragStatus.csr_sustainability_chunks || 0,
        midtermPlanChunks: ragStatus.midterm_plan_chunks || 0,
        lastUpdated: ragStatus.last_updated,
      },
      pageLimit: PAGE_LIMITS[authUser.plan],
    });
  } catch (error) {
    console.error("Error getting corporate info status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
