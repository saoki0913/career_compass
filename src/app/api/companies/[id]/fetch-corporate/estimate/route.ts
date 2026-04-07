import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { detectContentTypeFromUrl } from "@/lib/company-info/sources";
import {
  getRemainingCompanyRagHtmlFreeUnits,
  getRemainingCompanyRagPdfFreeUnits,
} from "@/lib/company-info/usage";
import { calculatePdfIngestCredits } from "@/lib/company-info/pricing";
import { filterAllowedPublicSourceUrls } from "@/lib/company-info/source-compliance";
import { CORPORATE_MUTATE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

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
}

async function getAuthenticatedUser(): Promise<{ userId: string; plan: "free" | "standard" | "pro" } | null> {
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
    const body = await request.json();
    const { urls, contentType, contentChannel } = body as {
      urls: string[];
      contentType?: string;
      contentChannel?: "corporate_ir" | "corporate_business" | "corporate_general";
    };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      const msg = "URLを指定してください。";
      return NextResponse.json({ error: msg, errors: [msg] }, { status: 400 });
    }

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      const msg = "この機能を利用するにはログインが必要です";
      return NextResponse.json({ error: msg, errors: [msg] }, { status: 401 });
    }

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

    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid || !access.company) {
      const msg = "Company not found";
      return NextResponse.json({ error: msg, errors: [msg] }, { status: 404 });
    }

    const compliance = await filterAllowedPublicSourceUrls(urls);
    if (compliance.allowedUrls.length === 0) {
      const blockedReason =
        compliance.blockedResults[0]?.reasons[0] || "公開ページURLのみ取得できます";
      return NextResponse.json({ error: blockedReason, errors: [blockedReason] }, { status: 400 });
    }

    const contentTypeResolved = contentType || detectContentTypeFromUrl(compliance.allowedUrls[0]) || "corporate_site";
    const contentChannelResolved =
      contentChannel ||
      (contentTypeResolved === "ir_materials" || contentTypeResolved === "midterm_plan"
        ? "corporate_ir"
        : "corporate_general");

    const response = await fetchFastApiInternal("/company-info/rag/estimate-crawl-corporate", {
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
    });

    const result = (await response.json().catch(() => ({}))) as CrawlEstimateResult;
    if (!response.ok) {
      const msg = result.errors?.[0] || "企業情報の見積に失敗しました。";
      return NextResponse.json({ error: msg, errors: [msg] }, { status: response.status || 500 });
    }

    let remainingHtmlFreeUnits = await getRemainingCompanyRagHtmlFreeUnits(authUser.userId, authUser.plan);
    let remainingPdfFreeUnits = await getRemainingCompanyRagPdfFreeUnits(authUser.userId, authUser.plan);
    let estimatedFreeHtmlPages = 0;
    let estimatedFreePdfPages = 0;
    let estimatedCredits = 0;
    const pageRoutingSummaries = result.page_routing_summaries || {};

    for (const url of compliance.allowedUrls) {
      const pdfSummary = pageRoutingSummaries[url];
      if (pdfSummary) {
        const ingestPages = Math.max(1, Number(pdfSummary.ingest_pages ?? 1));
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

    return NextResponse.json({
      ...result,
      estimatedFreeHtmlPages,
      estimatedFreePdfPages,
      estimatedCredits,
      remainingHtmlFreeUnits,
      remainingPdfFreeUnits,
      requiresConfirmation,
    });
  } catch (error) {
    console.error("Error estimating corporate info fetch:", error);
    const msg = "Internal server error";
    return NextResponse.json({ error: msg, errors: [msg] }, { status: 500 });
  }
}
