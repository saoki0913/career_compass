import type { TemplateType } from "./types";

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  basic: "汎用ES添削",
  company_motivation: "志望理由",
  intern_reason: "インターン志望理由",
  intern_goals: "インターンでやりたいこと・学びたいこと",
  gakuchika: "ガクチカ",
  self_pr: "自己PR",
  post_join_goals: "入社してからやりたいこと",
  role_course_reason: "職種・コースを選択した理由",
  work_values: "働くうえで大切にしている価値観",
};

export const TEMPLATE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "company_motivation", label: "志望理由" },
  { value: "intern_reason", label: "インターン志望理由" },
  { value: "intern_goals", label: "インターンでやりたいこと・学びたいこと" },
  { value: "gakuchika", label: "ガクチカ" },
  { value: "self_pr", label: "自己PR" },
  { value: "post_join_goals", label: "入社してからやりたいこと" },
  { value: "role_course_reason", label: "職種・コースを選択した理由" },
  { value: "work_values", label: "働くうえで大切にしている価値観" },
];

export const TEMPLATE_EXTRA_FIELDS: Record<TemplateType, string[]> = {
  basic: [],
  company_motivation: [],
  intern_reason: ["intern_name"],
  intern_goals: ["intern_name"],
  gakuchika: [],
  self_pr: [],
  post_join_goals: [],
  role_course_reason: [],
  work_values: [],
};

export const EXTRA_FIELD_LABELS: Record<string, string> = {
  intern_name: "インターン名",
  role_name: "職種・コース名",
};
