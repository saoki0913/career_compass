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

export type InferredESReviewTemplateConfidence = "high" | "low";

export interface InferredESReviewTemplateDetails {
  templateType: InferredESReviewTemplate;
  confidence: InferredESReviewTemplateConfidence;
  matchedRule: string;
}

function details(
  templateType: InferredESReviewTemplate,
  confidence: InferredESReviewTemplateConfidence,
  matchedRule: string,
): InferredESReviewTemplateDetails {
  return { templateType, confidence, matchedRule };
}

export function inferTemplateTypeDetailsFromQuestion(question: string): InferredESReviewTemplateDetails {
  const text = question.trim();
  if (/学生時代|力を入れた|頑張ったこと|学業以外/.test(text)) return details("gakuchika", "high", "gakuchika");
  if (/(自己pr|自己ＰＲ|自分の強み|あなたの強み|セールスポイント)/i.test(text)) {
    return details("self_pr", "high", "self_pr");
  }
  if (/インターン/.test(text) && /(学びたい|得たい|身につけたい|目標|達成|やりたい)/.test(text)) {
    return details("intern_goals", "high", "intern_goals");
  }
  if (/インターン/.test(text) && /(理由|参加理由|参加したい)/.test(text)) {
    return details("intern_reason", "high", "intern_reason");
  }
  if (/(価値観|大切にしている|働くうえで)/.test(text)) return details("work_values", "high", "work_values");
  if (
    /(職種|コース|部門|領域|デジタル企画|エンジニア|総合職).*理由/.test(text) ||
    (/選択した理由/.test(text) && !/(当社|企業|貴社|御社)/.test(text)) ||
    (/(職種|コース|部門|領域)/.test(text) && /(志望|志望理由|理由)/.test(text))
  ) {
    return details("role_course_reason", "high", "role_course_reason");
  }
  if (/(入社後|将来|実現したい|挑戦したい|やりたいこと)/.test(text)) {
    return details("post_join_goals", "high", "post_join_goals");
  }
  if (/(志望理由|志望動機|なぜ当社|当社を志望|当社を選んだ理由|貴社を志望|御社を志望)/.test(text)) {
    return details("company_motivation", "high", "company_motivation");
  }
  return details("basic", "low", "fallback_basic");
}

/** Infer ES review template from the question title (aligned with FastAPI / stream route). */
export function inferTemplateTypeFromQuestion(question: string): InferredESReviewTemplate {
  return inferTemplateTypeDetailsFromQuestion(question).templateType;
}
