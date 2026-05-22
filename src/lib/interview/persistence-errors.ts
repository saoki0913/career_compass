import type { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";

export const INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE = "INTERVIEW_PERSISTENCE_UNAVAILABLE";

const INTERVIEW_PERSISTENCE_TABLES = [
  "interview_conversations",
  "interview_feedback_histories",
  "interview_turn_events",
] as const;

const INTERVIEW_PERSISTENCE_REQUIRED_COLUMNS = {
  interview_conversations_read: [
    "selected_industry",
    "selected_role",
    "selected_role_source",
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
  ],
  interview_conversations_write: [
    "current_feedback_id",
  ],
  interview_feedback_histories_read: [
    "consistency_risks",
    "weakest_question_type",
    "weakest_turn_id",
    "weakest_question_snapshot",
    "weakest_answer_snapshot",
    "satisfaction_score",
    "score_evidence_by_axis",
    "score_rationale_by_axis",
    "confidence_by_axis",
    "source_question_count",
  ],
  interview_feedback_histories_write: [
    "source_messages_snapshot",
    "prompt_version",
    "followup_policy_version",
    "case_seed_version",
    "sheet_data_json",
    "sheet_content",
    "sheet_generated_at",
  ],
  interview_turn_events: [
    "turn_id",
    "coverage_checklist_snapshot",
    "deterministic_coverage_passed",
    "format_phase",
  ],
} as const;

const INTERVIEW_PERSISTENCE_COLUMN_TABLES: Record<
  keyof typeof INTERVIEW_PERSISTENCE_REQUIRED_COLUMNS,
  (typeof INTERVIEW_PERSISTENCE_TABLES)[number]
> = {
  interview_conversations_read: "interview_conversations",
  interview_conversations_write: "interview_conversations",
  interview_feedback_histories_read: "interview_feedback_histories",
  interview_feedback_histories_write: "interview_feedback_histories",
  interview_turn_events: "interview_turn_events",
};

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
  for (const [columnGroup, columns] of Object.entries(INTERVIEW_PERSISTENCE_REQUIRED_COLUMNS) as Array<
    [keyof typeof INTERVIEW_PERSISTENCE_REQUIRED_COLUMNS, readonly string[]]
  >) {
    const tableName = INTERVIEW_PERSISTENCE_COLUMN_TABLES[columnGroup];
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
  });
}
