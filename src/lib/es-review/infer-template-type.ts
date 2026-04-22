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

export type InferredESReviewTemplateConfidence = "high" | "medium" | "low";
export type InferredESReviewGroundingLevel = "none" | "light" | "standard" | "deep";

export interface InferredESReviewTemplateDetails {
  templateType: InferredESReviewTemplate;
  confidence: InferredESReviewTemplateConfidence;
  matchedRule: string;
  secondaryCandidates: InferredESReviewTemplate[];
  rationale: string;
  requiresCompanyRag: boolean;
  recommendedGroundingLevel: InferredESReviewGroundingLevel;
}

function details(
  templateType: InferredESReviewTemplate,
  confidence: InferredESReviewTemplateConfidence,
  matchedRule: string,
  options?: Partial<Omit<InferredESReviewTemplateDetails, "templateType" | "confidence" | "matchedRule">>,
): InferredESReviewTemplateDetails {
  return {
    templateType,
    confidence,
    matchedRule,
    secondaryCandidates: options?.secondaryCandidates ?? [],
    rationale: options?.rationale ?? "",
    requiresCompanyRag: options?.requiresCompanyRag ?? false,
    recommendedGroundingLevel: options?.recommendedGroundingLevel ?? "none",
  };
}

export function inferTemplateTypeDetailsFromQuestion(question: string): InferredESReviewTemplateDetails {
  const text = question.trim();
  if (/学生時代|力を入れた|頑張ったこと|学業以外|最も困難だった経験/.test(text)) {
    return details("gakuchika", "high", "gakuchika", {
      secondaryCandidates: ["self_pr"],
      rationale: "学生時代の経験や取り組みを問う表現が明確です。",
      requiresCompanyRag: false,
      recommendedGroundingLevel: "none",
    });
  }
  if (/(自己pr|自己ＰＲ|自分の強み|あなたの強み|セールスポイント)/i.test(text)) {
    return details("self_pr", "high", "self_pr", {
      secondaryCandidates: ["gakuchika"],
      rationale: "強みや自己PRを直接たずねる表現が含まれています。",
      requiresCompanyRag: false,
      recommendedGroundingLevel: "light",
    });
  }
  if (/インターン/.test(text) && /(学びたい|得たい|身につけたい|目標|達成|やりたい)/.test(text)) {
    return details("intern_goals", "high", "intern_goals", {
      secondaryCandidates: ["intern_reason"],
      rationale: "インターンで学びたいことや得たいことを問う表現が明確です。",
      requiresCompanyRag: true,
      recommendedGroundingLevel: "standard",
    });
  }
  if (/インターン/.test(text) && /(理由|参加理由|参加したい)/.test(text)) {
    return details("intern_reason", "high", "intern_reason", {
      secondaryCandidates: ["intern_goals"],
      rationale: "インターンに参加する理由を問う表現が明確です。",
      requiresCompanyRag: true,
      recommendedGroundingLevel: "standard",
    });
  }
  if (/(価値観|大切にしている|働くうえで|仕事観)/.test(text)) {
    return details("work_values", "high", "work_values", {
      secondaryCandidates: ["self_pr"],
      rationale: "働くうえで大切にしたい価値観を問う表現が含まれています。",
      requiresCompanyRag: false,
      recommendedGroundingLevel: "light",
    });
  }
  if (
    /(職種|コース|部門|領域|デジタル企画|エンジニア|総合職).*理由/.test(text) ||
    (/選択した理由/.test(text) && !/(当社|企業|貴社|御社)/.test(text)) ||
    (/(職種|コース|部門|領域)/.test(text) && /(志望|志望理由|理由)/.test(text))
  ) {
    return details("role_course_reason", "high", "role_course_reason", {
      secondaryCandidates: ["company_motivation"],
      rationale: "職種・コース・部門など役割選択の理由を問う表現が含まれています。",
      requiresCompanyRag: true,
      recommendedGroundingLevel: "deep",
    });
  }
  if (/(入社後|将来|実現したい|挑戦したい|やりたいこと)/.test(text)) {
    return details("post_join_goals", "high", "post_join_goals", {
      secondaryCandidates: ["company_motivation"],
      rationale: "入社後や将来に実現したいことを問う表現が含まれています。",
      requiresCompanyRag: true,
      recommendedGroundingLevel: "standard",
    });
  }
  if (/(志望理由|志望する理由|志望動機|なぜ当社|当社を志望|当社を選んだ理由|貴社を志望|御社を志望)/.test(text)) {
    return details("company_motivation", "high", "company_motivation", {
      secondaryCandidates: ["role_course_reason"],
      rationale: "企業を志望する理由を直接たずねる表現が含まれています。",
      requiresCompanyRag: true,
      recommendedGroundingLevel: "deep",
    });
  }
  if (/(当社|貴社|御社)/.test(text) && /(大切|重視|共感|魅力)/.test(text)) {
    return details("basic", "low", "fallback_basic", {
      secondaryCandidates: ["work_values", "company_motivation"],
      rationale: "会社への言及はありますが、価値観設問か志望理由設問かが断定しきれません。",
      requiresCompanyRag: false,
      recommendedGroundingLevel: "light",
    });
  }
  if (/インターン/.test(text)) {
    return details("basic", "low", "fallback_basic", {
      secondaryCandidates: ["intern_reason", "intern_goals"],
      rationale: "インターン文脈ですが、理由か目標かを断定する語が不足しています。",
      requiresCompanyRag: false,
      recommendedGroundingLevel: "light",
    });
  }
  return details("basic", "low", "fallback_basic", {
    secondaryCandidates: [],
    rationale: "設問タイプを断定する決め手が少ないため、汎用添削として扱います。",
    requiresCompanyRag: false,
    recommendedGroundingLevel: "none",
  });
}

/** Infer ES review template from the question title (aligned with FastAPI / stream route). */
export function inferTemplateTypeFromQuestion(question: string): InferredESReviewTemplate {
  return inferTemplateTypeDetailsFromQuestion(question).templateType;
}
