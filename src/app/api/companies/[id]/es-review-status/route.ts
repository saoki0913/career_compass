import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { STATUS_POLL_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import { cacheGet } from "@/lib/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "ES_REVIEW_STATUS_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
      });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...STATUS_POLL_RATE_LAYERS],
      identity.userId,
      identity.guestId,
      "companies_es_review_status"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const { id } = await params;
    const [company] = await db
      .select({
        id: companies.id,
        userId: companies.userId,
        guestId: companies.guestId,
        infoFetchedAt: companies.infoFetchedAt,
        corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
      })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "ES_REVIEW_STATUS_COMPANY_NOT_FOUND",
        userMessage: "企業情報が見つかりませんでした。",
        action: "企業一覧を更新して、もう一度お試しください。",
      });
    }

    if (
      (identity.userId && company.userId !== identity.userId) ||
      (identity.guestId && company.guestId !== identity.guestId)
    ) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "ES_REVIEW_STATUS_FORBIDDEN",
        userMessage: "この企業情報にはアクセスできません。",
        action: "企業一覧から対象の企業を選び直してください。",
      });
    }

    const lastFetchedAt = company.corporateInfoFetchedAt ?? company.infoFetchedAt;

    if (!lastFetchedAt) {
      return NextResponse.json({
        status: "company_selected_not_fetched",
        ready_for_es_review: false,
        reason: "not_fetched",
        total_chunks: 0,
        strategic_chunks: 0,
        last_updated: null,
      });
    }

    const plan = await getViewerPlan(identity);

    let fetchError: unknown = null;
    const data = await cacheGet(
      `es-review-status:${id}`,
      async () => {
        let response: Response;
        try {
          response = await fetchFastApiWithPrincipal(`/api/es/company-status/${id}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            principal: {
              scope: "company",
              actor: identity.userId
                ? { kind: "user", id: identity.userId }
                : { kind: "guest", id: identity.guestId! },
              companyId: id,
              plan,
            },
          });
        } catch (err) {
          fetchError = err;
          return null; // null = don't cache
        }

        if (!response.ok) return null; // null = don't cache

        return response.json();
      },
      { ttlSeconds: 15 },
    );

    if (fetchError) {
      return createApiErrorResponse(request, {
        status: 503,
        code: isSecretMissingError(fetchError)
          ? "ES_REVIEW_STATUS_AI_AUTH_NOT_CONFIGURED"
          : "ES_REVIEW_STATUS_BACKEND_UNAVAILABLE",
        userMessage: "企業情報の添削準備状況を確認できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        logContext: isSecretMissingError(fetchError)
          ? "companies_es_review_status_secret_missing"
          : "companies_es_review_status_fetch_failed",
        error: fetchError,
      });
    }

    if (!data) {
      return NextResponse.json({
        status: "company_fetched_but_not_ready",
        ready_for_es_review: false,
        reason: "backend_unavailable",
        total_chunks: 0,
        strategic_chunks: 0,
        last_updated: lastFetchedAt,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "ES_REVIEW_STATUS_INTERNAL_ERROR",
      userMessage: "企業情報の添削準備状況を確認できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      logContext: "companies_es_review_status_unhandled",
      error,
    });
  }
}
