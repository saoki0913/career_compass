import type { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export const INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE = "INTERVIEW_PERSISTENCE_UNAVAILABLE";

const INTERVIEW_PERSISTENCE_TABLES = [
  "interview_conversations",
  "interview_feedback_histories",
  "interview_turn_events",
] as const;

const INTERVIEW_PERSISTENCE_REQUIRED_COLUMNS = {
  interview_conversations: [
    "role_track",
    "interview_format",
    "selection_type",
    "interview_stage",
    "interviewer_type",
    "strictness_mode",
    "interview_plan_json",
    "turn_state_json",
    "turn_meta_json",
    "active_feedback_draft",
    "current_feedback_id",
  ],
  interview_feedback_histories: [
    "consistency_risks",
    "weakest_question_type",
    "weakest_turn_id",
    "weakest_question_snapshot",
    "weakest_answer_snapshot",
    "satisfaction_score",
    "source_messages_snapshot",
  ],
  interview_turn_events: [
    "turn_id",
    "coverage_checklist_snapshot",
    "deterministic_coverage_passed",
    "format_phase",
  ],
} as const;

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
    /relation ["']?[a-z_]+["']? does not exist/.test(message) ||
    message.includes("no such table") ||
    message.includes("sqlite_error") ||
    message.includes("code:42p01");

  if (!hasMissingRelationSignal) {
    return [];
  }

  return INTERVIEW_PERSISTENCE_TABLES.filter((tableName) => {
    const missingRelationPattern = new RegExp(`relation ["']?${tableName}["']? does not exist`);
    const missingColumnRelationPattern = new RegExp(`of relation ["']?${tableName}["']? does not exist`);
    return (
      (missingRelationPattern.test(message) && !missingColumnRelationPattern.test(message)) ||
      new RegExp(`no such table:? ["']?${tableName}["']?`).test(message)
    );
  });
}

function getMissingInterviewPersistenceColumns(error: unknown): string[] {
  const message = getErrorDiagnosticText(error);
  const hasMissingColumnSignal =
    message.includes("column") &&
    (
      message.includes("does not exist") ||
      message.includes("no such column") ||
      message.includes("undefined column") ||
      message.includes("code:42703")
    );

  if (!hasMissingColumnSignal) {
    return [];
  }

  const missing: string[] = [];
  for (const [tableName, columns] of Object.entries(INTERVIEW_PERSISTENCE_REQUIRED_COLUMNS)) {
    for (const columnName of columns) {
      const patterns = [
        new RegExp(`column ["']?${columnName}["']? of relation ["']?${tableName}["']? does not exist`),
        new RegExp(`column ["']?${tableName}["']?\\.["']?${columnName}["']? does not exist`),
        new RegExp(`["']?${tableName}["']?\\.["']?${columnName}["']?`),
        new RegExp(`column ["']?${columnName}["']? does not exist`),
        new RegExp(`no such column:? ["']?${columnName}["']?`),
      ];
      if (patterns.some((pattern) => pattern.test(message))) {
        missing.push(`${tableName}.${columnName}`);
      }
    }
  }

  return missing;
}

export class InterviewPersistenceUnavailableError extends Error {
  readonly code = INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE;
  readonly companyId: string;
  readonly operation: string;
  readonly missingTables: string[];
  readonly missingColumns: string[];

  constructor(args: {
    companyId: string;
    operation: string;
    missingTables: string[];
    missingColumns: string[];
  }) {
    super(
      `Interview persistence schema unavailable for ${args.operation}: ${[
        args.missingTables.length > 0 ? `tables=${args.missingTables.join(",")}` : "",
        args.missingColumns.length > 0 ? `columns=${args.missingColumns.join(",")}` : "",
      ].filter(Boolean).join("; ") || "unknown"}`,
    );
    this.name = "InterviewPersistenceUnavailableError";
    this.companyId = args.companyId;
    this.operation = args.operation;
    this.missingTables = args.missingTables;
    this.missingColumns = args.missingColumns;
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
  const missingColumns = missingTables.length === 0
    ? getMissingInterviewPersistenceColumns(error)
    : [];
  if (missingTables.length === 0 && missingColumns.length === 0) {
    return null;
  }

  return new InterviewPersistenceUnavailableError({
    companyId: args.companyId,
    operation: args.operation,
    missingTables,
    missingColumns,
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
    developerMessage: `Interview persistence unavailable during ${error.operation}: tables=${error.missingTables.join(",") || "none"}; columns=${error.missingColumns.join(",") || "none"}`,
    details: `companyId=${error.companyId}; operation=${error.operation}; tables=${error.missingTables.join(",") || "none"}; columns=${error.missingColumns.join(",") || "none"}`,
    logContext: error.operation,
    extra: {
      companyId: error.companyId,
      operation: error.operation,
      missingTables: error.missingTables,
      missingColumns: error.missingColumns,
    },
  });
}
