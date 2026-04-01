import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";

type CreateApiErrorResponseOptions = {
  status: number;
  code: string;
  userMessage: string;
  action?: string;
  retryable?: boolean;
  /** LLM 層の error_type（billing / rate_limit / network / parse / no_api_key 等） */
  llmErrorType?: string;
  developerMessage?: string;
  details?: string;
  error?: unknown;
  logContext?: string;
  extra?: Record<string, unknown>;
};

function getRequestId(request?: NextRequest): string {
  const requestId = request?.headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : randomUUID();
}

export function createApiErrorResponse(
  request: NextRequest | undefined,
  options: CreateApiErrorResponseOptions
) {
  const requestId = getRequestId(request);

  const routineAuthDenied =
    process.env.NODE_ENV === "development" &&
    options.status === 401 &&
    typeof options.code === "string" &&
    (options.code === "AUTH_REQUIRED" || options.code.endsWith("_AUTH_REQUIRED"));

  if ((options.error || options.developerMessage) && !routineAuthDenied) {
    logError(
      options.logContext ?? options.code,
      options.error ?? new Error(options.developerMessage ?? options.userMessage),
      {
        requestId,
        code: options.code,
        status: options.status,
        details: options.details,
        ...options.extra,
      }
    );
  }

  return NextResponse.json(
    {
      error: {
        code: options.code,
        userMessage: options.userMessage,
        action: options.action,
        retryable: options.retryable ?? false,
        ...(options.llmErrorType ? { llmErrorType: options.llmErrorType } : {}),
      },
      requestId,
    },
    {
      status: options.status,
      headers: {
        "X-Request-Id": requestId,
      },
    }
  );
}
