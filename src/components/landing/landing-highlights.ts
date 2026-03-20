import {
  Building2,
  MessageSquare,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

/** 機能詳細（#features 内の id）へジャンプする要点タイル。landing-features と矛盾しない短文のみ。 */
export interface LandingHighlight {
  featureId: string;
  href: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
}

export const landingHighlights: LandingHighlight[] = [
  {
    featureId: "es-review",
    href: "#es-review",
    title: "設問タイプ別のAI添削",
    blurb: "直しどころと書き換え案を提示。",
    icon: Sparkles,
  },
  {
    featureId: "motivation",
    href: "#motivation",
    title: "志望動機を対話で整理",
    blurb: "企業理解と軸を言語化。",
    icon: Target,
  },
  {
    featureId: "gakuchika",
    href: "#gakuchika",
    title: "ガクチカを深掘り",
    blurb: "質問に答えて芯を見つける。",
    icon: MessageSquare,
  },
  {
    featureId: "companies",
    href: "#companies",
    title: "締切と選考を一覧管理",
    blurb: "カレンダー連携で漏れなく。",
    icon: Building2,
  },
];
