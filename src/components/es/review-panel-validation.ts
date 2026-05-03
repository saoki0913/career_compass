/** 5文字以下は添削不可。FastAPI 側も同じ 6 文字下限で拒否する。 */
export const MIN_REVIEW_SECTION_BODY_CHARS = 6;

export type ReviewValidationField = "section_content" | "intern_name" | "industry" | "role_name";

export interface ReviewValidationIssue {
  field: ReviewValidationField;
  section: "section_preview" | "template" | "industry";
  label: string;
  message: string;
}

interface ReviewValidationInput {
  sectionContent: string;
  requiresInternName: boolean;
  internName: string;
  hasSelectedCompany: boolean;
  requiresIndustrySelection: boolean;
  requiresRoleSelection: boolean;
  selectedIndustry: string | null;
  selectedRoleName: string;
}

export function getReviewValidationIssues(input: ReviewValidationInput): ReviewValidationIssue[] {
  const issues: ReviewValidationIssue[] = [];

  if (input.sectionContent.trim().length < MIN_REVIEW_SECTION_BODY_CHARS) {
    issues.push({
      field: "section_content",
      section: "section_preview",
      label: "本文",
      message: "本文を6文字以上入力してください。",
    });
  }

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

  if (input.hasSelectedCompany && input.requiresRoleSelection && !input.selectedRoleName.trim()) {
    issues.push({
      field: "role_name",
      section: "industry",
      label: "職種",
      message: "先に職種を選択してください。",
    });
  }

  return issues;
}
