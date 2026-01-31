/**
 * Industry options for company registration
 * Used across onboarding, settings, and company creation
 */
export const INDUSTRIES = [
  "IT・通信",
  "メーカー（電機・機械）",
  "メーカー（食品・日用品）",
  "金融・保険",
  "商社",
  "コンサルティング",
  "広告・マスコミ",
  "不動産・建設",
  "小売・流通",
  "サービス・インフラ",
  "医療・福祉",
  "教育",
  "公務員・団体",
  "その他",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
