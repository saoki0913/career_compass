/** Aligns with `TemplateType` in `@/hooks/useESReview` and FastAPI stream route. */
export type InferredESReviewTemplate =
  | "basic"
  | "company_motivation"
  | "intern_reason"
  | "intern_goals"
  | "gakuchika"
  | "self_pr"
  | "post_join_goals"
  | "role_course_reason"
  | "work_values";

/** Infer ES review template from the question title (aligned with FastAPI / stream route). */
export function inferTemplateTypeFromQuestion(question: string): InferredESReviewTemplate {
  const text = question.trim();
  if (/学生時代|力を入れた|頑張ったこと|学業以外/.test(text)) return "gakuchika";
  if (/(自己pr|自己ＰＲ|自分の強み|あなたの強み|セールスポイント)/i.test(text)) return "self_pr";
  if (/インターン.*(理由|参加)/.test(text)) return "intern_reason";
  if (/インターン.*(学び|やりたい|目標|達成)/.test(text)) return "intern_goals";
  if (/(入社後|将来|実現したい|挑戦したい|やりたいこと)/.test(text)) return "post_join_goals";
  if (/(価値観|大切にしている|働くうえで)/.test(text)) return "work_values";
  if (
    /(職種|コース|部門|領域|デジタル企画|エンジニア|総合職).*理由/.test(text) ||
    (/選択した理由/.test(text) && !/(当社|企業|貴社)/.test(text))
  ) {
    return "role_course_reason";
  }
  if (/(志望理由|なぜ当社|当社を志望|選んだ理由)/.test(text)) return "company_motivation";
  return "basic";
}
