import type {
  CausalGap,
  ForbiddenReask,
  MotivationConversationContext,
  MotivationSlot,
  MotivationStage,
  SlotState,
} from "./conversation";

export function parseSlotState(value: unknown): SlotState | null {
  return value === "empty" || value === "rough" || value === "sufficient" || value === "locked"
    ? value
    : null;
}

export function parseSlotStateMap(
  value: unknown,
): Partial<Record<MotivationSlot, SlotState>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      const state = parseSlotState(raw);
      return state && key !== "closing" ? [[key, state]] : [];
    }),
  ) as Partial<Record<MotivationSlot, SlotState>>;
}

export function parseStringMap(value: unknown): Partial<Record<MotivationSlot, string | null>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) =>
      key !== "closing" ? [[key, typeof raw === "string" ? raw : null]] : [],
    ),
  ) as Partial<Record<MotivationSlot, string | null>>;
}

export function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function parseStringArrayMap(value: unknown): Partial<Record<MotivationSlot, string[]>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) =>
      key !== "closing" ? [[key, parseStringArray(raw)]] : [],
    ),
  ) as Partial<Record<MotivationSlot, string[]>>;
}

export function parseNumberMap(value: unknown): Partial<Record<MotivationSlot, number>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) =>
      key !== "closing" && typeof raw === "number" ? [[key, raw]] : [],
    ),
  ) as Partial<Record<MotivationSlot, number>>;
}

export function parseForbiddenReasks(value: unknown): ForbiddenReask[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ForbiddenReask =>
    Boolean(
      item &&
      typeof item === "object" &&
      item.slot &&
      item.slot !== "closing" &&
      typeof item.intent === "string" &&
      typeof item.reason === "string",
    ),
  );
}

export function parseCausalGaps(value: unknown): CausalGap[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CausalGap =>
    Boolean(
      item &&
      typeof item === "object" &&
      item.slot &&
      item.slot !== "closing" &&
      typeof item.id === "string" &&
      typeof item.reason === "string" &&
      typeof item.promptHint === "string",
    ),
  );
}

export function coerceQuestionStage(value: unknown): MotivationStage {
  if (value === "origin_experience" || value === "fit_connection") {
    return "self_connection";
  }
  if (value === "closing") {
    return "differentiation";
  }
  if (
    value === "industry_reason" ||
    value === "company_reason" ||
    value === "self_connection" ||
    value === "desired_work" ||
    value === "value_contribution" ||
    value === "differentiation"
  ) {
    return value;
  }
  return "industry_reason";
}

export function safeParseJsonValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export function buildOpenSlots(confirmedFacts: MotivationConversationContext["confirmedFacts"]): string[] {
  const slots: string[] = [];
  if (!confirmedFacts.industry_reason_confirmed) slots.push("industry_reason");
  if (!confirmedFacts.company_reason_confirmed) slots.push("company_reason");
  if (!confirmedFacts.self_connection_confirmed) slots.push("self_connection");
  if (!confirmedFacts.desired_work_confirmed) slots.push("desired_work");
  if (!confirmedFacts.value_contribution_confirmed) slots.push("value_contribution");
  if (!confirmedFacts.differentiation_confirmed) slots.push("differentiation");
  return slots;
}
