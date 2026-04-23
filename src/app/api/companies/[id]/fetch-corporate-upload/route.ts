import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  inferTrustedForEsReview,
  parseCorporateInfoSources,
  serializeCorporateInfoSources,
  type CorporateInfoSource,
  upsertCorporateInfoSource,
} from "@/lib/company-info/sources";
import {
  applyCompanyRagUsage,
  getRemainingCompanyRagPdfFreeUnits,
} from "@/lib/company-info/usage";
import {
  getCompanyRagSourceLimit,
  normalizePdfPageCount,
} from "@/lib/company-info/pricing";
import { CORPORATE_MUTATE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import type { CareerPrincipalPlan } from "@/lib/fastapi/career-principal";

export const runtime = "nodejs";

const MAX_FILES_PER_REQUEST = 10;

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
 * 10 × 20 MiB = 200 MiB is the theoretical maximum given ``MAX_FILES_PER_REQUEST``
 * but nobody legitimately uploads 10 maximum-size PDFs in one batch. Cap the
 * total at 50 MiB so a malicious client cannot force the BFF to buffer hundreds
 * of MiB into FormData before any ``file.size`` checks run.
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

async function getAuthenticatedUser(): Promise<{
  userId: string;
  plan: "free" | "standard" | "pro";
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
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
  try {
    const { id: companyId } = await params;

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
    const contentType = normalizePdfContentType(formData.get("contentType") ?? formData.get("content_type"));

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

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "この機能を利用するにはログインが必要です" },
        { status: 401 }
      );
    }

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
        if (isSecretMissingError(error)) {
          return NextResponse.json(
            { error: "AI認証設定が未完了です。管理側で設定確認後に再度お試しください。" },
            { status: 503 }
          );
        }
        console.error("Backend PDF upload error:", error);
        items.push({
          fileName: file.name,
          status: "failed",
          error: "PDFの取り込みに失敗しました。しばらく後にお試しください。",
        });
        continue;
      }

      if (!uploadResult.success) {
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
        const usage = await applyCompanyRagUsage({
          userId: authUser.userId,
          plan: authUser.plan,
          pages: ingestUnits,
          kind: "pdf",
          referenceId: companyId,
          description: `企業RAG取込(PDF): ${company.name}`,
        });
        const nextSources = upsertCorporateInfoSource(currentSources, completedSource);
        await db
          .update(companies)
          .set({
            corporateInfoUrls: serializeCorporateInfoSources(nextSources),
            corporateInfoFetchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
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
        console.error("Completed PDF metadata update error:", error);
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
    console.error("Error uploading corporate PDF:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
