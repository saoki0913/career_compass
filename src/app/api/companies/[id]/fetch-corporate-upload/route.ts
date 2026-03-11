import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const PAGE_LIMITS = {
  guest: 0,
  free: 10,
  standard: 50,
  pro: 150,
};

interface CorporateInfoSource {
  url: string;
  kind?: "url" | "upload_pdf";
  fileName?: string;
  type?: "ir" | "business" | "about" | "general";
  contentType?: string;
  secondaryContentTypes?: string[];
  fetchedAt?: string;
}

interface UploadPdfResult {
  success: boolean;
  company_id: string;
  source_url: string;
  chunks_stored: number;
  extracted_chars: number;
  content_type?: string | null;
  extraction_method: string;
  errors: string[];
}

function parseCorporateInfoSources(raw: string | null | undefined): CorporateInfoSource[] {
  if (!raw || raw === "corporate_info_urls") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => entry && typeof entry === "object" && typeof entry.url === "string")
      .map((entry) => ({
        ...entry,
        kind:
          entry.kind === "upload_pdf" || String(entry.url).startsWith("upload://")
            ? "upload_pdf"
            : "url",
        fileName: typeof entry.fileName === "string" ? entry.fileName : undefined,
        secondaryContentTypes: Array.isArray(entry.secondaryContentTypes)
          ? entry.secondaryContentTypes.filter((item: unknown): item is string => typeof item === "string")
          : [],
      }));
  } catch {
    return [];
  }
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
    const rawContentType = formData.get("contentType");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDFファイルを指定してください" }, { status: 400 });
    }
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json({ error: "PDFファイルのみアップロードできます" }, { status: 400 });
    }

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "この機能を利用するにはログインが必要です" },
        { status: 401 }
      );
    }

    const access = await verifyCompanyAccess(companyId, authUser.userId);
    if (!access.valid || !access.company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = access.company;
    const existingSources = parseCorporateInfoSources(company.corporateInfoUrls);
    const pageLimit = PAGE_LIMITS[authUser.plan];
    const remaining = Math.max(0, pageLimit - existingSources.length);
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: `プラン制限: ${authUser.plan}プランでは1社あたり最大${pageLimit}ソースまで保存できます（上限に達しています）`,
          limit: pageLimit,
          remaining,
        },
        { status: 402 }
      );
    }

    const contentType =
      typeof rawContentType === "string" && rawContentType.trim()
        ? rawContentType.trim()
        : "corporate_site";
    const contentChannel =
      contentType === "ir_materials" || contentType === "midterm_plan"
        ? "corporate_ir"
        : "corporate_general";
    const sourceUrl = `upload://corporate-pdf/${companyId}/${randomUUID()}`;

    const backendForm = new FormData();
    backendForm.set("company_id", companyId);
    backendForm.set("company_name", company.name);
    backendForm.set("source_url", sourceUrl);
    backendForm.set("content_type", contentType);
    backendForm.set("content_channel", contentChannel);
    backendForm.set("file", file, file.name);

    let uploadResult: UploadPdfResult;
    try {
      const response = await fetch(`${BACKEND_URL}/company-info/rag/upload-pdf`, {
        method: "POST",
        body: backendForm,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || "Backend request failed");
      }

      uploadResult = await response.json();
    } catch (error) {
      console.error("Backend PDF upload error:", error);
      return NextResponse.json(
        { error: "PDFの取り込みに失敗しました。しばらく後にお試しください。" },
        { status: 503 }
      );
    }

    if (!uploadResult.success) {
      return NextResponse.json(
        { error: uploadResult.errors[0] || "PDFの取り込みに失敗しました。" },
        { status: 400 }
      );
    }

    const newSource: CorporateInfoSource = {
      url: sourceUrl,
      kind: "upload_pdf",
      fileName: file.name,
      contentType: uploadResult.content_type || contentType,
      secondaryContentTypes: [],
      fetchedAt: new Date().toISOString(),
    };

    const updatedSources = [...existingSources, newSource];

    await db
      .update(companies)
      .set({
        corporateInfoUrls: JSON.stringify(updatedSources),
        corporateInfoFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    return NextResponse.json({
      success: true,
      sourceUrl,
      chunksStored: uploadResult.chunks_stored,
      extractedChars: uploadResult.extracted_chars,
      extractionMethod: uploadResult.extraction_method,
      contentType: uploadResult.content_type || contentType,
      totalSources: updatedSources.length,
    });
  } catch (error) {
    console.error("Error uploading corporate PDF:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
