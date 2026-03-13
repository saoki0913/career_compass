import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, companyPdfIngestJobs } from "@/lib/db/schema";
import {
  parseCorporateInfoSources,
  serializeCorporateInfoSources,
  upsertCorporateInfoSource,
  type CorporateInfoSource,
} from "@/lib/company-info/sources";
import { deleteSupabaseObject, downloadSupabaseObject } from "@/lib/storage/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const JOB_BATCH_SIZE = 3;
const MAX_ATTEMPTS = 3;

interface ClaimedJob {
  id: string;
  company_id: string;
  source_url: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  attempts: number;
}

interface UploadPdfResult {
  success: boolean;
  company_id: string;
  source_url: string;
  chunks_stored: number;
  extracted_chars: number;
  content_type?: string | null;
  secondary_content_types?: string[];
  extraction_method: string;
  errors: string[];
}

function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

async function claimPendingJobs(): Promise<ClaimedJob[]> {
  const rows = await db.execute(sql`
    with picked as (
      select id
      from company_pdf_ingest_jobs
      where status = 'pending'
      order by created_at asc
      limit ${JOB_BATCH_SIZE}
      for update skip locked
    )
    update company_pdf_ingest_jobs as jobs
    set
      status = 'processing',
      attempts = jobs.attempts + 1,
      started_at = now(),
      updated_at = now()
    where jobs.id in (select id from picked)
    returning
      jobs.id,
      jobs.company_id,
      jobs.source_url,
      jobs.storage_bucket,
      jobs.storage_path,
      jobs.file_name,
      jobs.attempts
  `);

  return rows as unknown as ClaimedJob[];
}

async function updateCompanySource(
  companyId: string,
  sourceUrl: string,
  updater: (current: CorporateInfoSource | undefined) => CorporateInfoSource | undefined
) {
  const [company] = await db
    .select({ corporateInfoUrls: companies.corporateInfoUrls })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    return false;
  }

  const currentSources = parseCorporateInfoSources(company.corporateInfoUrls);
  const currentSource = currentSources.find((entry) => entry.url === sourceUrl);
  const nextSource = updater(currentSource);
  if (!nextSource) {
    return false;
  }

  const nextSources = upsertCorporateInfoSource(currentSources, nextSource);
  await db
    .update(companies)
    .set({
      corporateInfoUrls: serializeCorporateInfoSources(nextSources),
      corporateInfoFetchedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  return true;
}

async function markRetry(job: ClaimedJob, errorMessage: string) {
  await db
    .update(companyPdfIngestJobs)
    .set({
      status: "pending",
      lastError: errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(companyPdfIngestJobs.id, job.id));
}

async function markTerminalFailure(job: ClaimedJob, errorMessage: string) {
  await db
    .update(companyPdfIngestJobs)
    .set({
      status: "failed",
      lastError: errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyPdfIngestJobs.id, job.id));

  await updateCompanySource(job.company_id, job.source_url, (current) => {
    if (!current) return undefined;
    return {
      ...current,
      status: "failed",
      errorMessage,
      updatedAt: new Date().toISOString(),
    };
  });

  try {
    await deleteSupabaseObject({
      bucket: job.storage_bucket,
      path: job.storage_path,
    });
  } catch (error) {
    console.error("Failed to delete deferred PDF after terminal failure:", error);
  }
}

async function markCompleted(job: ClaimedJob, result: UploadPdfResult) {
  await db
    .update(companyPdfIngestJobs)
    .set({
      status: "completed",
      lastError: null,
      detectedContentType: result.content_type || null,
      secondaryContentTypes: JSON.stringify(result.secondary_content_types || []),
      chunksStored: result.chunks_stored,
      extractedChars: result.extracted_chars,
      extractionMethod: result.extraction_method,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyPdfIngestJobs.id, job.id));

  await updateCompanySource(job.company_id, job.source_url, (current) => {
    if (!current) return undefined;
    return {
      ...current,
      status: "completed",
      contentType: (result.content_type || undefined) as CorporateInfoSource["contentType"],
      secondaryContentTypes: (result.secondary_content_types || []) as CorporateInfoSource["secondaryContentTypes"],
      chunksStored: result.chunks_stored,
      extractedChars: result.extracted_chars,
      extractionMethod: result.extraction_method,
      errorMessage: undefined,
      updatedAt: new Date().toISOString(),
    };
  });

  try {
    await deleteSupabaseObject({
      bucket: job.storage_bucket,
      path: job.storage_path,
    });
  } catch (error) {
    console.error("Failed to delete deferred PDF after completion:", error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      console.error("Unauthorized company PDF OCR cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const claimedJobs = await claimPendingJobs();
    if (claimedJobs.length === 0) {
      return NextResponse.json({
        success: true,
        executedAt: new Date().toISOString(),
        claimed: 0,
        processed: 0,
        results: [],
      });
    }

    const companyIds = [...new Set(claimedJobs.map((job) => job.company_id))];
    const companyRows = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(companies.id, companyIds));
    const companyById = new Map(companyRows.map((row) => [row.id, row]));

    const results: Array<Record<string, unknown>> = [];

    for (const job of claimedJobs) {
      const company = companyById.get(job.company_id);
      if (!company) {
        await markTerminalFailure(job, "会社情報が見つかりません。");
        results.push({ jobId: job.id, status: "failed", reason: "company_missing" });
        continue;
      }

      try {
        const pdfBytes = await downloadSupabaseObject({
          bucket: job.storage_bucket,
          path: job.storage_path,
        });

        const formData = new FormData();
        formData.set("company_id", job.company_id);
        formData.set("company_name", company.name);
        formData.set("source_url", job.source_url);
        formData.set("allow_defer_ocr", "false");
        formData.set(
          "file",
          new Blob([pdfBytes], { type: "application/pdf" }),
          job.file_name
        );

        const response = await fetch(`${BACKEND_URL}/company-info/rag/upload-pdf`, {
          method: "POST",
          body: formData,
        });
        const data = (await response.json().catch(() => ({}))) as Partial<UploadPdfResult> & {
          detail?: string;
          error?: string;
        };

        if (!response.ok || !data.success) {
          const errorMessage =
            data.errors?.[0] ||
            data.detail ||
            data.error ||
            "OCR後のPDF取り込みに失敗しました。";
          const recoverable =
            response.status >= 500 || response.status === 429 || response.status === 408;

          if (recoverable && job.attempts < MAX_ATTEMPTS) {
            await markRetry(job, errorMessage);
            results.push({ jobId: job.id, status: "retry", attempts: job.attempts, error: errorMessage });
          } else {
            await markTerminalFailure(job, errorMessage);
            results.push({ jobId: job.id, status: "failed", attempts: job.attempts, error: errorMessage });
          }
          continue;
        }

        await markCompleted(job, data as UploadPdfResult);
        results.push({
          jobId: job.id,
          status: "completed",
          contentType: data.content_type || null,
          chunksStored: data.chunks_stored || 0,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "OCR後のPDF取り込みに失敗しました。";
        if (job.attempts < MAX_ATTEMPTS) {
          await markRetry(job, errorMessage);
          results.push({ jobId: job.id, status: "retry", attempts: job.attempts, error: errorMessage });
        } else {
          await markTerminalFailure(job, errorMessage);
          results.push({ jobId: job.id, status: "failed", attempts: job.attempts, error: errorMessage });
        }
      }
    }

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      claimed: claimedJobs.length,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("Company PDF OCR cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
