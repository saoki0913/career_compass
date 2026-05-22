import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import type { MotivationSetupSnapshot } from "@/lib/motivation/conversation-payload";
import type { RoleOptionsResponse } from "@/shared/contracts/interview/role-options";

export type IndustryResolutionSource = "company_field" | "company_override" | "user_selected";

export type ResolvedIndustryState =
  | {
      kind: "resolved";
      industry: string;
      source: IndustryResolutionSource;
      industryOptions: readonly string[];
    }
  | {
      kind: "requires_selection";
      industry: null;
      industryOptions: readonly string[];
    };

export function resolveIndustryState(input: {
  companyName?: string | null;
  companyIndustry?: string | null;
  selectedIndustry?: string | null;
  selectedIndustrySource?: IndustryResolutionSource | null;
}): ResolvedIndustryState {
  const resolution = resolveMotivationRoleContext({
    companyName: input.companyName,
    companyIndustry: input.companyIndustry,
    selectedIndustry: input.selectedIndustry,
  });

  if (resolution.resolvedIndustry) {
    return {
      kind: "resolved",
      industry: resolution.resolvedIndustry,
      source: input.selectedIndustrySource ?? resolution.industrySource ?? "company_field",
      industryOptions: resolution.industryOptions,
    };
  }

  return {
    kind: "requires_selection",
    industry: null,
    industryOptions: resolution.industryOptions,
  };
}

export function toRequestIndustry(state: ResolvedIndustryState): string | null {
  return state.kind === "resolved" ? state.industry : null;
}

export function isMotivationSetupReady(
  state: ResolvedIndustryState,
  selectedRole: string | null | undefined,
): boolean {
  return state.kind === "resolved" && Boolean(selectedRole?.trim());
}

export function selectIndustryStateFromRoleOptions(input: {
  companyName?: string | null;
  companyIndustry?: string | null;
  roleOptionsData?: RoleOptionsResponse | null;
  setupSnapshot?: MotivationSetupSnapshot | null;
  userSelectedIndustry?: string | null;
  selectedIndustrySource?: IndustryResolutionSource | null;
}): ResolvedIndustryState {
  const explicitSelection = input.userSelectedIndustry?.trim();
  if (explicitSelection) {
    return resolveIndustryState({
      companyName: input.companyName ?? input.roleOptionsData?.companyName,
      companyIndustry: input.companyIndustry,
      selectedIndustry: explicitSelection,
      selectedIndustrySource: input.selectedIndustrySource,
    });
  }

  if (input.roleOptionsData?.industry) {
    return {
      kind: "resolved",
      industry: input.roleOptionsData.industry,
      source: "company_field",
      industryOptions: input.roleOptionsData.industryOptions,
    };
  }

  const snapshotIndustry =
    input.setupSnapshot?.selectedIndustry ?? input.setupSnapshot?.resolvedIndustry ?? null;
  if (snapshotIndustry) {
    return resolveIndustryState({
      companyName: input.companyName ?? input.roleOptionsData?.companyName,
      companyIndustry: input.companyIndustry,
      selectedIndustry: snapshotIndustry,
      selectedIndustrySource: input.selectedIndustrySource,
    });
  }

  if (input.roleOptionsData?.requiresIndustrySelection) {
    return {
      kind: "requires_selection",
      industry: null,
      industryOptions: input.roleOptionsData.industryOptions,
    };
  }

  return resolveIndustryState({
    companyName: input.companyName ?? input.roleOptionsData?.companyName,
    companyIndustry: input.companyIndustry ?? input.roleOptionsData?.industry ?? null,
    selectedIndustrySource: input.selectedIndustrySource,
  });
}
