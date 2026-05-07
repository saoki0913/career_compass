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

const DEFAULT_AUTH_REQUIRED_USER_MESSAGE = "ログインが必要です。";
const DEFAULT_AUTH_REQUIRED_ACTION = "ログインしてから、もう一度お試しください。";

function getRequestId(request?: NextRequest): string {
  const requestId = request?.headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : randomUUID();
}

export function createApiErrorResponse(
  request: NextRequest | undefined,
  options: CreateApiErrorResponseOptions
) {
  const requestId = getRequestId(request);
  const isDevelopment = process.env.NODE_ENV === "development";
  const normalizedUserMessage =
    options.status === 401 ? DEFAULT_AUTH_REQUIRED_USER_MESSAGE : options.userMessage;
  const normalizedAction =
    options.status === 401 ? DEFAULT_AUTH_REQUIRED_ACTION : options.action;

  const routineAuthDenied =
    process.env.NODE_ENV === "development" &&
    options.status === 401 &&
    typeof options.code === "string" &&
    (options.code === "AUTH_REQUIRED" || options.code.endsWith("_AUTH_REQUIRED"));

  if ((options.error || options.developerMessage) && !routineAuthDenied) {
    logError(
      options.logContext ?? options.code,
      options.error ?? new Error(options.developerMessage ?? normalizedUserMessage),
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
        userMessage: normalizedUserMessage,
        action: normalizedAction,
        retryable: options.retryable ?? false,
        ...(options.llmErrorType ? { llmErrorType: options.llmErrorType } : {}),
        ...(options.extra ? { extra: options.extra } : {}),
      },
      requestId,
      ...(isDevelopment && (options.developerMessage || options.details)
        ? {
            debug: {
              developerMessage: options.developerMessage,
              details: options.details,
              status: options.status,
            },
          }
        : {}),
    },
    {
      status: options.status,
      headers: {
        "X-Request-Id": requestId,
      },
    }
  );
}
