/**
 * Deadline Duplicate Check API
 *
 * POST: Batch-check candidates for potential duplicate deadlines (warning-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import {
  findPotentialDuplicatesBatch,
  type DuplicateCandidate,
} from "@/lib/company-info/deadline-persistence";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface RequestBody {
  candidates: Array<{
    type: string;
    title: string;
    dueDate: string;
    excludeId?: string;
  }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const timing = createServerTimingRecorder();
  try {
    const { id: companyId } = await params;
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DUPLICATE_CHECK_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        retryable: true,
        logContext: "duplicate-check-auth",
      });
    }

    // Verify company ownership
    const ownerCondition = identity.userId
      ? eq(companies.userId, identity.userId)
      : eq(companies.guestId, identity.guestId!);

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), ownerCondition))
      .limit(1);

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DUPLICATE_CHECK_COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりませんでした。",
        logContext: "duplicate-check-company",
      });
    }

    const body: RequestBody = await request.json();
    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      return timing.apply(NextResponse.json({ duplicates: {} }));
    }

    const candidates: DuplicateCandidate[] = body.candidates.map((c) => ({
      companyId,
      type: c.type as DuplicateCandidate["type"],
      title: c.title,
      dueDate: new Date(c.dueDate),
      excludeId: c.excludeId,
    }));

    const duplicateMap = await timing.measure("check", () =>
      findPotentialDuplicatesBatch(candidates),
    );

    // Convert Map to plain object for JSON serialization
    const duplicates: Record<number, typeof duplicateMap extends Map<number, infer V> ? V : never> = {};
    for (const [index, matches] of duplicateMap) {
      duplicates[index] = matches;
    }

    return timing.apply(NextResponse.json({ duplicates }));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DUPLICATE_CHECK_FAILED",
      userMessage: "重複チェックに失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "duplicate-check",
    });
  }
}
