import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUserMutationRequest } from "@/bff/api/mutation-guard";
import { persistCompanyRagSourcesAfterUsageReservation } from "@/bff/company-rag/persist-sources";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  inferTrustedForEsReview,
  parseCorporateInfoSources,
  type CorporateInfoSource,
  upsertCorporateInfoSource,
} from "@/lib/company-info/sources";
import {
  cancelCompanyRagUsage,
  getRemainingCompanyRagPdfFreeUnits,
  reserveCompanyRagUsage,
} from "@/lib/company-info/usage";
import {
  getCompanyRagSourceLimit,
  normalizePdfPageCount,
} from "@/lib/company-info/pricing";
import { CORPORATE_MUTATE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import type { CareerPrincipalPlan } from "@/lib/fastapi/career-principal";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { logError } from "@/lib/logger";
import {
  claimCompanyRagIngestQuote,
  completeCompanyRagIngestQuote,
  hashCompanyRagQuoteFile,
  hashCompanyRagQuoteInput,
} from "@/lib/company-info/rag-quotes";

export const runtime = "nodejs";

const MAX_FILES_PER_REQUEST = 1;

/**
 * Per-file ceiling for PDF uploads (D-2 象限②).
 *
 * Matches the FastAPI backend's ``MAX_PDF_UPLOAD_BYTES`` (20 MiB) so the BFF
 * does not accept PDFs the backend would reject. Tightening this further at
 * the edge would silently break uploads that work end-to-end via curl.
 */
const MAX_PDF_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Aggregate ceiling across all files in a single multipart request (D-2 象限②).
 *
 * The quote/reservation flow is intentionally one quote per file, so this route
 * accepts one PDF per request. Keep a separate aggregate cap as a defense
 * against multipart overhead and malformed clients.
 */
const MAX_PDF_AGGREGATE_BYTES = 50 * 1024 * 1024;

interface UploadPdfResult {
  success: boolean;
  company_id: string;
  source_url: string;
  chunks_stored: number;
  extracted_chars: number;
  page_count?: number | null;
  content_type?: string | null;
  secondary_content_types?: string[];
  extraction_method: string;
  errors: string[];
  source_total_pages?: number | null;
  ingest_truncated?: boolean;
  ocr_truncated?: boolean;
  processing_notice_ja?: string | null;
  page_routing_summary?: Record<string, unknown> | null;
}

interface BatchUploadItem {
  fileName: string;
  status: "completed" | "pending" | "failed" | "skipped_limit";
  sourceUrl?: string;
  chunksStored?: number;
  extractedChars?: number;
  pageCount?: number | null;
  ingestUnits?: number;
  freeUnitsApplied?: number;
  creditsConsumed?: number;
  actualCreditsDeducted?: number;
  extractionMethod?: string;
  contentType?: string | null;
  secondaryContentTypes?: string[];
  error?: string;
  sourceTotalPages?: number | null;
  ingestTruncated?: boolean;
  ocrTruncated?: boolean;
  processingNoticeJa?: string | null;
  pageRoutingSummary?: Record<string, unknown> | null;
}

const VALID_PDF_CONTENT_TYPES = new Set<NonNullable<CorporateInfoSource["contentType"]>>([
  "new_grad_recruitment",
  "midcareer_recruitment",
  "corporate_site",
  "ir_materials",
  "ceo_message",
  "employee_interviews",
  "press_release",
  "csr_sustainability",
  "midterm_plan",
]);

function normalizePdfContentType(raw: FormDataEntryValue | null): CorporateInfoSource["contentType"] {
  if (typeof raw !== "string") {
    return "corporate_site";
  }
  return VALID_PDF_CONTENT_TYPES.has(raw as NonNullable<CorporateInfoSource["contentType"]>)
    ? (raw as NonNullable<CorporateInfoSource["contentType"]>)
    : "corporate_site";
}

function getPdfContentChannel(contentType: CorporateInfoSource["contentType"]): "corporate_ir" | "corporate_general" {
  return contentType === "ir_materials" || contentType === "midterm_plan" ? "corporate_ir" : "corporate_general";
}

function countLimitSources(sources: CorporateInfoSource[]): number {
  return sources.filter((source) => source.status !== "failed").length;
}

function parseFiles(formData: FormData): File[] {
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length > 0) {
    return files;
  }
  const single = formData.get("file");
  return single instanceof File ? [single] : [];
}

