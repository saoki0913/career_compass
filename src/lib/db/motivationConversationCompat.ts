import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { logError } from "@/lib/logger";

const OPTIONAL_MOTIVATION_CONVERSATION_COLUMNS = {
  conversationContext: "conversation_context",
  selectedRole: "selected_role",
  selectedRoleSource: "selected_role_source",
  desiredWork: "desired_work",
  questionStage: "question_stage",
  lastSuggestionOptions: "last_suggestion_options",
  lastEvidenceCards: "last_evidence_cards",
  stageStatus: "stage_status",
} as const;

type MotivationConversationOptionalField = keyof typeof OPTIONAL_MOTIVATION_CONVERSATION_COLUMNS;
type MotivationConversationOptionalColumn =
  (typeof OPTIONAL_MOTIVATION_CONVERSATION_COLUMNS)[MotivationConversationOptionalField];

type MotivationConversationBaseRow = Pick<
  typeof motivationConversations.$inferSelect,
  | "id"
  | "userId"
  | "guestId"
  | "companyId"
  | "messages"
  | "questionCount"
  | "status"
  | "motivationScores"
  | "generatedDraft"
  | "charLimitType"
  | "lastSuggestions"
  | "createdAt"
  | "updatedAt"
>;

export type MotivationConversationCompatRow = MotivationConversationBaseRow & {
  conversationContext: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  desiredWork: string | null;
  questionStage: string | null;
  lastSuggestionOptions: string | null;
  lastEvidenceCards: string | null;
  stageStatus: string | null;
};

let optionalColumnsPromise: Promise<Set<MotivationConversationOptionalColumn>> | null = null;

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function getOptionalColumns(): Promise<Set<MotivationConversationOptionalColumn>> {
  if (optionalColumnsPromise) {
    return optionalColumnsPromise;
  }

  optionalColumnsPromise = db
    .execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'motivation_conversations'
          and column_name in (
            'conversation_context',
            'selected_role',
            'selected_role_source',
            'desired_work',
            'question_stage',
            'last_suggestion_options',
            'last_evidence_cards',
            'stage_status'
          )
      `)
      .then((rows) => {
        const columns = new Set<MotivationConversationOptionalColumn>();
        for (const row of rows as unknown as Array<{ column_name: string }>) {
          const column = row.column_name as MotivationConversationOptionalColumn;
          if (Object.values(OPTIONAL_MOTIVATION_CONVERSATION_COLUMNS).includes(column)) {
            columns.add(column);
          }
        }
        return columns;
      })
      .catch((error) => {
        logError("motivation-conversation-compat:optional-columns", error);
        return new Set<MotivationConversationOptionalColumn>();
      });

  return optionalColumnsPromise;
}

async function hydrateOptionalFields(
  conversationId: string,
): Promise<Record<MotivationConversationOptionalColumn, string | null>> {
  const availableColumns = await getOptionalColumns();
  const empty = {
    conversation_context: null,
    selected_role: null,
    selected_role_source: null,
    desired_work: null,
    question_stage: null,
    last_suggestion_options: null,
    last_evidence_cards: null,
    stage_status: null,
  } satisfies Record<MotivationConversationOptionalColumn, string | null>;

  if (availableColumns.size === 0) {
    return empty;
  }

  try {
    const selectedColumns = Array.from(availableColumns).map((column) => sql.raw(`"${column}"`));
    const rows = await db.execute(sql`
      select ${sql.join(selectedColumns, sql`, `)}
      from "motivation_conversations"
      where "id" = ${conversationId}
      limit 1
    `);
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];

    if (!row) {
      return empty;
    }

    return {
      conversation_context: availableColumns.has("conversation_context")
        ? asNullableString(row.conversation_context)
        : null,
      selected_role: availableColumns.has("selected_role")
        ? asNullableString(row.selected_role)
        : null,
      selected_role_source: availableColumns.has("selected_role_source")
        ? asNullableString(row.selected_role_source)
        : null,
      desired_work: availableColumns.has("desired_work")
        ? asNullableString(row.desired_work)
        : null,
      question_stage: availableColumns.has("question_stage")
        ? asNullableString(row.question_stage)
        : null,
      last_suggestion_options: availableColumns.has("last_suggestion_options")
        ? asNullableString(row.last_suggestion_options)
        : null,
      last_evidence_cards: availableColumns.has("last_evidence_cards")
        ? asNullableString(row.last_evidence_cards)
        : null,
      stage_status: availableColumns.has("stage_status")
        ? asNullableString(row.stage_status)
        : null,
    };
  } catch (error) {
    logError("motivation-conversation-compat:hydrate-optional-fields", error, {
      conversationId,
    });
    return empty;
  }
}

async function attachOptionalFields(
  row: MotivationConversationBaseRow,
): Promise<MotivationConversationCompatRow> {
  const optional = await hydrateOptionalFields(row.id);

  return {
    ...row,
    conversationContext: optional.conversation_context,
    selectedRole: optional.selected_role,
    selectedRoleSource: optional.selected_role_source,
    desiredWork: optional.desired_work,
    questionStage: optional.question_stage,
    lastSuggestionOptions: optional.last_suggestion_options,
    lastEvidenceCards: optional.last_evidence_cards,
    stageStatus: optional.stage_status,
  };
}

export async function getMotivationConversationByCondition(
  whereClause: SQL<unknown> | undefined,
): Promise<MotivationConversationCompatRow | null> {
  const [row] = await db
    .select({
      id: motivationConversations.id,
      userId: motivationConversations.userId,
      guestId: motivationConversations.guestId,
      companyId: motivationConversations.companyId,
      messages: motivationConversations.messages,
      questionCount: motivationConversations.questionCount,
      status: motivationConversations.status,
      motivationScores: motivationConversations.motivationScores,
      generatedDraft: motivationConversations.generatedDraft,
      charLimitType: motivationConversations.charLimitType,
      lastSuggestions: motivationConversations.lastSuggestions,
      createdAt: motivationConversations.createdAt,
      updatedAt: motivationConversations.updatedAt,
    })
    .from(motivationConversations)
    .where(whereClause)
    .limit(1);

  if (!row) {
    return null;
  }

  return attachOptionalFields(row);
}

export async function getMotivationConversationById(
  conversationId: string,
): Promise<MotivationConversationCompatRow | null> {
  return getMotivationConversationByCondition(eq(motivationConversations.id, conversationId));
}

export async function filterMotivationConversationUpdate<
  T extends Record<string, unknown>,
>(values: T): Promise<Partial<T>> {
  const availableColumns = await getOptionalColumns();
  const filtered: Partial<T> = { ...values };

  for (const [field, column] of Object.entries(OPTIONAL_MOTIVATION_CONVERSATION_COLUMNS) as Array<
    [MotivationConversationOptionalField, MotivationConversationOptionalColumn]
  >) {
    if (!availableColumns.has(column)) {
      delete filtered[field as keyof T];
    }
  }

  return filtered;
}
