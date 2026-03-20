import {
  Sparkles,
  MessageSquare,
  Building2,
  Target,
  type LucideIcon,
} from "lucide-react";
import { landingMedia, type LandingMedia } from "./landing-media";

export interface LandingFeature {
  id: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  image: LandingMedia;
  points: string[];
}

export const landingFeatures: LandingFeature[] = [
  {
    id: "es-review",
    icon: Sparkles,
    kicker: "AI添削",
    title: "設問の型に合わせて、直しどころが見える。",
    description:
      "8つの設問タイプから選ぶと、評価の切り口が変わります。改善ポイントと書き換え案をセットで提示。",
    image: landingMedia.esReview,
    points: [
      "設問タイプ8種対応",
      "改善ポイント＋書き換え案",
    ],
  },
  {
    id: "motivation",
    icon: Target,
    kicker: "志望動機",
    title: "対話しながら、企業理解と軸を言語化。",
    description:
      "企業ページから始める対話型の志望動機づくり。会話を重ねて企業理解・自己分析・差別化を整理し、下書きへ。",
    image: landingMedia.motivation,
    points: ["企業コンテキストを踏まえた質問", "会話から下書きを生成"],
  },
  {
    id: "gakuchika",
    icon: MessageSquare,
    kicker: "ガクチカ深掘り",
    title: "答えるだけで、エピソードの芯が見える。",
    description:
      "AIの質問に答えていくだけで、面接で話せるエピソードが整理されます。そのままESの素材にも。",
    image: landingMedia.gakuchika,
    points: ["対話形式で引き出す", "整理した内容をESに活用"],
  },
  {
    id: "companies",
    icon: Building2,
    kicker: "企業・締切・カレンダー",
    title: "選考の状況と締切を、一覧で把握。",
    description:
      "志望企業の選考状況と締切をまとめて管理。Googleカレンダー連携で、次にやることがすぐわかる。",
    image: landingMedia.companies,
    points: ["企業・応募の整理", "Googleカレンダー連携"],
  },
];
