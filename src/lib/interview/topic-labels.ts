export const UNKNOWN_INTERVIEW_TOPIC_LABEL = "確認項目";

export const INTERVIEW_TOPIC_LABELS = {
  motivation_fit: "志望動機",
  motivation_origin: "志望理由",
  company_fit: "企業適性",
  company_reason: "企業理解",
  company_compare_check: "他社比較",
  competitor_comparison: "他社比較",
  role_understanding: "職種理解",
  role_reason: "職種志望",
  career_alignment: "キャリア一貫性",
  career_vision: "キャリアビジョン",
  culture_fit_values: "価値観適合",
  gakuchika_process: "行動プロセス",
  gakuchika_causality: "成果要因",
  gakuchika_reproducibility: "再現性",
  ownership_scope: "主体性",
  quantitative_evidence: "定量根拠",
  learning_reproducibility: "学びの活用",
  personality: "人物面",
  academic_application: "学業活用",
  research_application: "研究活用",
  learning_motivation: "学習意欲",
  work_understanding: "業務理解",
  case_fit: "ケース適性",
  structured_thinking: "構造化思考",
  prioritization: "優先順位",
  analytical_approach: "分析力",
  data_handling: "データ活用",
  technical_depth: "技術理解",
  design_decision: "設計判断",
  system_design: "システム設計",
  reliability: "信頼性",
  user_understanding: "顧客理解",
  life_narrative_core: "自分史",
  turning_point_values: "価値観",
  motivation_bridge: "志望一貫性",
  final_commitment: "志望度",
  reverse_question: "逆質問",
  growth_opportunity: "成長機会",
  credibility_check: "信憑性",
  consistency_check: "一貫性",
  pressure_followup: "深掘り耐性",
  experience: "経験",
  company_understanding: "企業理解",
  industry_reason: "業界理解",
  industry_understanding: "業界理解",
  opening: "導入",
  feedback: "講評",
  motivation: "志望動機",
  leadership: "リーダーシップ",
  teamwork: "チームワーク",
  gakuchika: "ガクチカ",
  self_pr: "自己PR",
  strengths: "強み",
  weaknesses: "弱み",
  career: "キャリア",
  communication: "コミュニケーション",
  problem_solving: "課題解決",
  creativity: "創造性",
  adaptability: "適応力",
  values: "価値観",
  growth: "成長経験",
  failure_experience: "失敗経験",
  success_experience: "成功体験",
  academic: "学業・研究",
  research: "研究活動",
  intro: "導入",
} as const;

export type InterviewTopicKey = keyof typeof INTERVIEW_TOPIC_LABELS;

const JAPANESE_TEXT_PATTERN = /[　-鿿＀-￯]/;

export function isInterviewTopicKey(value: string): value is InterviewTopicKey {
  return Object.prototype.hasOwnProperty.call(INTERVIEW_TOPIC_LABELS, value);
}

export function labelInterviewTopic(value: string | null | undefined): string {
  const topic = typeof value === "string" ? value.trim() : "";
  if (!topic) return UNKNOWN_INTERVIEW_TOPIC_LABEL;
  if (isInterviewTopicKey(topic)) return INTERVIEW_TOPIC_LABELS[topic];
  if (JAPANESE_TEXT_PATTERN.test(topic)) return topic;
  return UNKNOWN_INTERVIEW_TOPIC_LABEL;
}
