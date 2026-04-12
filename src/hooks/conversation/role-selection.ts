type RoleOptionLike = {
  value: string;
  source:
    | "industry_default"
    | "company_override"
    | "application_job_type"
    | "document_job_type";
};

type RoleSelectionSource = RoleOptionLike["source"] | "custom";

export function resolveRoleSelection(args: {
  resolvedRole: string;
  resolvedSource: string | null;
  availableOptions: RoleOptionLike[];
}): {
  selectedRoleName: string;
  roleSelectionSource: RoleSelectionSource | null;
  customRoleInput: string;
} {
  const role = args.resolvedRole.trim();
  const matchedOption = args.availableOptions.find((option) => option.value === role) ?? null;

  if (args.resolvedSource === "user_free_text") {
    return {
      selectedRoleName: role,
      roleSelectionSource: "custom",
      customRoleInput: role,
    };
  }

  if (matchedOption) {
    return {
      selectedRoleName: role,
      roleSelectionSource: matchedOption.source,
      customRoleInput: "",
    };
  }

  if (role) {
    return {
      selectedRoleName: role,
      roleSelectionSource: "custom",
      customRoleInput: role,
    };
  }

  return {
    selectedRoleName: "",
    roleSelectionSource: (args.resolvedSource as RoleSelectionSource | null) ?? null,
    customRoleInput: "",
  };
}
