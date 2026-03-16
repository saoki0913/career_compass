import {
  Sparkles,
  MessageSquare,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface LandingFeature {
  id: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  image: string;
  points: string[];
}

export const landingFeatures: LandingFeature[] = [
  {
    id: "es-review",
    icon: Sparkles,
    kicker: "AI添削",
    title: "下書きのまま、プロ級に。",
    description:
      "構成・具体性・論理の一貫性を8つの観点でスコア化。何をどう直すかが明確になるから、手が止まりません。",
    image: "/screenshots/es-review.png",
    points: ["8種類の専門テンプレート", "3パターンの改善案提示"],
  },
  {
    id: "gakuchika",
    icon: MessageSquare,
    kicker: "ガクチカ深掘り",
    title: "答えるだけで、強みが言葉に。",
    description:
      "AIの質問に答えていくだけで、面接で話せるエピソードが整理されます。一人でも、深掘りできる。",
    image: "/screenshots/gakuchika-chat.png",
    points: ["対話形式でAIが引き出す", "整理した内容をESにそのまま活用"],
  },
  {
    id: "companies",
    icon: Building2,
    kicker: "選考・締切管理",
    title: "もう、締切は見逃さない。",
    description:
      "志望企業の選考状況と締切を一覧管理。Googleカレンダーに自動同期して、次にやることが一目で分かります。",
    image: "/screenshots/companies.png",
    points: ["企業情報をAIが自動整理", "Googleカレンダー連携"],
  },
];
