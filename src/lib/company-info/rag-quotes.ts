import { createHash, randomUUID } from "crypto";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { companyRagIngestQuotes } from "@/lib/db/schema";

const QUOTE_TTL_MS = 15 * 60 * 1000;

export type CompanyRagQuoteKind = "url" | "pdf";

export type CompanyRagQuoteSourceResult = {
  url: string;
  success: boolean;
  kind?: string;
  billable_units?: number;
  page_routing_summary?: Record<string, unknown> | null;
  content_type?: string | null;
  error?: string | null;
};

export function hashCompanyRagQuoteInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export async function hashCompanyRagQuoteFile(file: File): Promise<string> {
  return createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
}

export async function createCompanyRagIngestQuote(input: {
  userId: string;
  companyId: string;
  kind: CompanyRagQuoteKind;
  inputHash: string;
  plan: "free" | "standard" | "pro";
  estimatedHtmlUnits: number;
  estimatedPdfUnits: number;
  estimatedCredits: number;
  sourceResults: CompanyRagQuoteSourceResult[];
}): Promise<{ quoteId: string; expiresAt: Date }> {
  const quoteId = randomUUID();
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
  await db.insert(companyRagIngestQuotes).values({
    id: quoteId,
    userId: input.userId,
    companyId: input.companyId,
    kind: input.kind,
    inputHash: input.inputHash,
    planSnapshot: input.plan,
    estimatedHtmlUnits: input.estimatedHtmlUnits,
    estimatedPdfUnits: input.estimatedPdfUnits,
    estimatedCredits: input.estimatedCredits,
    sourceResults: input.sourceResults,
    expiresAt,
  });
  return { quoteId, expiresAt };
}

export async function claimCompanyRagIngestQuote(input: {
  quoteId: string;
  userId: string;
  companyId: string;
  kind: CompanyRagQuoteKind;
  inputHash: string;
}): Promise<typeof companyRagIngestQuotes.$inferSelect | null> {
  const [quote] = await db
    .update(companyRagIngestQuotes)
    .set({
      status: "reserved",
      reservedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(companyRagIngestQuotes.id, input.quoteId),
      eq(companyRagIngestQuotes.userId, input.userId),
      eq(companyRagIngestQuotes.companyId, input.companyId),
      eq(companyRagIngestQuotes.kind, input.kind),
      eq(companyRagIngestQuotes.inputHash, input.inputHash),
      eq(companyRagIngestQuotes.status, "quoted"),
      gt(companyRagIngestQuotes.expiresAt, new Date()),
    ))
    .returning();
  return quote ?? null;
}

export async function completeCompanyRagIngestQuote(
  input: {
    quoteId: string;
    userId: string;
    companyId: string;
    kind: CompanyRagQuoteKind;
  },
  status: "confirmed" | "canceled",
  reservationIds: string[],
): Promise<void> {
  const now = new Date();
  await db
    .update(companyRagIngestQuotes)
    .set({
      status,
      reservationIds,
      confirmedAt: status === "confirmed" ? now : null,
      canceledAt: status === "canceled" ? now : null,
      updatedAt: now,
    })
    .where(and(
      eq(companyRagIngestQuotes.id, input.quoteId),
      eq(companyRagIngestQuotes.userId, input.userId),
      eq(companyRagIngestQuotes.companyId, input.companyId),
      eq(companyRagIngestQuotes.kind, input.kind),
      eq(companyRagIngestQuotes.status, "reserved"),
    ));
}
