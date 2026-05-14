export type InterviewPlanJsonValue =
  | string
  | number
  | boolean
  | null
  | InterviewPlanJsonValue[]
  | { [key: string]: InterviewPlanJsonValue };

export type InterviewCaseBrief = {
  business_context?: string;
  target_metric?: string;
  constraints?: string[];
  candidate_task?: string;
  why_this_company?: string;
  case_followup_topics?: string[];
  industry?: string | null;
  case_seed_version?: string;
} & { [key: string]: InterviewPlanJsonValue | undefined };

export type InterviewPlan = {
  interviewType: string;
  priorityTopics: string[];
  openingTopic: string | null;
  mustCoverTopics: string[];
  riskTopics: string[];
  suggestedTimeflow: string[];
  caseBrief?: InterviewCaseBrief | null;
  qualityLenses?: InterviewPlanJsonValue;
  contractVersion?: string | null;
  planSource?: string | null;
  fallbackReason?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readAlias(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): { present: boolean; value: unknown } {
  if (hasOwn(record, camelKey)) {
    return { present: true, value: record[camelKey] };
  }
  if (hasOwn(record, snakeKey)) {
    return { present: true, value: record[snakeKey] };
  }
  return { present: false, value: undefined };
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeJsonValue(value: unknown): InterviewPlanJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const normalizedItems: InterviewPlanJsonValue[] = [];
    for (const item of value) {
      const normalizedItem = normalizeJsonValue(item);
      if (normalizedItem !== undefined) {
        normalizedItems.push(normalizedItem);
      }
    }
    return normalizedItems;
  }
  if (isRecord(value)) {
    const normalizedObject: { [key: string]: InterviewPlanJsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const normalizedItem = normalizeJsonValue(item);
      if (normalizedItem !== undefined) {
        normalizedObject[key] = normalizedItem;
      }
    }
    return normalizedObject;
  }
  return undefined;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function addCaseBrief(plan: InterviewPlan, value: unknown): void {
  if (value === null) {
    plan.caseBrief = null;
    return;
  }
  const normalized = normalizeJsonValue(value);
  if (isRecord(normalized)) {
    plan.caseBrief = normalized as InterviewCaseBrief;
  }
}

function addJsonField(
  plan: InterviewPlan,
  key: "qualityLenses",
  value: unknown,
): void {
  const normalized = normalizeJsonValue(value);
  if (normalized !== undefined) {
    plan[key] = normalized;
  }
}

function addNullableStringField(
  plan: InterviewPlan,
  key: "contractVersion" | "planSource" | "fallbackReason",
  value: unknown,
): void {
  const normalized = normalizeNullableString(value);
  if (normalized !== undefined) {
    plan[key] = normalized;
  }
}

export function normalizeInterviewPlanValue(value: unknown): InterviewPlan | null {
  if (!isRecord(value)) return null;
  const parsed = value as Partial<InterviewPlan> & Record<string, unknown>;

  const plan: InterviewPlan = {
    interviewType:
      typeof parsed.interviewType === "string"
        ? parsed.interviewType
        : typeof parsed.interview_type === "string"
          ? parsed.interview_type
          : "new_grad_behavioral",
    priorityTopics: Array.isArray(parsed.priorityTopics)
      ? stringArrayFrom(parsed.priorityTopics)
      : Array.isArray(parsed.priority_topics)
        ? stringArrayFrom(parsed.priority_topics)
        : [],
    openingTopic:
      typeof parsed.openingTopic === "string"
        ? parsed.openingTopic
        : typeof parsed.opening_topic === "string"
          ? parsed.opening_topic
          : null,
    mustCoverTopics: Array.isArray(parsed.mustCoverTopics)
      ? stringArrayFrom(parsed.mustCoverTopics)
      : Array.isArray(parsed.must_cover_topics)
        ? stringArrayFrom(parsed.must_cover_topics)
        : [],
    riskTopics: Array.isArray(parsed.riskTopics)
      ? stringArrayFrom(parsed.riskTopics)
      : Array.isArray(parsed.risk_topics)
        ? stringArrayFrom(parsed.risk_topics)
        : [],
    suggestedTimeflow: Array.isArray(parsed.suggestedTimeflow)
      ? stringArrayFrom(parsed.suggestedTimeflow)
      : Array.isArray(parsed.suggested_timeflow)
        ? stringArrayFrom(parsed.suggested_timeflow)
        : [],
  };

  const caseBrief = readAlias(parsed, "caseBrief", "case_brief");
  if (caseBrief.present) {
    addCaseBrief(plan, caseBrief.value);
  }

  const qualityLenses = readAlias(parsed, "qualityLenses", "quality_lenses");
  if (qualityLenses.present) {
    addJsonField(plan, "qualityLenses", qualityLenses.value);
  }

  const contractVersion = readAlias(parsed, "contractVersion", "contract_version");
  if (contractVersion.present) {
    addNullableStringField(plan, "contractVersion", contractVersion.value);
  }

  const planSource = readAlias(parsed, "planSource", "plan_source");
  if (planSource.present) {
    addNullableStringField(plan, "planSource", planSource.value);
  }

  const fallbackReason = readAlias(parsed, "fallbackReason", "fallback_reason");
  if (fallbackReason.present) {
    addNullableStringField(plan, "fallbackReason", fallbackReason.value);
  }

  return plan;
}
