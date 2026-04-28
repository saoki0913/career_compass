export type MarketingFaq = { readonly question: string; readonly answer: string };

export const LANDING_PAGE_FAQS: readonly MarketingFaq[] = [
  {
    question: "無料プランでも使えますか？",
    answer:
      "はい。まずは無料プランから始められます。必要に応じて、あとから有料プランへアップグレードできます。",
  },
  {
    question: "クレジットカード登録は必要ですか？",
    answer:
      "いいえ。無料ではじめる時点では、クレジットカード登録は不要です。",
  },
  {
    question: "ES添削では何ができますか？",
    answer:
      "AIがESの構成や表現を見直し、改善ポイントを提案します。伝わりやすい文章に整えるサポートが可能です。",
  },
  {
    question: "面接対策機能では何をしますか？",
    answer:
      "AIとの模擬面接を通じて、受け答えの練習や改善点のフィードバックを受けられます。",
  },
  {
    question: "企業管理や締切管理もできますか？",
    answer:
      "はい。応募企業の情報や選考状況、ES締切や面接予定をまとめて管理できます。",
  },
  {
    question: "Googleカレンダーと連携できますか？",
    answer:
      "はい。予定をGoogleカレンダーに連携できるため、面接や締切の見落としを防ぎやすくなります。",
  },
] as const;
