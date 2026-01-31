/**
 * Company selection status definitions
 * Centralized status configuration for consistency across the app
 */

// Status categories
export type StatusCategory = "not_started" | "in_progress" | "completed";

// All status values
export type CompanyStatus =
  // Not started
  | "inbox"
  | "needs_confirmation"
  // In progress
  | "info_session"
  | "es"
  | "web_test"
  | "coding_test"
  | "case_study"
  | "group_discussion"
  | "interview_1"
  | "interview_2"
  | "final_interview"
  | "waiting_result"
  // Completed
  | "offer"
  | "summer_pass"
  | "autumn_pass"
  | "winter_pass"
  | "es_rejected"
  | "gd_rejected"
  | "interview_1_rejected"
  | "interview_2_rejected"
  | "withdrawn"
  | "archived";

// Status configuration
export interface StatusConfig {
  value: CompanyStatus;
  label: string;
  category: StatusCategory;
  color: string;
  bgColor: string;
}

// Category labels
export const CATEGORY_LABELS: Record<StatusCategory, string> = {
  not_started: "未着手",
  in_progress: "進行中",
  completed: "完了",
};

// All status configurations
export const STATUS_CONFIG: StatusConfig[] = [
  // Not started
  { value: "inbox", label: "未応募", category: "not_started", color: "text-slate-600", bgColor: "bg-slate-100" },
  { value: "needs_confirmation", label: "要確認", category: "not_started", color: "text-amber-600", bgColor: "bg-amber-50" },

  // In progress
  { value: "info_session", label: "説明会", category: "in_progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "es", label: "ES", category: "in_progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "web_test", label: "Web Test", category: "in_progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "coding_test", label: "コーディングテスト", category: "in_progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "case_study", label: "ケース面接", category: "in_progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "group_discussion", label: "グループディスカッション", category: "in_progress", color: "text-blue-600", bgColor: "bg-blue-50" },
  { value: "interview_1", label: "一次面接", category: "in_progress", color: "text-purple-600", bgColor: "bg-purple-50" },
  { value: "interview_2", label: "二次面接", category: "in_progress", color: "text-purple-600", bgColor: "bg-purple-50" },
  { value: "final_interview", label: "最終面接", category: "in_progress", color: "text-purple-600", bgColor: "bg-purple-50" },
  { value: "waiting_result", label: "結果待ち", category: "in_progress", color: "text-yellow-600", bgColor: "bg-yellow-50" },

  // Completed - Positive
  { value: "offer", label: "内定", category: "completed", color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { value: "summer_pass", label: "夏インターン合格", category: "completed", color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { value: "autumn_pass", label: "秋インターン合格", category: "completed", color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { value: "winter_pass", label: "冬インターン合格", category: "completed", color: "text-emerald-600", bgColor: "bg-emerald-50" },

  // Completed - Negative
  { value: "es_rejected", label: "ES不合格", category: "completed", color: "text-red-600", bgColor: "bg-red-50" },
  { value: "gd_rejected", label: "GD不合格", category: "completed", color: "text-red-600", bgColor: "bg-red-50" },
  { value: "interview_1_rejected", label: "一次面接不合格", category: "completed", color: "text-red-600", bgColor: "bg-red-50" },
  { value: "interview_2_rejected", label: "二次不合格", category: "completed", color: "text-red-600", bgColor: "bg-red-50" },
  { value: "withdrawn", label: "選考辞退", category: "completed", color: "text-gray-500", bgColor: "bg-gray-100" },
  { value: "archived", label: "保留", category: "completed", color: "text-gray-500", bgColor: "bg-gray-100" },
];

// All valid status values (for validation)
export const VALID_STATUSES: CompanyStatus[] = STATUS_CONFIG.map(s => s.value);

// Helper functions
export function getStatusConfig(status: CompanyStatus): StatusConfig {
  return STATUS_CONFIG.find(s => s.value === status) ?? STATUS_CONFIG[0];
}

export function getStatusLabel(status: CompanyStatus): string {
  return getStatusConfig(status).label;
}

export function getStatusesByCategory(category: StatusCategory): StatusConfig[] {
  return STATUS_CONFIG.filter(s => s.category === category);
}

export function getStatusCategory(status: CompanyStatus): StatusCategory {
  return getStatusConfig(status).category;
}

// Grouped statuses for dropdown
export const GROUPED_STATUSES = {
  not_started: getStatusesByCategory("not_started"),
  in_progress: getStatusesByCategory("in_progress"),
  completed: getStatusesByCategory("completed"),
};
