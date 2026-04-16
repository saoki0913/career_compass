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
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, companyPdfIngestJobs, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import {
  detectContentTypeFromUrl,
  inferTrustedForEsReview,
  isUploadSource,
  parseCorporateInfoSources,
  serializeCorporateInfoSources,
  type CorporateInfoSource,
  type CorporateInfoSourceType,
} from "@/lib/company-info/sources";
import {
  applyCompanyRagUsage,
  getRemainingCompanyRagHtmlFreeUnits,
  getRemainingCompanyRagPdfFreeUnits,
} from "@/lib/company-info/usage";
import {
  calculateCorporateCrawlUnits,
  getCompanyRagSourceLimit,
} from "@/lib/company-info/pricing";
import { checkPublicSourceCompliance, filterAllowedPublicSourceUrls } from "@/lib/company-info/source-compliance";
import {
  CORPORATE_MUTATE_RATE_LAYERS,
  STATUS_POLL_RATE_LAYERS,
  enforceRateLimitLayers,
} from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";

// FastAPI backend URL
interface CrawlResult {
  success: boolean;
  company_id: string;
  pages_crawled: number;
  chunks_stored: number;
  errors: string[];
  url_content_types?: Record<string, string>;
  page_routing_summaries?: Record<string, Record<string, unknown>>;
}

