export type LandingMedia = {
  src: string;
  alt: string;
};

export const landingMedia = {
  heroDashboard: {
    src: "/marketing/placeholders/hero-dashboard.svg",
    alt: "就活Passのダッシュボードを模したダミーイメージ",
  },
  esReview: {
    src: "/marketing/placeholders/es-review-placeholder.svg",
    alt: "AI添削機能を模したダミーイメージ",
  },
  gakuchika: {
    src: "/marketing/placeholders/gakuchika-placeholder.svg",
    alt: "ガクチカ深掘り機能を模したダミーイメージ",
  },
  companies: {
    src: "/marketing/placeholders/companies-placeholder.svg",
    alt: "企業管理機能を模したダミーイメージ",
  },
  motivation: {
    src: "/marketing/placeholders/motivation-placeholder.svg",
    alt: "志望動機の対話支援を模したダミーイメージ",
  },
} as const satisfies Record<string, LandingMedia>;
