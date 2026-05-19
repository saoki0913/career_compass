import { NextRequest, NextResponse } from "next/server";
import { requireUserMutationRequest } from "@/bff/api/mutation-guard";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { detectContentTypeFromUrl, parseCorporateInfoSources } from "@/lib/company-info/sources";
import {
  getRemainingCompanyRagHtmlFreeUnits,
  getRemainingCompanyRagPdfFreeUnits,
} from "@/lib/company-info/usage";
import { calculatePdfIngestCredits } from "@/lib/company-info/pricing";
import { filterAllowedPublicSourceUrls } from "@/lib/company-info/source-compliance";
import { CORPORATE_MUTATE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import { createApiErrorResponse } from "@/bff/api/error-response";
import {
  sanitizeUpstreamUserMessage,
  summarizeUpstreamError,
} from "@/bff/api/upstream-error-sanitizer";
import { logError } from "@/lib/logger";
import {
  createCompanyRagIngestQuote,
  hashCompanyRagQuoteInput,
  type CompanyRagQuoteSourceResult,
} from "@/lib/company-info/rag-quotes";

export const runtime = "nodejs";

interface CrawlEstimateResult {
  success: boolean;
  company_id: string;
  estimated_pages_crawled: number;
  estimated_html_pages: number;
  estimated_pdf_pages: number;
  estimated_google_ocr_pages: number;
  estimated_mistral_ocr_pages: number;
  will_truncate: boolean;
  requires_confirmation: boolean;
  errors: string[];
  page_routing_summaries?: Record<string, Record<string, unknown>>;
  source_results?: CompanyRagQuoteSourceResult[];
}

async function getAuthenticatedUser(userId: string): Promise<{ userId: string; plan: "free" | "standard" | "pro" }> {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return {
    userId,
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
    const mutationGuard = await requireUserMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }
    const authUser = await getAuthenticatedUser(mutationGuard.session.user.id);

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CORPORATE_MUTATE_RATE_LAYERS],
      authUser.userId,
      null,
      "companies_fetch_corporate_estimate"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json();
    const { urls, contentType, contentChannel, confirmedWarningUrls } = body as {
      urls: string[];
      contentType?: string;
      contentChannel?: "corporate_ir" | "corporate_business" | "corporate_general";
      confirmedWarningUrls?: string[];
    };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      const msg = "URLを指定してください。";
      return NextResponse.json({ error: msg, errors: [msg] }, { status: 400 });
    }

    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid || !access.company) {
      const msg = "Company not found";
      return NextResponse.json({ error: msg, errors: [msg] }, { status: 404 });
    }

    const existingUrls = parseCorporateInfoSources(access.company.corporateInfoUrls);
    const existingUrlSet = new Set(existingUrls.map((source) => source.url));
    const newRequestedUrls = urls
      .map((url) => String(url).trim())
      .filter((url) => url.length > 0 && !existingUrlSet.has(url));

    const compliance = await filterAllowedPublicSourceUrls(newRequestedUrls);
    if (compliance.allowedUrls.length === 0) {
      const blockedReason =
        compliance.blockedResults[0]?.reasons[0] || "公開ページURLのみ取得できます";
      return NextResponse.json({ error: blockedReason, errors: [blockedReason] }, { status: 400 });
    }
    const confirmedWarningUrlSet = new Set(
      Array.isArray(confirmedWarningUrls)
        ? confirmedWarningUrls.map((url) => String(url).trim()).filter(Boolean)
        : [],
    );
    const unconfirmedWarning = compliance.warningResults.find(
      (result) => !confirmedWarningUrlSet.has(result.url),
    );
    if (unconfirmedWarning) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "PUBLIC_SOURCE_CONFIRMATION_REQUIRED",
        userMessage: unconfirmedWarning.reasons[0] || "取得前にページ内容の確認が必要です。",
        action: "ページを確認してから、もう一度取得してください。",
        extra: {
          warningUrl: unconfirmedWarning.url,
          reasons: unconfirmedWarning.reasons,
        },
      });
    }

    const contentTypeResolved = contentType || detectContentTypeFromUrl(compliance.allowedUrls[0]) || "corporate_site";
    const contentChannelResolved =
      contentChannel ||
      (contentTypeResolved === "ir_materials" || contentTypeResolved === "midterm_plan"
        ? "corporate_ir"
        : "corporate_general");

    const response = await fetchFastApiWithPrincipal("/company-info/rag/estimate-crawl-corporate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        company_name: access.company.name,
        urls: compliance.allowedUrls,
        content_channel: contentChannelResolved,
        content_type: contentTypeResolved,
        billing_plan: authUser.plan,
      }),
      principal: {
        scope: "company",
        actor: { kind: "user", id: authUser.userId },
        companyId,
        plan: authUser.plan,
      },
    });

    const result = (await response.json().catch(() => ({}))) as CrawlEstimateResult;
    if (!response.ok) {
      const msg = sanitizeUpstreamUserMessage(result, "企業情報の見積に失敗しました。");
      const upstreamSummary = summarizeUpstreamError(result);
      logError(
        "corporate-fetch-estimate-upstream-failed",
        new Error(upstreamSummary || "FastAPI estimate request failed"),
        { companyId, status: response.status },
      );
      return NextResponse.json({ error: msg, errors: [msg] }, { status: response.status || 500 });
    }

    let remainingHtmlFreeUnits = await getRemainingCompanyRagHtmlFreeUnits(authUser.userId, authUser.plan);
    let remainingPdfFreeUnits = await getRemainingCompanyRagPdfFreeUnits(authUser.userId, authUser.plan);
    let estimatedFreeHtmlPages = 0;
    let estimatedFreePdfPages = 0;
    let estimatedCredits = 0;
    const pageRoutingSummaries = result.page_routing_summaries || {};
    if (!Array.isArray(result.source_results)) {
      return NextResponse.json({
        error: "企業情報の見積結果を確認できませんでした。",
        errors: ["企業情報の見積結果を確認できませんでした。"],
      }, { status: 502 });
    }
    const estimationTargets = result.source_results
      .filter((source) => source && source.success === true && typeof source.url === "string");
    if (estimationTargets.length === 0) {
      return NextResponse.json({
        error: "取り込み可能な企業情報ソースが見つかりませんでした。",
        errors: ["取り込み可能な企業情報ソースが見つかりませんでした。"],
      }, { status: 503 });
    }

    for (const source of estimationTargets) {
      const pdfSummary = source.page_routing_summary || pageRoutingSummaries[source.url];
      if (source.kind === "pdf" || pdfSummary) {
        const ingestPages = Math.max(1, Number(pdfSummary?.ingest_pages ?? source.billable_units ?? 1));
        const freeApplied = Math.min(ingestPages, remainingPdfFreeUnits);
        const overflowPages = ingestPages - freeApplied;
        estimatedFreePdfPages += freeApplied;
        estimatedCredits += calculatePdfIngestCredits(overflowPages);
        remainingPdfFreeUnits -= freeApplied;
      } else {
        const freeApplied = Math.min(1, remainingHtmlFreeUnits);
        const overflowPages = 1 - freeApplied;
        estimatedFreeHtmlPages += freeApplied;
        estimatedCredits += overflowPages;
        remainingHtmlFreeUnits -= freeApplied;
      }
    }

    const requiresConfirmation =
      estimatedCredits > 0 ||
      result.estimated_mistral_ocr_pages > 0 ||
      result.will_truncate;

    const inputHash = hashCompanyRagQuoteInput({
      urls: compliance.allowedUrls,
      contentType: contentTypeResolved,
      contentChannel: contentChannelResolved,
    });
    const quote = await createCompanyRagIngestQuote({
      userId: authUser.userId,
      companyId,
      kind: "url",
      inputHash,
      plan: authUser.plan,
      estimatedHtmlUnits: estimationTargets
        .filter((source) => source.kind !== "pdf" && !source.page_routing_summary)
        .reduce((sum, source) => sum + Math.max(1, Number(source.billable_units ?? 1)), 0),
      estimatedPdfUnits: estimationTargets
        .filter((source) => source.kind === "pdf" || source.page_routing_summary)
        .reduce((sum, source) => sum + Math.max(1, Number(source.billable_units ?? source.page_routing_summary?.ingest_pages ?? 1)), 0),
      estimatedCredits,
      sourceResults: estimationTargets,
    });

    return NextResponse.json({
      ...result,
      quoteId: quote.quoteId,
      quoteExpiresAt: quote.expiresAt.toISOString(),
      estimatedFreeHtmlPages,
      estimatedFreePdfPages,
      estimatedCredits,
      remainingHtmlFreeUnits,
      remainingPdfFreeUnits,
      requiresConfirmation,
    });
  } catch (error) {
    if (isSecretMissingError(error)) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "AI_AUTH_CONFIG_MISSING",
        userMessage: "AI機能を利用できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        developerMessage: "AI provider credentials are missing or unavailable",
      });
    }
    logError("corporate-fetch-estimate-failed", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "CORPORATE_FETCH_ESTIMATE_FAILED",
      userMessage: "企業情報の見積を取得できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
    });
  }
}
