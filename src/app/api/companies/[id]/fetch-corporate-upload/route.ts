import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, companyPdfIngestJobs, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  parseCorporateInfoSources,
  serializeCorporateInfoSources,
  type CorporateInfoSource,
  upsertCorporateInfoSource,
} from "@/lib/company-info/sources";
import { deleteSupabaseObject, uploadSupabaseObject } from "@/lib/storage/supabase-storage";

export const runtime = "nodejs";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const COMPANY_PDF_INGEST_BUCKET =
  process.env.COMPANY_PDF_INGEST_BUCKET || "company-info-pdf-ingest";
const MAX_FILES_PER_REQUEST = 10;

const PAGE_LIMITS = {
  guest: 0,
  free: 10,
  standard: 50,
  pro: 150,
};

interface UploadPdfResult {
  success: boolean;
  company_id: string;
  source_url: string;
  chunks_stored: number;
  extracted_chars: number;
  content_type?: string | null;
  secondary_content_types?: string[];
  extraction_method: string;
  deferred?: boolean;
  needs_ocr?: boolean;
  errors: string[];
}

interface BatchUploadItem {
  fileName: string;
  status: "completed" | "pending" | "failed" | "skipped_limit";
  sourceUrl?: string;
  chunksStored?: number;
  extractedChars?: number;
  extractionMethod?: string;
  contentType?: string | null;
  secondaryContentTypes?: string[];
  error?: string;
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

function getStoragePath(companyId: string, jobId: string, fileName: string): string {
  const normalized = fileName.replace(/[^\w.\-()+\u3040-\u30ff\u4e00-\u9faf]/g, "_");
  return `company/${companyId}/${jobId}/${normalized}`;
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

async function bestEffortDeleteRag(companyId: string, sourceUrl: string) {
  try {
    await fetch(`${BACKEND_URL}/company-info/rag/${companyId}/delete-by-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [sourceUrl] }),
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
    const formData = await request.formData();
    const files = parseFiles(formData);

    if (files.length === 0) {
      return NextResponse.json({ error: "PDFファイルを指定してください" }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `一度にアップロードできるPDFは最大${MAX_FILES_PER_REQUEST}件です` },
        { status: 400 }
      );
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
    const pageLimit = PAGE_LIMITS[authUser.plan];
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
      backendForm.set("allow_defer_ocr", "true");
      backendForm.set("file", file, file.name);

      let uploadResult: UploadPdfResult;
      try {
        const response = await fetch(`${BACKEND_URL}/company-info/rag/upload-pdf`, {
          method: "POST",
          body: backendForm,
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || data.error || "Backend request failed");
        }
        uploadResult = data as UploadPdfResult;
      } catch (error) {
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

      if (uploadResult.deferred && uploadResult.needs_ocr) {
        const jobId = randomUUID();
        const storagePath = getStoragePath(companyId, jobId, file.name);
        const pendingSource: CorporateInfoSource = {
          url: sourceUrl,
          kind: "upload_pdf",
          fileName: file.name,
          status: "pending",
          jobId,
          fetchedAt: nowIso,
          updatedAt: nowIso,
          extractionMethod: uploadResult.extraction_method,
          extractedChars: uploadResult.extracted_chars,
        };

        try {
          await uploadSupabaseObject({
            bucket: COMPANY_PDF_INGEST_BUCKET,
            path: storagePath,
            body: new Uint8Array(await file.arrayBuffer()),
            contentType: "application/pdf",
          });

          const nextSources = upsertCorporateInfoSource(currentSources, pendingSource);
          await db.transaction(async (tx) => {
            await tx.insert(companyPdfIngestJobs).values({
              id: jobId,
              companyId,
              sourceUrl,
              storageBucket: COMPANY_PDF_INGEST_BUCKET,
              storagePath,
              fileName: file.name,
              status: "pending",
              attempts: 0,
              extractionMethod: uploadResult.extraction_method,
              extractedChars: uploadResult.extracted_chars,
            });

            await tx
              .update(companies)
              .set({
                corporateInfoUrls: serializeCorporateInfoSources(nextSources),
                corporateInfoFetchedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(companies.id, companyId));
          });

          currentSources = nextSources;
          items.push({
            fileName: file.name,
            status: "pending",
            sourceUrl,
            extractionMethod: uploadResult.extraction_method,
            extractedChars: uploadResult.extracted_chars,
          });
        } catch (error) {
          console.error("Deferred PDF registration error:", error);
          try {
            await deleteSupabaseObject({
              bucket: COMPANY_PDF_INGEST_BUCKET,
              path: storagePath,
            });
          } catch {
            // Ignore storage cleanup failure.
          }
          items.push({
            fileName: file.name,
            status: "failed",
            sourceUrl,
            error: "OCR待ちPDFの保留登録に失敗しました。",
          });
        }
        continue;
      }

      const completedSource: CorporateInfoSource = {
        url: sourceUrl,
        kind: "upload_pdf",
        fileName: file.name,
        contentType: (uploadResult.content_type || undefined) as CorporateInfoSource["contentType"],
        secondaryContentTypes: (uploadResult.secondary_content_types || []) as CorporateInfoSource["secondaryContentTypes"],
        status: "completed",
        fetchedAt: nowIso,
        updatedAt: nowIso,
        chunksStored: uploadResult.chunks_stored,
        extractedChars: uploadResult.extracted_chars,
        extractionMethod: uploadResult.extraction_method,
      };

      try {
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
          extractionMethod: uploadResult.extraction_method,
          contentType: uploadResult.content_type || null,
          secondaryContentTypes: uploadResult.secondary_content_types || [],
        });
      } catch (error) {
        console.error("Completed PDF metadata update error:", error);
        await bestEffortDeleteRag(companyId, sourceUrl);
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

    return NextResponse.json({
      success: summary.failed === 0 && summary.skippedLimit === 0,
      summary,
      items,
      totalSources: currentSources.length,
    });
  } catch (error) {
    console.error("Error uploading corporate PDF:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
