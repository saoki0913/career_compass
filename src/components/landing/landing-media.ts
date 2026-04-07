import { HERO_PRODUCT_DEMO_VIDEO_PATH } from "@/lib/marketing/product-demo-config";

/**
 * LP（ランディング）用の静的メディアパス。
 * Figma「就活Pass LP作成」デザインから変換した実スクリーンショットを使用。
 */
export type LandingMedia = {
  src: string;
  alt: string;
  videoSrc?: string;
};

export const landingMedia = {
  heroDashboard: {
    src: "/marketing/screenshots/hero-dashboard.png",
    alt: "就活Pass ダッシュボード画面 - 企業管理、ES作成、締切管理、クイックアクション",
    videoSrc: HERO_PRODUCT_DEMO_VIDEO_PATH,
  },
  esReview: {
    src: "/marketing/screenshots/es-review.png",
    alt: "就活Pass ES添削画面 - AIによる改善案の提示と書き換え",
  },
  calendar: {
    src: "/marketing/screenshots/calendar.png",
    alt: "就活Pass カレンダー画面 - 締切とタスクを一覧管理、Googleカレンダー連携",
  },
  motivation: {
    src: "/marketing/screenshots/motivation.png",
    alt: "就活Pass 志望動機作成画面 - AIとの対話で志望動機を言語化",
  },
  logoIcon: {
    src: "/marketing/screenshots/logo-icon.png",
    alt: "就活Pass",
  },
} as const satisfies Record<string, LandingMedia>;
