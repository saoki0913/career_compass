/**
 * Deadline persistence helpers for the company schedule fetch feature.
 *
 * Extracted from src/app/api/companies/[id]/fetch-info/route.ts to keep
 * the route handler focused on HTTP concerns. All behavior is preserved exactly.
 */

import { db } from "@/lib/db";
import { deadlines } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a deadline object returned by the FastAPI backend (snake_case). */
export interface ExtractedDeadline {
  type: string;
  title: string;
  due_date: string | null;  // Backend uses snake_case
  dueDate?: string | null;  // Frontend alias
  source_url?: string;
  confidence: string;
}

export type DeadlineType = typeof deadlines.$inferInsert.type;

export interface SaveDeadlinesParams {
  companyId: string;
  extractedDeadlines: ExtractedDeadline[];
  fallbackSourceUrl: string;
}

export interface SavedDeadlineSummary {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  sourceUrl: string | null;
  isDuplicate?: boolean;
}

export interface SaveDeadlinesResult {
  savedDeadlines: string[];
  skippedDuplicates: string[];
  savedDeadlineSummaries: SavedDeadlineSummary[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Normalize title for comparison (remove variations like parentheses, ordinal numbers).
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, "")                           // Remove spaces
    .replace(/[（(][^）)]*[）)]/g, "")              // Remove content in parentheses
    .replace(/第?[一二三四五1-5]次?/g, "")           // Remove ordinal numbers (Japanese and Arabic)
    .toLowerCase();
}

/**
 * Check if two dates are the same calendar day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Find an existing deadline that matches the given criteria (same type, similar title, same day).
 * Returns null when no match is found or when dueDate is null.
 */
export async function findExistingDeadline(
  companyId: string,
  type: DeadlineType,
  title: string,
  dueDate: Date | null,
): Promise<typeof deadlines.$inferSelect | null> {
  if (!dueDate) return null;

  const existingDeadlines = await db
    .select()
    .from(deadlines)
    .where(
      and(
        eq(deadlines.companyId, companyId),
        eq(deadlines.type, type),
      ),
    );

  const normalizedNewTitle = normalizeTitle(title);

  for (const existing of existingDeadlines) {
    const normalizedExistingTitle = normalizeTitle(existing.title);
    if (normalizedExistingTitle === normalizedNewTitle) {
      if (existing.dueDate && isSameDay(existing.dueDate, dueDate)) {
        return existing;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch duplicate detection (for approval UI warning)
// ---------------------------------------------------------------------------

export interface DuplicateCandidate {
  companyId: string;
  type: DeadlineType;
  dueDate: Date;
  title: string;
  excludeId?: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  type: string;
  dueDate: string;
}

/**
 * Check a batch of candidate deadlines for potential duplicates.
 * Uses: same (companyId, type) + dueDate within ±1 day + normalized title match.
 * Returns a map from candidate index to matching existing deadlines.
 */
export async function findPotentialDuplicatesBatch(
  candidates: DuplicateCandidate[],
): Promise<Map<number, DuplicateMatch[]>> {
  const result = new Map<number, DuplicateMatch[]>();
  if (candidates.length === 0) return result;

  // Group candidates by companyId to minimize DB queries
  const byCompany = new Map<string, { index: number; candidate: DuplicateCandidate }[]>();
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const group = byCompany.get(c.companyId) ?? [];
    group.push({ index: i, candidate: c });
    byCompany.set(c.companyId, group);
  }

  for (const [companyId, group] of byCompany) {
    const existing = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.companyId, companyId));

    for (const { index, candidate } of group) {
      const matches: DuplicateMatch[] = [];
      const normalizedCandidateTitle = normalizeTitle(candidate.title);

      for (const d of existing) {
        if (candidate.excludeId && d.id === candidate.excludeId) continue;
        if (d.type !== candidate.type) continue;
        if (!d.dueDate) continue;

        const dayDiff = Math.abs(d.dueDate.getTime() - candidate.dueDate.getTime()) / (1000 * 60 * 60 * 24);
        if (dayDiff > 1) continue;

        if (normalizeTitle(d.title) === normalizedCandidateTitle) {
          matches.push({
            id: d.id,
            title: d.title,
            type: d.type,
            dueDate: d.dueDate.toISOString(),
          });
        }
      }

      if (matches.length > 0) {
        result.set(index, matches);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const VALID_DEADLINE_TYPES: DeadlineType[] = [
  "es_submission", "web_test", "aptitude_test",
  "interview_1", "interview_2", "interview_3", "interview_final",
  "briefing", "internship", "offer_response", "other",
];

/**
 * Persist a list of extracted deadlines for a company.
 *
 * - Skips exact duplicates (same type, normalized title, same day).
 * - When no due_date is present, uses Dec 31 of next year as a placeholder.
 * - Returns summaries for both newly inserted and skipped (duplicate) records.
 */
export async function saveExtractedDeadlines(
  params: SaveDeadlinesParams,
): Promise<SaveDeadlinesResult> {
  const { companyId, extractedDeadlines, fallbackSourceUrl } = params;

  const savedDeadlines: string[] = [];
  const skippedDuplicates: string[] = [];
  const savedDeadlineSummaries: SavedDeadlineSummary[] = [];

  if (!extractedDeadlines || extractedDeadlines.length === 0) {
    return { savedDeadlines, skippedDuplicates, savedDeadlineSummaries };
  }

  const now = new Date();

  for (const d of extractedDeadlines) {
    const type: DeadlineType = VALID_DEADLINE_TYPES.includes(d.type as DeadlineType)
      ? (d.type as DeadlineType)
      : "other";

    let dueDate: Date | null = null;
    const rawDueDate = d.due_date || d.dueDate;
    if (rawDueDate) {
      try {
        dueDate = new Date(rawDueDate);
        if (isNaN(dueDate.getTime())) {
          dueDate = null;
        }
      } catch {
        dueDate = null;
      }
    }

    // Use a far-future placeholder when no due date is provided
    if (!dueDate) {
      dueDate = new Date(now.getFullYear() + 1, 11, 31);
    }

    const existingDeadline = await findExistingDeadline(companyId, type, d.title, dueDate);

    if (existingDeadline) {
      console.log(`Skipping duplicate deadline: ${d.title} (${dueDate?.toISOString()})`);
      skippedDuplicates.push(existingDeadline.id);
      savedDeadlineSummaries.push({
        id: existingDeadline.id,
        title: existingDeadline.title,
        type: existingDeadline.type,
        dueDate: existingDeadline.dueDate?.toISOString() || dueDate.toISOString(),
        sourceUrl: existingDeadline.sourceUrl,
        isDuplicate: true,
      });
      continue;
    }

    const newDeadline = await db
      .insert(deadlines)
      .values({
        id: crypto.randomUUID(),
        companyId,
        type,
        title: d.title,
        description: null,
        memo: null,
        dueDate,
        isConfirmed: false, // AI-extracted deadlines need confirmation
        confidence: (d.confidence as "high" | "medium" | "low") || "low",
        sourceUrl: d.source_url || fallbackSourceUrl,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    savedDeadlines.push(newDeadline[0].id);
    savedDeadlineSummaries.push({
      id: newDeadline[0].id,
      title: newDeadline[0].title,
      type: newDeadline[0].type,
      dueDate: newDeadline[0].dueDate?.toISOString() || dueDate.toISOString(),
      sourceUrl: newDeadline[0].sourceUrl,
    });
  }

  return { savedDeadlines, skippedDuplicates, savedDeadlineSummaries };
}
