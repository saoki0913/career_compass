/**
 * Canonical industry taxonomy shared by company forms and ES review.
 * ES review further branches finance into sub-industries so role selection
 * can stay explicit instead of relying on broad app-side inference.
 */
export const INDUSTRIES = [
  "商社",
  "銀行",
  "信託銀行",
  "証券",
  "保険",
  "アセットマネジメント",
  "カード・リース・ノンバンク",
  "政府系・系統金融",
  "コンサルティング",
  "IT・通信",
  "メーカー（電機・機械）",
  "メーカー（食品・日用品）",
  "広告・マスコミ",
  "不動産・建設",
  "小売・流通",
  "サービス・インフラ",
  "医療・福祉",
  "教育",
  "印刷・包装",
  "アパレル・繊維",
  "設備工事・エンジニアリング",
  "公務員・団体",
  "その他",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const FINANCE_SUBINDUSTRIES = [
  "銀行",
  "信託銀行",
  "証券",
  "保険",
  "アセットマネジメント",
  "カード・リース・ノンバンク",
  "政府系・系統金融",
] as const;

export type FinanceSubindustry = (typeof FINANCE_SUBINDUSTRIES)[number];

export const LEGACY_INDUSTRY_EXPANSIONS: Record<string, Industry[]> = {
  "金融・保険": [...FINANCE_SUBINDUSTRIES],
  "その他人気企業": ["その他"],
};

export const PROFILE_JOB_TYPES = [
  "総合職",
  "営業",
  "企画・マーケティング",
  "エンジニア",
  "研究開発 / R&D",
  "データ / AI",
  "コンサルタント",
  "デザイナー / クリエイティブ",
  "コーポレート / 管理",
  "その他",
] as const;

export type ProfileJobType = (typeof PROFILE_JOB_TYPES)[number];

export function canonicalizeIndustry(value?: string | null): Industry | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if ((INDUSTRIES as readonly string[]).includes(normalized)) {
    return normalized as Industry;
  }

  if (normalized === "金融・保険") {
    return null;
  }

  if (normalized === "IT・ソフトウェア") {
    return "IT・通信";
  }

  if (normalized === "その他人気企業") {
    return "その他";
  }

  return null;
}
