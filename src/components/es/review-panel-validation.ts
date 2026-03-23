export type ReviewValidationField = "intern_name" | "industry" | "role_name";

export interface ReviewValidationIssue {
  field: ReviewValidationField;
  section: "template" | "industry";
  label: string;
  message: string;
}

interface ReviewValidationInput {
  requiresInternName: boolean;
  internName: string;
  hasSelectedCompany: boolean;
  requiresIndustrySelection: boolean;
  selectedIndustry: string | null;
  selectedRoleName: string;
}

export function getReviewValidationIssues(input: ReviewValidationInput): ReviewValidationIssue[] {
  const issues: ReviewValidationIssue[] = [];

  if (input.requiresInternName && !input.internName.trim()) {
    issues.push({
      field: "intern_name",
      section: "template",
      label: "インターン名",
      message: "インターン名を入力してください。",
    });
  }

  if (input.hasSelectedCompany && input.requiresIndustrySelection && !input.selectedIndustry) {
    issues.push({
      field: "industry",
      section: "industry",
      label: "業界",
      message: "先に業界を選択してください。",
    });
  }

  if (input.hasSelectedCompany && !input.selectedRoleName.trim()) {
    issues.push({
      field: "role_name",
      section: "industry",
      label: "職種",
      message: "先に職種を選択してください。",
    });
  }

  return issues;
}
