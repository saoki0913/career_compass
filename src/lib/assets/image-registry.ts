export const FAVICON_ASSETS = {
  icon512: "/icon.png",
  icon96: "/favicon-96x96.png",
  icon48: "/favicon-48x48.png",
  apple: "/apple-icon.png",
} as const;

export const LOGO_ASSETS = {
  textClean: "/marketing/logo/logo_text_clean.png",
} as const;

export const DASHBOARD_ASSETS = {
  emptyDeadline: "/dashboard/assets/empty-state-hourglass.png",
  emptyTodayTasks: "/dashboard/assets/empty-state-clipboard.png",
  emptyCompanies: "/dashboard/assets/empty-state-folder.png",
} as const;

export const LP_SECTION_ASSET_BASE = "/marketing/LP/sections" as const;

export const LP_SECTION_ASSETS = {
  hero: {
    iconGrowthChart: "hero/icon-growth-chart.png",
    iconStar: "hero/icon-star.png",
    iconDocumentCheck: "hero/icon-document-check.png",
    productMockup: "hero/product-mockup-pc-phone.png",
  },
  beforeAfter: {
    personWorried: "before-after/person-worried.png",
    personCheerful: "before-after/person-cheerful.png",
  },
  faq: {
    decoDotsGrid: "faq/deco-dots-grid.png",
    decoDocumentCheck: "faq/deco-document-check.png",
    decoCurve: "faq/deco-curve.png",
    personPc: "faq/person-pc.png",
  },
  features: {
    cardEsReview: "features/card-es-review.png",
    cardMotivationGakuchika: "features/card-motivation-gakuchika.png",
    cardInterviewPrep: "features/card-interview-prep.png",
    cardScheduleDeadline: "features/card-schedule-deadline.png",
    cardCompanyManagement: "features/card-company-application-management.png",
    googleCalendar: "features/google-calendar-integration.png",
  },
  pricing: {
    decoDotsCircle: "pricing/deco-dots-circle.png",
    decoPlusMark: "pricing/deco-plus-mark.png",
    decoCardFree: "pricing/deco-card-free.png",
  },
  worries: {
    personEsStruggle: "worries/person-es-writing-struggle.png",
    personScheduleWorry: "worries/person-schedule-worry.png",
    personDeadlineStress: "worries/person-deadline-stress.png",
    personSearchingInfo: "worries/person-searching-info.png",
  },
  howTo: {
    stepRegisterCompany: "how-to/step-register-company.png",
    stepAiEsReview: "how-to/step-ai-es-review.png",
    stepInterviewPrep: "how-to/step-interview-prep.png",
    stepDeadlineSchedule: "how-to/step-deadline-schedule.png",
  },
  footer: {
    cityscape: "footer/cityscape.png",
    couple: "footer/couple.png",
  },
} as const;

type ExtractValues<T> = T extends Record<string, infer V>
  ? V extends string
    ? V
    : ExtractValues<V>
  : never;

export type LpSectionPath = ExtractValues<typeof LP_SECTION_ASSETS>;

export function lpSectionAsset(path: LpSectionPath): string {
  return `${LP_SECTION_ASSET_BASE}/${path}`;
}
