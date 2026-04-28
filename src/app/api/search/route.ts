import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { performSearch } from "@/lib/server/search-loader";
import { COMPANY_SEARCH_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";

const SEARCH_TYPE_VALUES = new Set(["all", "companies", "documents", "deadlines"]);

function isValidTypesParam(types: string | undefined): boolean {
  if (!types) return true;
  const values = types.split(",").map((type) => type.trim()).filter(Boolean);
  if (values.length === 0) return false;
  if (values.includes("all") && values.length > 1) return false;
  return values.every((type) => SEARCH_TYPE_VALUES.has(type));
}

const searchParamsSchema = z.object({
  q: z.string().trim().min(1).max(100),
  types: z.string().trim().max(64).optional().refine(isValidTypesParam, {
    message: "Invalid search type",
  }),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);

    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "SEARCH_AUTH_REQUIRED",
        userMessage: "検索にはログインまたはゲストセッションが必要です。",
        action: "ログイン状態を確認して、もう一度お試しください。",
      });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...COMPANY_SEARCH_RATE_LAYERS],
      identity.userId,
      identity.guestId,
      "global_search"
    );
    if (rateLimited) return rateLimited;

    const searchParams = request.nextUrl.searchParams;
    const parsedParams = searchParamsSchema.safeParse({
      q: searchParams.get("q") || "",
      types: searchParams.get("types") || undefined,
      limit: searchParams.get("limit") || 5,
    });

    if (!parsedParams.success) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "SEARCH_INVALID_QUERY",
        userMessage: "検索条件を確認してください。",
        action: "検索語、検索対象、表示件数を確認して、もう一度お試しください。",
        developerMessage: parsedParams.error.message,
      });
    }

    const response = await performSearch(identity, {
      q: parsedParams.data.q,
      types: parsedParams.data.types || "all",
      limit: parsedParams.data.limit ?? 5,
    });

    return NextResponse.json(response);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "SEARCH_INTERNAL_ERROR",
      userMessage: "検索結果を読み込めませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      retryable: true,
      error,
      logContext: "api-search",
    });
  }
}
