import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUserMutationRequest } from "@/bff/api/mutation-guard";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { CORPORATE_MUTATE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import { getRemainingCompanyRagPdfFreeUnits } from "@/lib/company-info/usage";
import { createApiErrorResponse } from "@/bff/api/error-response";
import {
  sanitizeUpstreamUserMessage,
  summarizeUpstreamError,
} from "@/bff/api/upstream-error-sanitizer";
import { logError } from "@/lib/logger";
import {
  createCompanyRagIngestQuote,
  hashCompanyRagQuoteFile,
  hashCompanyRagQuoteInput,
} from "@/lib/company-info/rag-quotes";

export const runtime = "nodejs";
const MAX_PDF_AGGREGATE_BYTES = 50 * 1024 * 1024;

interface PdfEstimateResult {
  success: boolean;
  company_id: string;
  source_url: string;
  page_count?: number | null;
  source_total_pages?: number | null;
  estimated_free_pdf_pages?: number;
  estimated_credits?: number;
  estimated_google_ocr_pages?: number;
  estimated_mistral_ocr_pages?: number;
  will_truncate?: boolean;
  requires_confirmation?: boolean;
  processing_notice_ja?: string | null;
  page_routing_summary?: Record<string, unknown> | null;
  errors?: string[];
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
      "companies_fetch_corporate_upload_estimate"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_PDF_AGGREGATE_BYTES) {
        return NextResponse.json(
          { error: "アップロード合計サイズが大きすぎます。50MB以下にしてください。" },
          { status: 413 },
        );
      }
    }

    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const contentType = formData.get("contentType");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDFファイルを指定してください" }, { status: 400 });
    }
    if (file.size > MAX_PDF_AGGREGATE_BYTES) {
      return NextResponse.json(
        { error: "アップロード合計サイズが大きすぎます。50MB以下にしてください。" },
        { status: 413 },
      );
    }

    const remainingFreePdfPages = await getRemainingCompanyRagPdfFreeUnits(authUser.userId, authUser.plan);
    const sourceUrl = `upload://corporate-pdf/${companyId}/${randomUUID()}`;
    const backendForm = new FormData();
    backendForm.set("company_id", companyId);
    backendForm.set("source_url", sourceUrl);
    backendForm.set("billing_plan", authUser.plan);
    backendForm.set("remaining_free_pdf_pages", String(remainingFreePdfPages));
    if (typeof contentType === "string" && contentType.trim()) {
      backendForm.set("content_type", contentType);
    }
    backendForm.set("file", file, file.name);

    const response = await fetchFastApiWithPrincipal("/company-info/rag/estimate-upload-pdf", {
      method: "POST",
      body: backendForm,
      principal: {
        scope: "company",
        actor: { kind: "user", id: authUser.userId },
        companyId,
        plan: authUser.plan,
      },
    });
    const data = (await response.json().catch(() => ({}))) as PdfEstimateResult;
    if (!response.ok) {
      const msg = sanitizeUpstreamUserMessage(data, "PDFの見積に失敗しました。");
      const upstreamSummary = summarizeUpstreamError(data);
      logError(
        "corporate-pdf-estimate-upstream-failed",
        new Error(upstreamSummary || "FastAPI PDF estimate request failed"),
        { companyId, status: response.status },
      );
      return NextResponse.json(
        { error: msg },
        { status: response.status || 500 }
      );
    }

    const fileSha256 = await hashCompanyRagQuoteFile(file);
    const inputHash = hashCompanyRagQuoteInput({
      files: [{ name: file.name, size: file.size, type: file.type, sha256: fileSha256 }],
      contentType: typeof contentType === "string" ? contentType : null,
    });
    const quote = await createCompanyRagIngestQuote({
      userId: authUser.userId,
      companyId,
      kind: "pdf",
      inputHash,
      plan: authUser.plan,
      estimatedHtmlUnits: 0,
      estimatedPdfUnits: Math.max(1, Number(data.page_count ?? data.page_routing_summary?.ingest_pages ?? 1)),
      estimatedCredits: Math.max(0, Number(data.estimated_credits ?? 0)),
      sourceResults: [{
        url: sourceUrl,
        success: true,
        kind: "pdf",
        billable_units: Math.max(1, Number(data.page_count ?? data.page_routing_summary?.ingest_pages ?? 1)),
        page_routing_summary: data.page_routing_summary ?? null,
      }],
    });

    return NextResponse.json({
      ...data,
      quoteId: quote.quoteId,
      quoteExpiresAt: quote.expiresAt.toISOString(),
    });
  } catch (error) {
    if (isSecretMissingError(error)) {
      return NextResponse.json(
        { error: "AI機能を利用できませんでした。" },
        { status: 503 }
      );
    }
    logError("corporate-pdf-estimate-failed", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "CORPORATE_PDF_ESTIMATE_FAILED",
      userMessage: "PDFの見積を取得できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
    });
  }
}
