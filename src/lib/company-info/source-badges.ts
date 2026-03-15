export type CompanySourceType =
  | "official"
  | "job_site"
  | "parent"
  | "subsidiary"
  | "blog"
  | "other";

export type CompanySourceConfidence = "high" | "medium" | "low";

export const SOURCE_TYPE_META: Record<
  CompanySourceType,
  { label: string; className: string }
> = {
  official: {
    label: "公式",
    className: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  },
  parent: {
    label: "親会社",
    className: "border-amber-200/80 bg-amber-50 text-amber-700",
  },
  subsidiary: {
    label: "子会社",
    className: "border-sky-200/80 bg-sky-50 text-sky-700",
  },
  job_site: {
    label: "就活サイト",
    className: "border-blue-200/80 bg-blue-50 text-blue-700",
  },
  blog: {
    label: "ブログ",
    className: "border-zinc-200/80 bg-zinc-50 text-zinc-700",
  },
  other: {
    label: "関連",
    className: "border-border bg-muted/60 text-muted-foreground",
  },
};

export const CONFIDENCE_META: Record<
  CompanySourceConfidence,
  { label: string; className: string }
> = {
  high: {
    label: "高",
    className: "border-emerald-200/80 bg-emerald-500/10 text-emerald-700",
  },
  medium: {
    label: "中",
    className: "border-amber-200/80 bg-amber-500/10 text-amber-700",
  },
  low: {
    label: "低",
    className: "border-border bg-muted/70 text-muted-foreground",
  },
};

export const INTEGRATED_BADGE_LABELS: Record<
  CompanySourceType,
  Record<CompanySourceConfidence, string>
> = {
  official: { high: "公式・高", medium: "公式・中", low: "公式・低" },
  subsidiary: { high: "子会社・高", medium: "子会社・中", low: "子会社・低" },
  parent: { high: "親会社・高", medium: "親会社・中", low: "親会社・低" },
  job_site: { high: "就活・高", medium: "就活・中", low: "就活・低" },
  blog: { high: "ブログ・高", medium: "ブログ・中", low: "ブログ・低" },
  other: { high: "関連・高", medium: "関連・中", low: "関連・低" },
};

export const CONFIDENCE_BADGE_COLORS: Record<
  CompanySourceConfidence,
  { bg: string; text: string }
> = {
  high: { bg: "bg-emerald-100", text: "text-emerald-700" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700" },
  low: { bg: "bg-gray-100", text: "text-gray-600" },
};
