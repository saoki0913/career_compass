import type { MarketingFaq } from "./landing-faqs";

export const SHUKATSU_KANRI_PAGE_FAQS: readonly MarketingFaq[] = [
  {
    question: "就活Pass の締切管理は何ができますか？",
    answer:
      "ES 提出、Web テスト、説明会、面接、内定承諾など、就活で抜けやすい期限を企業ごとに管理できます。企業 URL から選考スケジュールを AI で自動抽出し、ユーザー承認を経て締切として確定する流れです。",
  },
  {
    question: "Google カレンダーと連携できますか？",
    answer:
      "はい、Google OAuth でカレンダー連携し、就活Pass の締切と Google カレンダーの予定を PATCH 同期できます。移動時間や他の予定と一緒に管理しやすくなります。",
  },
  {
    question: "締切の自動抽出はどこまで信用してよいですか？",
    answer:
      "自動抽出した締切は、そのままでは確定しません。ユーザーが内容を確認し、承認した時だけ実際の締切として登録されます。誤抽出があっても反映前にチェックできる設計です。",
  },
  {
    question: "通知はいつ届きますか？",
    answer:
      "締切基準時刻は JST（Asia/Tokyo）で、日次リセットや通知もこれに合わせます。詳細な通知タイミングは「通知」「締切」機能の設定に従います。",
  },
  {
    question: "ES 添削や志望動機作成と連動しますか？",
    answer:
      "はい。企業ごとの締切・応募状況・提出書類を 1 箇所で管理しながら、ES 添削 AI、志望動機 AI、ガクチカ AI、AI 模擬面接へ同じ企業データで遷移できます。",
  },
];
