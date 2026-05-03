export type ESReviewTemplateType =
  | "basic"
  | "company_motivation"
  | "intern_reason"
  | "intern_goals"
  | "gakuchika"
  | "self_pr"
  | "post_join_goals"
  | "role_course_reason"
  | "work_values";

const INDUSTRY_REQUIRED_TEMPLATES = new Set<ESReviewTemplateType>([
  "company_motivation",
  "post_join_goals",
  "role_course_reason",
  "intern_reason",
  "intern_goals",
]);

const ROLE_REQUIRED_TEMPLATES = new Set<ESReviewTemplateType>([
  "company_motivation",
  "post_join_goals",
  "role_course_reason",
]);

export function requiresIndustryForESReviewTemplate(templateType: ESReviewTemplateType): boolean {
  return INDUSTRY_REQUIRED_TEMPLATES.has(templateType);
}

export function requiresRoleForESReviewTemplate(templateType: ESReviewTemplateType): boolean {
  return ROLE_REQUIRED_TEMPLATES.has(templateType);
}