interface SourceMetadataInput {
  sourceType?: CorporateInfoSourceType;
  relationCompanyName?: string | null;
  parentAllowed?: boolean;
  trustedForEsReview?: boolean;
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
    const { urls, contentType, contentChannel, sourceMetadata } = body as {
      urls: string[];
      contentType?: string; // 9-category content type (e.g., new_grad_recruitment, ir_materials)
      contentChannel?: "corporate_ir" | "corporate_business" | "corporate_general";
      sourceMetadata?: Record<string, SourceMetadataInput>;
    };
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CORPORATE_SOURCE_URL_REQUIRED",
        userMessage: "URLを指定してください。",
        action: "取得する公開ページURLを入力してください。",
      });
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

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CORPORATE_MUTATE_RATE_LAYERS],
      userId,
      null,
      "companies_fetch_corporate"
    );
    if (rateLimited) {
      return rateLimited;
    }

    // Verify company access
    const access = await verifyCompanyAccess(companyId, userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = access.company;

    // Check total page limit per company (not just per request)
    const pageLimit = getCompanyRagSourceLimit(plan);
    const existingUrls = parseCorporateInfoSources(company.corporateInfoUrls);
    const existingUrlSet = new Set(existingUrls.map((u) => u.url));

    const uniqueRequestedUrls = urls
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0 && !existingUrlSet.has(u));

    const compliance = await filterAllowedPublicSourceUrls(uniqueRequestedUrls);
    if (compliance.blockedResults.length > 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "PUBLIC_SOURCE_BLOCKED",
        userMessage: compliance.blockedResults[0]?.reasons[0] || "公開ページのみ取得できます。",
        action: "公開ページURLのみを選び直してください。",
        extra: {
          blockedUrls: compliance.blockedResults.map((result) => ({
            url: result.url,
            reasons: result.reasons,
          })),
        },
      });
    }

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
      const response = await fetchFastApiWithPrincipal("/company-info/rag/crawl-corporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          company_name: company.name,
          urls: compliance.allowedUrls,
          content_channel: contentChannelResolved,
          content_type: contentTypeResolved, // 9-category content type for proper counting
          billing_plan: plan,
        }),
        principal: {
          scope: "company",
          actor: { kind: "user", id: userId },
          companyId,
          plan,
        },
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
      return createApiErrorResponse(request, {
        status: 503,
        code: "CORPORATE_FETCH_FAILED",
        userMessage: "企業情報の取得に失敗しました。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
      });
    }

    if (!crawlResult.success || crawlResult.pages_crawled <= 0) {
      const backendError =
        crawlResult.errors.find((message) => typeof message === "string" && message.trim().length > 0) ||
        "企業情報の取得に失敗しました。";
      console.error("[企業情報取得] backend crawl reported failure", {
        companyId,
        contentType: contentTypeResolved,
        contentChannel: contentChannelResolved,
        urls: uniqueRequestedUrls,
        errors: crawlResult.errors,
      });
      return createApiErrorResponse(request, {
        status: 503,
        code: "CORPORATE_FETCH_FAILED",
        userMessage: "企業情報の取得に失敗しました。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        developerMessage: backendError,
        extra: {
          backendErrors: crawlResult.errors,
        },
      });
    }

    // Update company record with URLs
    const urlContentTypes = crawlResult.url_content_types || {};
    const pageRoutingSummaries = crawlResult.page_routing_summaries || {};
    const newUrls: CorporateInfoSource[] = uniqueRequestedUrls
      .map((url) => {
        const metadata = sourceMetadata?.[url];
        const resolvedContentType =
          (urlContentTypes[url] as CorporateInfoSource["contentType"]) ||
          (contentTypeResolved as CorporateInfoSource["contentType"]) ||
          detectContentTypeFromUrl(url) ||
          "corporate_site";
        const sourceType = metadata?.sourceType;
        const parentAllowed = metadata?.parentAllowed === true;
        const pdfSummary = pageRoutingSummaries[url];
        const isPdfSource = Boolean(pdfSummary);
        const ingestUnits = isPdfSource && typeof pdfSummary?.ingest_pages === "number"
          ? Math.max(1, Math.floor(Number(pdfSummary.ingest_pages)))
          : 1;

        return {
          url,
          kind: isPdfSource ? "upload_pdf" : "url",
          sourceOrigin: "manual_user",
          contentType: resolvedContentType,
          secondaryContentTypes: [],
          fetchedAt: new Date().toISOString(),
          status: "completed",
          ingestUnits,
          sourceType,
          relationCompanyName:
            typeof metadata?.relationCompanyName === "string" ? metadata.relationCompanyName : undefined,
          parentAllowed,
          trustedForEsReview: inferTrustedForEsReview({
            kind: isPdfSource ? "upload_pdf" : "url",
            url,
            sourceType,
            parentAllowed,
            trustedForEsReview: metadata?.trustedForEsReview,
          }),
          complianceStatus: "allowed",
          complianceReasons: [],
          complianceCheckedAt: new Date().toISOString(),
          policyVersion: "2026-03-22",
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
          trustedForEsReview: inferTrustedForEsReview(entry),
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
        trustedForEsReview: inferTrustedForEsReview(entry),
      };
    });

    let totalFreeUnitsApplied = 0;
    let totalCreditsConsumed = 0;
    let totalActualCreditsDeducted = 0;
    let remainingHtmlFreeUnits = await getRemainingCompanyRagHtmlFreeUnits(userId, plan);
    let remainingPdfFreeUnits = await getRemainingCompanyRagPdfFreeUnits(userId, plan);
    let actualUnits = 0;

    for (const url of uniqueRequestedUrls) {
      const pdfSummary = pageRoutingSummaries[url];
      const isPdfSource = Boolean(pdfSummary);
      const ingestUnits = isPdfSource && typeof pdfSummary?.ingest_pages === "number"
        ? Math.max(1, Math.floor(Number(pdfSummary.ingest_pages)))
        : 1;
      actualUnits += isPdfSource ? ingestUnits : calculateCorporateCrawlUnits(1);
      const usage = await applyCompanyRagUsage({
        userId,
        plan,
        pages: ingestUnits,
        kind: isPdfSource ? "pdf" : "url",
        referenceId: companyId,
        description: `企業RAG取込(${isPdfSource ? "PDF" : "URL"}): ${company.name}`,
      });
      totalFreeUnitsApplied += usage.freeUnitsApplied;
      totalCreditsConsumed += usage.creditsDisplayed;
      totalActualCreditsDeducted += usage.creditsActuallyDeducted;
      if (isPdfSource) {
        remainingPdfFreeUnits = usage.remainingFreeUnits;
      } else {
        remainingHtmlFreeUnits = usage.remainingFreeUnits;
      }
    }

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
      actualUnits,
      freeUnitsApplied: totalFreeUnitsApplied,
      remainingFreeUnits: remainingHtmlFreeUnits,
      remainingHtmlFreeUnits,
      remainingPdfFreeUnits,
      creditsConsumed: totalCreditsConsumed,
      actualCreditsDeducted: totalActualCreditsDeducted,
      estimatedCostBand:
        totalCreditsConsumed > 0
          ? `${totalCreditsConsumed}クレジット`
          : actualUnits > 0
            ? "今回はクレジット消費なし"
            : "無料枠内",
      chunksStored: crawlResult.chunks_stored,
      errors: crawlResult.errors,
      totalUrls: updatedUrls.length,
      pageRoutingSummaries,
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

    const rateLimited = await enforceRateLimitLayers(
      _request,
      [...STATUS_POLL_RATE_LAYERS],
      authUser.userId,
      null,
      "companies_fetch_corporate_status"
    );
    if (rateLimited) {
      return rateLimited;
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
      const response = await fetchFastApiWithPrincipal(
        `/company-info/rag/status-detailed/${companyId}`,
        {
          principal: {
            scope: "company",
            actor: { kind: "user", id: authUser.userId },
            companyId,
            plan: authUser.plan,
          },
        },
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
    const backfilledUrls = await Promise.all(
      corporateInfoUrls.map(async (entry): Promise<CorporateInfoSource> => {
        const job = jobsBySourceUrl.get(entry.url);
        const urlBackfilledType =
          entry.contentType ||
          (entry.kind !== "upload_pdf" ? detectContentTypeFromUrl(entry.url) || "corporate_site" : undefined);

        const compliance =
          entry.kind === "upload_pdf" || isUploadSource(entry.url)
            ? {
                complianceStatus: entry.complianceStatus,
                complianceReasons: entry.complianceReasons,
                complianceCheckedAt: entry.complianceCheckedAt,
                policyVersion: entry.policyVersion,
              }
            : await checkPublicSourceCompliance(entry.url);

        const normalizedCompliance = "status" in compliance
          ? {
              complianceStatus: compliance.status,
              complianceReasons: compliance.reasons,
              complianceCheckedAt: compliance.checkedAt,
              policyVersion: compliance.policyVersion,
            }
          : compliance;

        if (!job) {
          const nextEntry: CorporateInfoSource = {
            ...entry,
            contentType: urlBackfilledType,
            complianceStatus: normalizedCompliance.complianceStatus,
            complianceReasons: normalizedCompliance.complianceReasons,
            complianceCheckedAt: normalizedCompliance.complianceCheckedAt,
            policyVersion: normalizedCompliance.policyVersion,
          };
          return {
            ...nextEntry,
            trustedForEsReview: inferTrustedForEsReview(nextEntry),
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

        const nextEntry: CorporateInfoSource = {
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
          complianceStatus: normalizedCompliance.complianceStatus,
          complianceReasons: normalizedCompliance.complianceReasons,
          complianceCheckedAt: normalizedCompliance.complianceCheckedAt,
          policyVersion: normalizedCompliance.policyVersion,
        };

        return {
          ...nextEntry,
          trustedForEsReview: inferTrustedForEsReview(nextEntry),
        };
      })
    );

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
      pageLimit: getCompanyRagSourceLimit(authUser.plan),
    });
  } catch (error) {
    console.error("Error getting corporate info status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
