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
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

// FastAPI backend URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Page limits by plan
const PAGE_LIMITS = {
  guest: 0,  // Guests cannot use this feature
  free: 10,
  standard: 50,
  pro: 150,
};

interface CorporateInfoUrl {
  url: string;
  type: "ir" | "business" | "about" | "general";
  fetchedAt?: string;
}

interface CrawlResult {
  success: boolean;
  company_id: string;
  pages_crawled: number;
  chunks_stored: number;
  errors: string[];
}

function parseCorporateInfoUrls(raw: string | null | undefined): CorporateInfoUrl[] {
  if (!raw) {
    return [];
  }
  // Guard against data corruption where column name is stored as value
  if (raw === "corporate_info_urls") {
    console.warn("corporateInfoUrls contains column name instead of JSON - data corruption detected");
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const { url, type } = entry as Partial<CorporateInfoUrl>;
      return typeof url === "string" && typeof type === "string";
    }) as CorporateInfoUrl[];
  } catch (error) {
    console.warn("Invalid corporateInfoUrls JSON, defaulting to empty.", error);
    return [];
  }
}

async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ userId: string; plan: "free" | "standard" | "pro" } | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return null;
  }

  const profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .get();

  return {
    userId: session.user.id,
    plan: (profile?.plan || "free") as "free" | "standard" | "pro",
  };
}

async function verifyCompanyAccess(
  companyId: string,
  userId: string
): Promise<{ valid: boolean; company?: typeof companies.$inferSelect }> {
  const company = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .get();

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
    const { urls, contentType = "corporate_general" } = body as {
      urls: string[];
      contentType?: "corporate_ir" | "corporate_business" | "corporate_general";
    };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "URLを指定してください" },
        { status: 400 }
      );
    }

    // Authenticate user (guests not allowed)
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "この機能を利用するにはログインが必要です" },
        { status: 401 }
      );
    }

    const { userId, plan } = authUser;

    // Check page limit
    const pageLimit = PAGE_LIMITS[plan];
    if (urls.length > pageLimit) {
      return NextResponse.json(
        {
          error: `プラン制限: ${plan}プランでは最大${pageLimit}ページまで取得できます`,
          limit: pageLimit,
        },
        { status: 402 }
      );
    }

    // Verify company access
    const access = await verifyCompanyAccess(companyId, userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = access.company;

    // Call FastAPI backend to crawl pages
    let crawlResult: CrawlResult;
    try {
    const response = await fetch(`${BACKEND_URL}/company-info/rag/crawl-corporate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          company_name: company.name,
          urls,
          content_channel: contentType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Backend request failed");
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
    const existingUrls = parseCorporateInfoUrls(company.corporateInfoUrls);

    // Add new URLs (avoid duplicates)
    const existingUrlSet = new Set(existingUrls.map((u) => u.url));
    const newUrls: CorporateInfoUrl[] = urls
      .filter((url) => !existingUrlSet.has(url))
      .map((url) => ({
        url,
        type:
          contentType === "corporate_ir"
            ? "ir"
            : contentType === "corporate_business"
            ? "business"
            : "general",
        fetchedAt: new Date().toISOString(),
      }));

    const updatedUrls = [...existingUrls, ...newUrls];

    await db
      .update(companies)
      .set({
        corporateInfoUrls: JSON.stringify(updatedUrls),
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    // Authenticate user
    const authUser = await getAuthenticatedUser(request);
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
      // Legacy counts
      recruitment_chunks: 0,
      corporate_ir_chunks: 0,
      corporate_business_chunks: 0,
      corporate_general_chunks: 0,
      structured_chunks: 0,
      // New content type counts (9 categories)
      new_grad_recruitment_chunks: 0,
      midcareer_recruitment_chunks: 0,
      corporate_site_chunks: 0,
      ir_materials_chunks: 0,
      ceo_message_chunks: 0,
      employee_interviews_chunks: 0,
      press_release_chunks: 0,
      csr_sustainability_chunks: 0,
      midterm_plan_chunks: 0,
      // Legacy recruitment_homepage for backward compatibility
      recruitment_homepage_chunks: 0,
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

    const corporateInfoUrls = parseCorporateInfoUrls(company.corporateInfoUrls);

    return NextResponse.json({
      companyId,
      corporateInfoUrls,
      corporateInfoFetchedAt: company.corporateInfoFetchedAt,
      ragStatus: {
        hasRag: ragStatus.has_rag,
        totalChunks: ragStatus.total_chunks,
        // Legacy counts
        recruitmentChunks: ragStatus.recruitment_chunks,
        corporateIrChunks: ragStatus.corporate_ir_chunks,
        corporateBusinessChunks: ragStatus.corporate_business_chunks,
        corporateGeneralChunks: ragStatus.corporate_general_chunks || 0,
        structuredChunks: ragStatus.structured_chunks,
        // New content type counts (9 categories)
        newGradRecruitmentChunks: ragStatus.new_grad_recruitment_chunks || 0,
        midcareerRecruitmentChunks: ragStatus.midcareer_recruitment_chunks || 0,
        corporateSiteChunks: ragStatus.corporate_site_chunks || 0,
        irMaterialsChunks: ragStatus.ir_materials_chunks || 0,
        ceoMessageChunks: ragStatus.ceo_message_chunks || 0,
        employeeInterviewsChunks: ragStatus.employee_interviews_chunks || 0,
        pressReleaseChunks: ragStatus.press_release_chunks || 0,
        csrSustainabilityChunks: ragStatus.csr_sustainability_chunks || 0,
        midtermPlanChunks: ragStatus.midterm_plan_chunks || 0,
        // Legacy field for backward compatibility (includes any unmigrated data)
        recruitmentHomepageChunks: ragStatus.recruitment_homepage_chunks || 0,
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
