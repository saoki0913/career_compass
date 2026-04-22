import type { ContentType } from "@/lib/company-info/sources";

export const SURFACE_CLASS = "rounded-xl border border-border/60 bg-background";
export const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  new_grad_recruitment: "新卒採用ホームページ",
  midcareer_recruitment: "中途採用ホームページ",
  recruitment_homepage: "採用ホームページ", // Legacy
  corporate_site: "企業HP",
  ir_materials: "IR資料",
  ceo_message: "社長メッセージ",
  employee_interviews: "社員インタビュー",
  press_release: "プレスリリース",
  csr_sustainability: "CSR/サステナ",
  midterm_plan: "中期経営計画",
  structured: "構造化データ",
  // Legacy mappings
  ir: "IR情報",
  business: "事業紹介",
  about: "会社概要",
  general: "企業情報",
};

export const CONTENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  new_grad_recruitment: { bg: "bg-blue-100", text: "text-blue-700" },
  midcareer_recruitment: { bg: "bg-sky-100", text: "text-sky-700" },
  recruitment_homepage: { bg: "bg-blue-100", text: "text-blue-700" }, // Legacy
  corporate_site: { bg: "bg-emerald-100", text: "text-emerald-700" },
  ir_materials: { bg: "bg-purple-100", text: "text-purple-700" },
  ceo_message: { bg: "bg-amber-100", text: "text-amber-700" },
  employee_interviews: { bg: "bg-pink-100", text: "text-pink-700" },
  press_release: { bg: "bg-cyan-100", text: "text-cyan-700" },
  csr_sustainability: { bg: "bg-green-100", text: "text-green-700" },
  midterm_plan: { bg: "bg-indigo-100", text: "text-indigo-700" },
  // Legacy colors
  ir: { bg: "bg-blue-100", text: "text-blue-700" },
  business: { bg: "bg-purple-100", text: "text-purple-700" },
  about: { bg: "bg-emerald-100", text: "text-emerald-700" },
  general: { bg: "bg-emerald-100", text: "text-emerald-700" },
};

export const STATS_GROUPS: Array<{
  groupName: string;
  items: Array<{
    key: ContentType;
    label: string;
    shortLabel: string;
    colorClass: string;
  }>;
}> = [
  {
    groupName: "採用情報",
    items: [
      { key: "new_grad_recruitment", label: "新卒採用HP", shortLabel: "新卒", colorClass: "bg-blue-50 border-blue-200" },
      { key: "midcareer_recruitment", label: "中途採用HP", shortLabel: "中途", colorClass: "bg-sky-50 border-sky-200" },
    ],
  },
  {
    groupName: "企業情報",
    items: [
      { key: "corporate_site", label: "企業HP", shortLabel: "企業HP", colorClass: "bg-emerald-50 border-emerald-200" },
      { key: "ir_materials", label: "IR資料", shortLabel: "IR", colorClass: "bg-purple-50 border-purple-200" },
    ],
  },
  {
    groupName: "コンテンツ",
    items: [
      { key: "ceo_message", label: "社長メッセージ", shortLabel: "社長", colorClass: "bg-amber-50 border-amber-200" },
      { key: "employee_interviews", label: "社員インタビュー", shortLabel: "社員", colorClass: "bg-pink-50 border-pink-200" },
      { key: "press_release", label: "プレスリリース", shortLabel: "プレス", colorClass: "bg-cyan-50 border-cyan-200" },
      { key: "csr_sustainability", label: "CSR/サステナ", shortLabel: "CSR", colorClass: "bg-green-50 border-green-200" },
      { key: "midterm_plan", label: "中期経営計画", shortLabel: "中計", colorClass: "bg-indigo-50 border-indigo-200" },
    ],
  },
];