function validatePdfFile(file: File): string | null {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "PDFファイルのみアップロードできます";
  }
  if (file.size === 0) {
    return "PDFファイルが空です";
  }
  if (file.size > MAX_PDF_FILE_BYTES) {
    return "PDFファイルが大きすぎます。20MB以下にしてください。";
  }
  return null;
}

async function getAuthenticatedUser(userId: string): Promise<{
  userId: string;
  plan: "free" | "standard" | "pro";
}> {
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

async function bestEffortDeleteRag(
  companyId: string,
  sourceUrl: string,
  principalActor: { userId: string; plan: CareerPrincipalPlan },
) {
  try {
    await fetchFastApiWithPrincipal(`/company-info/rag/${companyId}/delete-by-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [sourceUrl] }),
      principal: {
        scope: "company",
        actor: { kind: "user", id: principalActor.userId },
        companyId,
        plan: principalActor.plan,
      },
    });
  } catch {
    // Ignore rollback failures; the source metadata update is the primary consistency point.
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let companyId = "unknown";
  try {
    ({ id: companyId } = await params);
    const mutationGuard = await requireUserMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }

    // Reject multipart bodies whose Content-Length already exceeds the
    // aggregate cap before we buffer any part of them into FormData.
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_PDF_AGGREGATE_BYTES
      ) {
        return NextResponse.json(
          {
            error: `アップロード合計サイズが大きすぎます。${Math.round(
              MAX_PDF_AGGREGATE_BYTES / (1024 * 1024)
            )}MB以下にしてください。`,
          },
          { status: 413 }
        );
      }
    }

    const formData = await request.formData();
    const files = parseFiles(formData);
    const rawContentType = formData.get("contentType") ?? formData.get("content_type");
    const contentType = normalizePdfContentType(rawContentType);
    const quoteId = formData.get("quoteId");

    if (files.length === 0) {
      return NextResponse.json({ error: "PDFファイルを指定してください" }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `一度にアップロードできるPDFは最大${MAX_FILES_PER_REQUEST}件です` },
        { status: 400 }
      );
    }
    // Aggregate size check after FormData parse — ``file.size`` is authoritative
    // even when clients omit or misreport Content-Length. The per-file cap is
    // enforced later inside ``validatePdfFile``.
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_PDF_AGGREGATE_BYTES) {
      return NextResponse.json(
        {
          error: `アップロード合計サイズが大きすぎます。${Math.round(
            MAX_PDF_AGGREGATE_BYTES / (1024 * 1024)
          )}MB以下にしてください。`,
        },
        { status: 413 }
      );
    }

    const authUser = await getAuthenticatedUser(mutationGuard.session.user.id);

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CORPORATE_MUTATE_RATE_LAYERS],
      authUser.userId,
      null,
      "companies_fetch_corporate_upload"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    if (typeof quoteId !== "string" || !quoteId) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "CORPORATE_RAG_QUOTE_REQUIRED",
        userMessage: "取得前に見積の確認が必要です。",
        action: "もう一度見積を取得してから、取り込みを実行してください。",
      });
    }

    const company = access.company;
    const pageLimit = getCompanyRagSourceLimit(authUser.plan);
    let currentSources = parseCorporateInfoSources(company.corporateInfoUrls);

    const items: BatchUploadItem[] = [];

    for (const file of files) {
      const validationError = validatePdfFile(file);
      if (validationError) {
        items.push({ fileName: file.name, status: "failed", error: validationError });
        continue;
      }

      if (countLimitSources(currentSources) >= pageLimit) {
        items.push({
          fileName: file.name,
          status: "skipped_limit",
          error: `プラン制限に達しました（上限 ${pageLimit} ソース）`,
        });
        continue;
      }

      const fileSha256 = await hashCompanyRagQuoteFile(file);
      const inputHash = hashCompanyRagQuoteInput({
        files: [{ name: file.name, size: file.size, type: file.type, sha256: fileSha256 }],
        contentType: typeof rawContentType === "string" ? rawContentType : null,
      });
      const quote = await claimCompanyRagIngestQuote({
        quoteId,
        userId: authUser.userId,
        companyId,
        kind: "pdf",
        inputHash,
      });
      if (!quote) {
        items.push({
          fileName: file.name,
          status: "failed",
          error: "見積の有効期限が切れたか、取得内容が変更されました。",
        });
        continue;
      }
      const quoteCompletion = {
        quoteId,
        userId: authUser.userId,
        companyId,
        kind: "pdf" as const,
      };
      const quotedSources = Array.isArray(quote.sourceResults)
        ? quote.sourceResults as Array<{ billable_units?: unknown }>
        : [];
      const quotedSource = quotedSources[0] ?? null;
      const quotedPages = Math.max(1, Math.floor(Number(
        quotedSource?.billable_units ?? quote.estimatedPdfUnits ?? 1,
      )));
      const usage = await reserveCompanyRagUsage({
        userId: authUser.userId,
        plan: authUser.plan,
        pages: quotedPages,
        kind: "pdf",
        referenceId: companyId,
        description: `企業RAG取込(PDF): ${company.name}`,
      }).catch(async (error) => {
        await completeCompanyRagIngestQuote(quoteCompletion, "canceled", []);
        throw error;
      });

      const sourceUrl = `upload://corporate-pdf/${companyId}/${randomUUID()}`;
      const backendForm = new FormData();
      backendForm.set("company_id", companyId);
      backendForm.set("company_name", company.name);
      backendForm.set("source_url", sourceUrl);
      backendForm.set("billing_plan", authUser.plan);
      backendForm.set("content_type", contentType ?? "corporate_site");
      backendForm.set("content_channel", getPdfContentChannel(contentType));
      backendForm.set("file", file, file.name);

      let uploadResult: UploadPdfResult;
      try {
        const response = await fetchFastApiWithPrincipal("/company-info/rag/upload-pdf", {
          method: "POST",
          body: backendForm,
          principal: {
            scope: "company",
            actor: { kind: "user", id: authUser.userId },
            companyId,
            plan: authUser.plan,
          },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || data.error || "Backend request failed");
        }
        uploadResult = data as UploadPdfResult;
      } catch (error) {
        await cancelCompanyRagUsage(usage);
        await completeCompanyRagIngestQuote(quoteCompletion, "canceled", usage.reservationId ? [usage.reservationId] : []);
        if (isSecretMissingError(error)) {
          return NextResponse.json(
            { error: "AI機能を利用できませんでした。" },
            { status: 503 }
          );
        }
        logError("corporate-pdf-upload-backend-failed", error, { companyId, fileName: file.name });
        items.push({
          fileName: file.name,
          status: "failed",
          error: "PDFの取り込みに失敗しました。しばらく後にお試しください。",
        });
        continue;
      }

      if (!uploadResult.success) {
        await cancelCompanyRagUsage(usage);
        await completeCompanyRagIngestQuote(quoteCompletion, "canceled", usage.reservationId ? [usage.reservationId] : []);
        items.push({
          fileName: file.name,
          status: "failed",
          sourceUrl,
          error: uploadResult.errors[0] || "PDFの取り込みに失敗しました。",
        });
        continue;
      }

      const nowIso = new Date().toISOString();
      const ingestUnits = normalizePdfPageCount(uploadResult.page_count);
      if (ingestUnits !== quotedPages) {
        await cancelCompanyRagUsage(usage);
        await completeCompanyRagIngestQuote(quoteCompletion, "canceled", usage.reservationId ? [usage.reservationId] : []);
        await bestEffortDeleteRag(companyId, sourceUrl, {
          userId: authUser.userId,
          plan: authUser.plan,
        });
        items.push({
          fileName: file.name,
          status: "failed",
          sourceUrl,
          error: "見積時点からPDFの取り込みページ数が変わりました。もう一度見積を取得してください。",
        });
        continue;
      }

      const completedSource: CorporateInfoSource = {
        url: sourceUrl,
        kind: "upload_pdf",
        fileName: file.name,
        contentType: (uploadResult.content_type || contentType || undefined) as CorporateInfoSource["contentType"],
        secondaryContentTypes: (uploadResult.secondary_content_types || []) as CorporateInfoSource["secondaryContentTypes"],
        status: "completed",
        fetchedAt: nowIso,
        updatedAt: nowIso,
        chunksStored: uploadResult.chunks_stored,
        extractedChars: uploadResult.extracted_chars,
        pageCount: uploadResult.page_count ?? undefined,
        ingestUnits,
        extractionMethod: uploadResult.extraction_method,
        trustedForEsReview: inferTrustedForEsReview({
          kind: "upload_pdf",
          url: sourceUrl,
        }),
      };

      try {
        const nextSources = upsertCorporateInfoSource(currentSources, completedSource);
        await persistCompanyRagSourcesAfterUsageReservation({
          companyId,
          userId: authUser.userId,
          sources: nextSources,
          usageReservations: [usage],
        });
        await completeCompanyRagIngestQuote(quoteCompletion, "confirmed", usage.reservationId ? [usage.reservationId] : []);
        currentSources = nextSources;
        items.push({
          fileName: file.name,
          status: "completed",
          sourceUrl,
          chunksStored: uploadResult.chunks_stored,
          extractedChars: uploadResult.extracted_chars,
          pageCount: uploadResult.page_count ?? null,
          ingestUnits,
          freeUnitsApplied: usage.freeUnitsApplied,
          creditsConsumed: usage.creditsDisplayed,
          actualCreditsDeducted: usage.creditsActuallyDeducted,
          extractionMethod: uploadResult.extraction_method,
          contentType: uploadResult.content_type || contentType || null,
          secondaryContentTypes: uploadResult.secondary_content_types || [],
          sourceTotalPages: uploadResult.source_total_pages ?? null,
          ingestTruncated: Boolean(uploadResult.ingest_truncated),
          ocrTruncated: Boolean(uploadResult.ocr_truncated),
          processingNoticeJa: uploadResult.processing_notice_ja ?? null,
          pageRoutingSummary: uploadResult.page_routing_summary ?? null,
        });
      } catch (error) {
        await completeCompanyRagIngestQuote(quoteCompletion, "canceled", usage.reservationId ? [usage.reservationId] : []);
        logError("corporate-pdf-upload-metadata-update-failed", error, { companyId, sourceUrl });
        await bestEffortDeleteRag(companyId, sourceUrl, {
          userId: authUser.userId,
          plan: authUser.plan,
        });
        items.push({
          fileName: file.name,
          status: "failed",
          sourceUrl,
          error: "PDFの取り込み結果を保存できませんでした。",
        });
      }
    }

    const summary = {
      total: files.length,
      completed: items.filter((item) => item.status === "completed").length,
      pending: items.filter((item) => item.status === "pending").length,
      failed: items.filter((item) => item.status === "failed").length,
      skippedLimit: items.filter((item) => item.status === "skipped_limit").length,
    };
    const totalUnits = items.reduce((total, item) => total + (item.ingestUnits || 0), 0);
    const remainingFreeUnits = await getRemainingCompanyRagPdfFreeUnits(
      authUser.userId,
      authUser.plan,
    );
    const actualCreditsDeducted = items.reduce(
      (total, item) => total + (item.actualCreditsDeducted || 0),
      0,
    );

    return NextResponse.json({
      success: summary.failed === 0 && summary.skippedLimit === 0,
      summary,
      items,
      totalSources: currentSources.length,
      totalUnits,
      remainingFreeUnits,
      actualCreditsDeducted,
      estimatedCostBand:
        actualCreditsDeducted > 0
          ? `${actualCreditsDeducted}クレジット`
          : totalUnits > 0
            ? "今回はクレジット消費なし（無料枠内）"
            : "—",
    });
  } catch (error) {
    logError("corporate-pdf-upload-failed", error, { companyId });
    return createApiErrorResponse(request, {
      status: 500,
      code: "CORPORATE_PDF_UPLOAD_FAILED",
      userMessage: "PDFを取り込めませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
    });
  }
}
