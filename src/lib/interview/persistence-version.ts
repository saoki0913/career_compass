/**
 * Phase 2 Stage 0-3: evaluation harness lineage metadata.
 * Upstream FastAPI emits these on every `complete` SSE payload (prompt_version /
 * followup_policy_version come from `backend/app/prompts/interview_prompts.py` constants,
 * case_seed_version is null until Stage 3 CaseBrief lands).
 * DB columns default to "unknown" for prompt_version / followup_policy_version so that
 * legacy callers and older upstream payloads remain safe.
 */
export type InterviewVersionMetadata = {
  promptVersion?: string | null;
  followupPolicyVersion?: string | null;
  caseSeedVersion?: string | null;
};

export function resolveVersionString(value: string | null | undefined): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "unknown";
}

export function resolveNullableVersionString(value: string | null | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}
