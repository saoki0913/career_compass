import type { Feedback } from "@/lib/interview/ui";

// ---------------------------------------------------------------------------
// Input: subset of controller state consumed by business derivations
// ---------------------------------------------------------------------------

export interface InterviewViewModelInput {
  companyId: string | string[] | undefined;
  feedback: Feedback | null;
}

// ---------------------------------------------------------------------------
// Output: derived business state
// ---------------------------------------------------------------------------

export interface InterviewViewModel {
  /** Normalized companyId (null if the URL param is empty/invalid) */
  normalizedCompanyId: string | null;
  /** The weakest scoring axis from the feedback, for the drill panel */
  weakestAxis: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInterviewViewModel(input: InterviewViewModelInput): InterviewViewModel {
  const { companyId, feedback } = input;

  const normalizedCompanyId = normalizeInterviewCompanyId(companyId);
  const weakestAxis = feedback ? deriveInterviewWeakestAxis(feedback.scores) : null;

  return {
    normalizedCompanyId,
    weakestAxis,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (testable without React)
// ---------------------------------------------------------------------------

/**
 * Avoid `/api/companies//...` which redirects to `/api/companies/...` and
 * returns HTML 404 (no `[id]` route).
 */
export function normalizeInterviewCompanyId(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deriveInterviewWeakestAxis(scores: Feedback["scores"]): string | null {
  let weakest: string | null = null;
  let lowest = Infinity;
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value === "number" && value < lowest) {
      lowest = value;
      weakest = key;
    }
  }
  return weakest;
}
