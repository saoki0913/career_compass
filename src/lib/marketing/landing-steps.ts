import { FileText, Sparkles, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * LP の HowItWorks セクションで表示する利用開始ステップ（SSOT）。
 * ドリフト防止のため、HowItWorksSection.tsx からのみ参照する。
 */
export type LandingStep = {
  label: string;
  description: string;
  Icon: LucideIcon;
};

export const LANDING_STEPS: readonly LandingStep[] = [
  {
    label: "ESを貼り付ける",
    description: "下書きやメモを貼り付けて、設問タイプを選ぶだけ。",
    Icon: FileText,
  },
  {
    label: "AIが改善案を提示",
    description: "設問に合わせた添削結果をすぐに確認。",
    Icon: Sparkles,
  },
  {
    label: "気に入ったら保存・継続",
    description:
      "Googleアカウントで保存すれば、企業管理やカレンダー連携も。",
    Icon: UserPlus,
  },
] as const;
