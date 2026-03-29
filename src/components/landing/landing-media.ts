import { HERO_PRODUCT_DEMO_VIDEO_PATH } from "@/lib/marketing/product-demo-config";

/**
 * LP（ランディング）用の静的メディアパス。
 * 画像は `public/marketing/placeholders/` を参照。差し替え手順は docs/marketing/README.md を参照。
 */
export type LandingMedia = {
  src: string;
  alt: string;
  videoSrc?: string;
};

export const landingMedia = {
  heroDashboard: {
    src: "/marketing/placeholders/hero-dashboard.svg",
    alt: "就活Passの企業管理と今日やることを確認できるダッシュボード画面",
    videoSrc: HERO_PRODUCT_DEMO_VIDEO_PATH,
  },
  esReview: {
    src: "/marketing/placeholders/es-review-placeholder.svg",
    alt: "ES本文とAI添削パネルを並べて確認できる就活Passの添削画面",
  },
  gakuchika: {
    src: "/marketing/placeholders/gakuchika-placeholder.svg",
    alt: "質問に答えながらガクチカや志望動機の材料を整理する対話画面",
  },
  companies: {
    src: "/marketing/placeholders/companies-placeholder.svg",
    alt: "企業一覧と締切状況をまとめて管理できる就活Passの企業管理画面",
  },
  motivation: {
    src: "/marketing/placeholders/motivation-placeholder.svg",
    alt: "会話しながら志望動機や自己分析の材料を整理する就活Passの対話画面",
  },
} as const satisfies Record<string, LandingMedia>;
