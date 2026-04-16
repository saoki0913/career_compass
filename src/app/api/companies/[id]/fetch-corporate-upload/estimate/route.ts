import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { CORPORATE_MUTATE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { getRemainingCompanyRagPdfFreeUnits } from "@/lib/company-info/usage";

export const runtime = "nodejs";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    const contentType = formData.get("contentType");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDFファイルを指定してください" }, { status: 400 });
    }

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
    }

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

    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
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
      return NextResponse.json(
        { error: data.errors?.[0] || "PDFの見積に失敗しました。" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error estimating corporate PDF upload:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
