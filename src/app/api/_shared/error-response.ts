import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";

type CreateApiErrorResponseOptions = {
  status: number;
  code: string;
  userMessage: string;
  action?: string;
  retryable?: boolean;
  developerMessage?: string;
  details?: string;
  error?: unknown;
  logContext?: string;
  extra?: Record<string, unknown>;
};

function getDebugDeveloperMessage(options: CreateApiErrorResponseOptions): string | undefined {
  if (options.error instanceof Error) {
    return options.error.message;
  }
  if (typeof options.error === "string") {
    return options.error;
  }
  return options.developerMessage;
}

function getRequestId(request?: NextRequest): string {
  const requestId = request?.headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : randomUUID();
}

export function createApiErrorResponse(
  request: NextRequest | undefined,
  options: CreateApiErrorResponseOptions
) {
  const requestId = getRequestId(request);

  if (options.error || options.developerMessage) {
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
      },
      requestId,
      ...(process.env.NODE_ENV === "development"
        ? {
            debug: {
              developerMessage: getDebugDeveloperMessage(options),
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
