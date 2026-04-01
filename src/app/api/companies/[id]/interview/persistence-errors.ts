import type { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export const INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE = "INTERVIEW_PERSISTENCE_UNAVAILABLE";

const INTERVIEW_PERSISTENCE_TABLES = [
  "interview_conversations",
  "interview_feedback_histories",
] as const;

function getErrorDiagnosticText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const visited = new Set<unknown>();

  for (let depth = 0; depth < 12 && current != null; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);

    if (current instanceof Error) {
      parts.push(current.message);
      const code = (current as { code?: string }).code;
      if (typeof code === "string" && code.length > 0) {
        parts.push(`code:${code}`);
      }
      current = current.cause;
      continue;
    }

    if (typeof current === "object" && current !== null && "message" in current) {
      parts.push(String((current as { message: unknown }).message));
    }
    break;
  }

  return parts.join("\n").toLowerCase();
}

function getMissingInterviewPersistenceTables(error: unknown): string[] {
  const message = getErrorDiagnosticText(error);
  const hasMissingRelationSignal =
    message.includes("does not exist") ||
    message.includes("no such table") ||
    message.includes("relation") ||
    message.includes("sqlite_error") ||
    message.includes("code:42p01");

  if (!hasMissingRelationSignal) {
    return [];
  }

  return INTERVIEW_PERSISTENCE_TABLES.filter((tableName) => message.includes(tableName));
}

export class InterviewPersistenceUnavailableError extends Error {
  readonly code = INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE;
  readonly companyId: string;
  readonly operation: string;
  readonly missingTables: string[];

  constructor(args: { companyId: string; operation: string; missingTables: string[] }) {
    super(
      `Interview persistence schema unavailable for ${args.operation}: ${args.missingTables.join(", ") || "unknown"}`,
    );
    this.name = "InterviewPersistenceUnavailableError";
    this.companyId = args.companyId;
    this.operation = args.operation;
    this.missingTables = args.missingTables;
  }
}

export function normalizeInterviewPersistenceError(
  error: unknown,
  args: { companyId: string; operation: string },
): InterviewPersistenceUnavailableError | null {
  if (error instanceof InterviewPersistenceUnavailableError) {
    return error;
  }

  const missingTables = getMissingInterviewPersistenceTables(error);
  if (missingTables.length === 0) {
    return null;
  }

  return new InterviewPersistenceUnavailableError({
    companyId: args.companyId,
    operation: args.operation,
    missingTables,
  });
}

export function isInterviewPersistenceUnavailableError(error: unknown): boolean {
  return error instanceof InterviewPersistenceUnavailableError;
}

export function createInterviewPersistenceUnavailableResponse(
  request: NextRequest,
  error: InterviewPersistenceUnavailableError,
) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const action = isDevelopment
    ? "時間をおいて再度お試しください。改善しない場合は、管理側で設定状況を確認します。"
    : "時間をおいて再度お試しください。改善しない場合は、お問い合わせください。";

  return createApiErrorResponse(request, {
    status: 503,
    code: INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
    userMessage: "現在、面接対策の保存機能を一時的に利用できません。しばらくしてから再度お試しください。",
    action,
    developerMessage: `Interview persistence unavailable during ${error.operation}: ${error.missingTables.join(", ")}`,
    details: `companyId=${error.companyId}; operation=${error.operation}; tables=${error.missingTables.join(",")}`,
    logContext: error.operation,
    extra: {
      companyId: error.companyId,
      operation: error.operation,
      missingTables: error.missingTables,
    },
  });
}
