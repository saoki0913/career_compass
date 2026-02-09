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
  type?: "ir" | "business" | "about" | "general";
  contentType?: string;
  secondaryContentTypes?: string[];
  fetchedAt?: string;
}

const CONTENT_TYPE_URL_PATTERNS: Array<{ type: string; patterns: string[] }> = [
  {
    type: "new_grad_recruitment",
    patterns: ["recruit", "shinsotsu", "newgrad", "entry", "saiyo", "graduate", "freshers"],
  },
  {
    type: "midcareer_recruitment",
    patterns: ["career", "midcareer", "tenshoku", "experienced", "chuto", "job-change"],
  },
  {
    type: "ceo_message",
    patterns: ["message", "ceo", "president", "greeting", "topmessage", "chairman", "representative"],
  },
  {
    type: "employee_interviews",
    patterns: ["interview", "voice", "story", "people", "staff", "member", "senpai"],
  },
  {
    type: "press_release",
    patterns: ["news", "press", "release", "newsroom", "information", "topics", "oshirase"],
  },
  {
    type: "ir_materials",
    patterns: ["ir", "investor", "financial", "stock", "kabunushi", "kessan", "securities"],
  },
  {
    type: "csr_sustainability",
    patterns: ["csr", "esg", "sustainability", "sdgs", "social", "environment", "responsible"],
  },
  {
    type: "midterm_plan",
    patterns: ["plan", "strategy", "mtp", "medium-term", "chuki", "keiei", "vision"],
  },
  {
    type: "corporate_site",
    patterns: ["about", "company", "corporate", "overview", "profile", "info"],
  },
];

function detectContentTypeFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  let bestType: string | null = null;
  let bestScore = 0;

  for (const entry of CONTENT_TYPE_URL_PATTERNS) {
    let score = 0;
    for (const pattern of entry.patterns) {
      if (lower.includes(pattern)) {
        score += 1;
        if (lower.includes(`/${pattern}/`) || lower.endsWith(`/${pattern}`)) {
          score += 1;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = entry.type;
    }
  }

  return bestScore > 0 ? bestType : null;
}

interface CrawlResult {
  success: boolean;
  company_id: string;
  pages_crawled: number;
  chunks_stored: number;
  errors: string[];
  url_content_types?: Record<string, string>;
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
    return parsed
      .filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const { url } = entry as Partial<CorporateInfoUrl>;
        return typeof url === "string";
      })
      .map((entry) => {
        const urlEntry = entry as CorporateInfoUrl;
        if (!urlEntry.contentType && urlEntry.url) {
          urlEntry.contentType = detectContentTypeFromUrl(urlEntry.url) || "corporate_site";
        }
        if (!Array.isArray(urlEntry.secondaryContentTypes)) {
          urlEntry.secondaryContentTypes = [];
        } else {
          urlEntry.secondaryContentTypes = urlEntry.secondaryContentTypes.filter(
            (item): item is string => typeof item === "string"
          );
        }
        return urlEntry;
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
    const { urls, contentType, contentChannel } = body as {
      urls: string[];
      contentType?: string; // 9-category content type (e.g., new_grad_recruitment, ir_materials)
      contentChannel?: "corporate_ir" | "corporate_business" | "corporate_general";
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
    const authUser = await getAuthenticatedUser(request);
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
    const existingUrls = parseCorporateInfoUrls(company.corporateInfoUrls);
    const existingUrlSet = new Set(existingUrls.map((u) => u.url));

    const uniqueRequestedUrls = urls
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0 && !existingUrlSet.has(u));

    const remaining = Math.max(0, pageLimit - existingUrlSet.size);
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: `プラン制限: ${plan}プランでは1社あたり最大${pageLimit}ページまで保存できます（上限に達しています）`,
          limit: pageLimit,
          remaining,
        },
        { status: 402 }
      );
    }
    if (uniqueRequestedUrls.length > remaining) {
      return NextResponse.json(
        {
          error: `プラン制限: ${plan}プランでは1社あたり最大${pageLimit}ページまで保存できます（残り${remaining}ページ）`,
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
    const urlContentTypes = crawlResult.url_content_types || {};
    const newUrls: CorporateInfoUrl[] = uniqueRequestedUrls
      .map((url) => ({
        url,
        contentType: urlContentTypes[url] || contentTypeResolved || detectContentTypeFromUrl(url) || "corporate_site",
        secondaryContentTypes: [],
        fetchedAt: new Date().toISOString(),
      }));

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
        contentType: detectContentTypeFromUrl(entry.url) || "corporate_site",
        secondaryContentTypes: Array.isArray(entry.secondaryContentTypes)
          ? entry.secondaryContentTypes
          : [],
      };
    });

    await db
      .update(companies)
      .set({
        corporateInfoUrls: JSON.stringify(backfilledUrls),
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

    const corporateInfoUrls = parseCorporateInfoUrls(company.corporateInfoUrls);
    const backfilledUrls = corporateInfoUrls.map((entry) => {
      if (entry.contentType) {
        return entry;
      }
      return {
        ...entry,
        contentType: detectContentTypeFromUrl(entry.url) || "corporate_site",
      };
    });

    if (JSON.stringify(backfilledUrls) !== JSON.stringify(corporateInfoUrls)) {
      await db
        .update(companies)
        .set({
          corporateInfoUrls: JSON.stringify(backfilledUrls),
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
