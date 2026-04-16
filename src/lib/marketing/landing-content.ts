import { CalendarClock, FileText, MessageSquareQuote } from "lucide-react";
import { landingMedia } from "@/components/landing/landing-media";

export const trustPoints = [
  "設問ごとに専用テンプレで添削",
  "成功した時だけクレジット消費",
  "企業情報を踏まえたフィードバック",
  "カード登録不要・すぐに試せる",
] as const;

export const valueStrip = [
  {
    title: "AI添削",
    description:
      "設問に合わせた改善案をAIが提示。書き換え案もその場で確認できる。",
    Icon: FileText,
  },
  {
    title: "対話で整理",
    description:
      "志望動機やガクチカを、AIとの会話で言語化しながら整理できる。",
    Icon: MessageSquareQuote,
  },
  {
    title: "企業・締切管理",
    description: "応募先と締切を一覧にして、次にやることを見失わない。",
    Icon: CalendarClock,
  },
] as const;

export const detailSections = [
  {
    id: "ai-writing",
    title: "ESの作成と添削を、同じ画面でスムーズに。",
    description:
      "ESの下書きから添削、書き直しまでをひとつの画面で完結。添削結果を見ながらその場で修正できるので、効率よく仕上げられます。",
    points: [
      "設問に合わせた改善案をAIが提示",
      "書き換え案を見ながらその場で更新",
      "途中のメモや下書きからでも始められる",
    ],
    image: landingMedia.esReview,
    imageClassName:
      "scale-[1.05] object-top translate-y-[-34px] sm:translate-y-[-52px]",
  },
  {
    id: "management",
    title: "就活の管理は、コレ一つで完結。",
    description:
      "企業一覧、締切、応募状況、Googleカレンダー連携までをひとつにまとめます。情報が散らばらないから、やるべきことに集中できます。",
    points: [
      "企業ごとの応募状況を整理",
      "締切の見落としを防止",
      "次にやることが見えるダッシュボード",
    ],
    image: landingMedia.heroDashboard,
    imageClassName:
      "scale-[1.04] object-top translate-y-[-20px] sm:translate-y-[-34px]",
  },
] as const;
