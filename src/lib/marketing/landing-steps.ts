/**
 * LP の HowToUse セクションで表示する利用ステップ（SSOT）。
 * 文言と素材の対応をここに集約し、セクション側のローカル配列化を防ぐ。
 */
export type LandingStep = {
  number: "1" | "2" | "3" | "4";
  label: string;
  description: string;
  numberImage: string;
  icon: string;
  cardImage: string;
  characterImage: string;
  characterAlt: string;
};

export const LANDING_STEPS: readonly LandingStep[] = [
  {
    number: "1",
    label: "企業を登録",
    description: "気になる企業を登録して、情報を一元管理できます。",
    numberImage: "numbers/num-1.png",
    icon: "icons-circled/building.png",
    cardImage: "step-cards/step-1-register.png",
    characterImage: "characters/boy-phone-beige.png",
    characterAlt: "スマートフォンで企業を登録する学生",
  },
  {
    number: "2",
    label: "AIでES作成・添削",
    description: "志望動機やガクチカをAIで作成し、文章を整えます。",
    numberImage: "numbers/num-2.png",
    icon: "icons-circled/document.png",
    cardImage: "step-cards/step-2-es.png",
    characterImage: "characters/boy-notebook.png",
    characterAlt: "ノートを見ながらESを準備する学生",
  },
  {
    number: "3",
    label: "面接対策を進める",
    description: "AI面接官と練習し、回答へのフィードバックを受け取れます。",
    numberImage: "numbers/num-3.png",
    icon: "icons-circled/chat.png",
    cardImage: "step-cards/step-3-interview.png",
    characterImage: "characters/girl-at-laptop.png",
    characterAlt: "ノートPCで面接対策を進める学生",
  },
  {
    number: "4",
    label: "締切・予定を管理",
    description: "選考スケジュールをまとめ、予定の見落としを防ぎます。",
    numberImage: "numbers/num-4.png",
    icon: "icons-circled/calendar.png",
    cardImage: "step-cards/step-4-schedule.png",
    characterImage: "characters/girl-mobile-smile.png",
    characterAlt: "スマートフォンで予定を確認する学生",
  },
] as const;
