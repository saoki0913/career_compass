import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import {
  canonicalizeInterviewFormat,
  classifyInterviewRoleTrack,
  INTERVIEW_STAGE_OPTIONS,
  INTERVIEWER_TYPE_OPTIONS,
  ROLE_TRACK_OPTIONS,
  SELECTION_TYPE_OPTIONS,
  STRICTNESS_MODE_OPTIONS,
  type InterviewRoundStage,
  type InterviewSelectionType,
  type InterviewerType,
} from "@/lib/interview/session";
import type { InterviewSetupState, PersistedInterviewSetup } from "@/lib/interview/types";

export function parseEnumValue<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function inferSelectionType(applicationTypes: string[]): InterviewSelectionType {
  return applicationTypes.some((type) => ["summer_intern", "fall_intern", "winter_intern"].includes(type))
    ? "internship"
    : "fulltime";
}

function inferInterviewStage(companyStatus: string | null | undefined): InterviewRoundStage {
  if (companyStatus === "final_interview") return "final";
  if (companyStatus === "interview_1" || companyStatus === "interview_2" || companyStatus === "waiting_result") {
    return "mid";
  }
  return "early";
}

function inferInterviewerType(stage: InterviewRoundStage): InterviewerType {
  if (stage === "final") return "executive";
  if (stage === "early") return "hr";
  return "line_manager";
}

export function buildSetupState(input: {
  companyName: string;
  companyIndustry: string | null;
  companyStatus: string | null | undefined;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  applicationTypes: string[];
  applicationRoles: string[];
  persisted?: PersistedInterviewSetup | null;
}): InterviewSetupState {
  const resolution = resolveMotivationRoleContext({
    companyName: input.companyName,
    companyIndustry: input.companyIndustry,
    selectedIndustry: input.selectedIndustry,
    applicationRoles: input.applicationRoles,
  });

  const selectedRole = input.selectedRole;
  const interviewStage = parseEnumValue(
    input.persisted?.interviewStage,
    INTERVIEW_STAGE_OPTIONS,
    inferInterviewStage(input.companyStatus),
  );

  return {
    selectedIndustry: input.selectedIndustry || resolution.resolvedIndustry,
    selectedRole,
    selectedRoleSource: input.selectedRoleSource,
    resolvedIndustry: resolution.resolvedIndustry,
    requiresIndustrySelection: resolution.requiresIndustrySelection,
    industryOptions: [...resolution.industryOptions],
    roleTrack: parseEnumValue(
      input.persisted?.roleTrack,
      ROLE_TRACK_OPTIONS,
      classifyInterviewRoleTrack(selectedRole),
    ),
    interviewFormat: canonicalizeInterviewFormat(input.persisted?.interviewFormat),
    selectionType: parseEnumValue(
      input.persisted?.selectionType,
      SELECTION_TYPE_OPTIONS,
      inferSelectionType(input.applicationTypes),
    ),
    interviewStage,
    interviewerType: parseEnumValue(
      input.persisted?.interviewerType,
      INTERVIEWER_TYPE_OPTIONS,
      inferInterviewerType(interviewStage),
    ),
    strictnessMode: parseEnumValue(
      input.persisted?.strictnessMode,
      STRICTNESS_MODE_OPTIONS,
      "standard",
    ),
  };
}

export function isLegacyInterviewConversation(row: {
  turnStateJson?: unknown;
  roleTrack?: string | null;
  interviewFormat?: string | null;
  selectionType?: string | null;
  interviewStage?: string | null;
  interviewerType?: string | null;
  strictnessMode?: string | null;
} | null): boolean {
  if (!row) return false;
  return !row.turnStateJson ||
    !row.roleTrack ||
    !row.interviewFormat ||
    !row.selectionType ||
    !row.interviewStage ||
    !row.interviewerType ||
    !row.strictnessMode;
}
