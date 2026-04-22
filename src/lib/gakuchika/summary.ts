export interface StrengthItem {
  title: string;
  description: string;
}

export interface LearningItem {
  title: string;
  description: string;
}

export interface StructuredSummary {
  situation_text: string;
  task_text: string;
  action_text: string;
  result_text: string;
  strengths: StrengthItem[];
  learnings: LearningItem[];
  numbers: string[];
  interviewer_hooks?: string[];
  decision_reasons?: string[];
  before_after_comparisons?: string[];
  credibility_notes?: string[];
  role_scope?: string;
  reusable_principles?: string[];
  interview_supporting_details?: string[];
  future_outlook_notes?: string[];
  backstory_notes?: string[];
  one_line_core_answer?: string;
  likely_followup_questions?: string[];
  weak_points_to_prepare?: string[];
  two_minute_version_outline?: string[];
}

export interface LegacySummary {
  summary: string;
  key_points: string[];
  numbers: string[];
  strengths: StrengthItem[] | string[];
}

export type GakuchikaSummary = StructuredSummary | LegacySummary;
export type GakuchikaSummaryKind = "structured" | "legacy" | "none";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeStrengthItems(value: unknown): StrengthItem[] | string[] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "string")) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = cleanString(item.title);
      const description = cleanString(item.description);
      if (!title) return null;
      return { title, description };
    })
    .filter((item): item is StrengthItem => item !== null);
}

function normalizeLearningItems(value: unknown): LearningItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim() ? { title: item.trim(), description: "" } : null;
      }
      if (!isRecord(item)) return null;
      const title = cleanString(item.title);
      const description = cleanString(item.description);
      if (!title) return null;
      return { title, description };
    })
    .filter((item): item is LearningItem => item !== null);
}

function normalizeStructuredStrengthItems(value: unknown): StrengthItem[] {
  const normalized = normalizeStrengthItems(value);
  if (normalized.every((item) => typeof item !== "string")) {
    return normalized;
  }

  return normalized
    .map((item) =>
      typeof item === "string" ? { title: item, description: "" } : item
    )
    .filter((item): item is StrengthItem => Boolean(item.title));
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function isStructuredSummary(summary: GakuchikaSummary): summary is StructuredSummary {
  return "situation_text" in summary;
}

export function parseGakuchikaSummary(summary: unknown): GakuchikaSummary | null {
  if (!summary) return null;

  if (typeof summary === "string") {
    try {
      return parseGakuchikaSummary(JSON.parse(summary));
    } catch {
      const plainText = summary.trim();
      if (!plainText) return null;
      return {
        summary: plainText,
        key_points: [],
        numbers: [],
        strengths: [],
      };
    }
  }

  if (!isRecord(summary)) {
    return null;
  }

  const structuredCandidate = {
    situation_text: cleanString(summary.situation_text),
    task_text: cleanString(summary.task_text),
    action_text: cleanString(summary.action_text),
    result_text: cleanString(summary.result_text),
  };

  const hasStructuredContent = Object.values(structuredCandidate).some(Boolean);
  if (hasStructuredContent) {
    return {
      ...structuredCandidate,
      strengths: normalizeStructuredStrengthItems(summary.strengths),
      learnings: normalizeLearningItems(summary.learnings),
      numbers: cleanStringList(summary.numbers),
      interviewer_hooks: cleanStringList(summary.interviewer_hooks),
      decision_reasons: cleanStringList(summary.decision_reasons),
      before_after_comparisons: cleanStringList(summary.before_after_comparisons),
      credibility_notes: cleanStringList(summary.credibility_notes),
      role_scope: cleanString(summary.role_scope),
      reusable_principles: cleanStringList(summary.reusable_principles),
      interview_supporting_details: cleanStringList(summary.interview_supporting_details),
      future_outlook_notes: cleanStringList(summary.future_outlook_notes),
      backstory_notes: cleanStringList(summary.backstory_notes),
      one_line_core_answer: cleanString(summary.one_line_core_answer),
      likely_followup_questions: cleanStringList(summary.likely_followup_questions),
      weak_points_to_prepare: cleanStringList(summary.weak_points_to_prepare),
      two_minute_version_outline: cleanStringList(summary.two_minute_version_outline),
    };
  }

  const legacySummary = cleanString(summary.summary) || cleanString(summary.raw_answers);
  if (legacySummary) {
    return {
      summary: legacySummary,
      key_points: cleanStringList(summary.key_points),
      numbers: cleanStringList(summary.numbers),
      strengths: normalizeStrengthItems(summary.strengths),
    };
  }

  return null;
}

export function getGakuchikaSummaryKind(summary: unknown): GakuchikaSummaryKind {
  const parsed = parseGakuchikaSummary(summary);
  if (!parsed) return "none";
  return isStructuredSummary(parsed) ? "structured" : "legacy";
}

/** True when at least one section of the completion card would render non-empty content. */
export function structuredSummaryHasVisibleContent(s: StructuredSummary): boolean {
  if (s.one_line_core_answer?.trim()) return true;
  if (s.two_minute_version_outline?.some((line) => line?.trim())) return true;
  if (s.likely_followup_questions?.some((line) => line?.trim())) return true;
  if (s.weak_points_to_prepare?.some((line) => line?.trim())) return true;
  for (const key of ["situation_text", "task_text", "action_text", "result_text"] as const) {
    if (s[key]?.trim()) return true;
  }
  if (s.strengths.length > 0) return true;
  if (s.learnings.length > 0) return true;
  if (s.numbers.some((n) => n?.trim())) return true;
  if (s.interviewer_hooks?.some((h) => h?.trim())) return true;
  if (s.reusable_principles?.some((p) => p?.trim())) return true;
  if (s.interview_supporting_details?.some((d) => d?.trim())) return true;
  if (s.future_outlook_notes?.some((n) => n?.trim())) return true;
  if (s.backstory_notes?.some((n) => n?.trim())) return true;
  if (s.decision_reasons?.some((r) => r?.trim())) return true;
  if (s.before_after_comparisons?.some((c) => c?.trim())) return true;
  if (s.credibility_notes?.some((n) => n?.trim())) return true;
  if (s.role_scope?.trim()) return true;
  return false;
}

export function legacySummaryHasVisibleContent(s: LegacySummary): boolean {
  if (s.summary?.trim()) return true;
  if (s.key_points?.some((p) => typeof p === "string" && p.trim())) return true;
  if (s.numbers?.some((n) => n?.trim())) return true;
  if (s.strengths.length > 0) return true;
  return false;
}

export function getGakuchikaSummaryPreview(
  summary: unknown,
  maxLength = 110
): string | null {
  const parsed = parseGakuchikaSummary(summary);
  if (!parsed) return null;

  const candidates = isStructuredSummary(parsed)
    ? [
        parsed.one_line_core_answer || "",
        [parsed.action_text, parsed.result_text].filter(Boolean).join(" "),
        [parsed.task_text, parsed.action_text].filter(Boolean).join(" "),
        [parsed.situation_text, parsed.task_text].filter(Boolean).join(" "),
      ]
    : [parsed.summary];

  const preview = candidates.find((candidate) => candidate.trim().length > 0)?.trim();
  if (!preview) return null;

  return truncateText(preview.replace(/\s+/g, " "), maxLength);
}
