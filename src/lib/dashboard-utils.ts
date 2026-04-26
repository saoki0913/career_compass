import type { CompanyStatus } from "@/lib/constants/status";
import { getStatusConfig } from "@/lib/constants/status";

export interface PipelineColumn {
  key: string;
  label: string;
  color: string;
  statuses: CompanyStatus[];
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    key: "not_applied",
    label: "未応募",
    color: "slate",
    statuses: ["inbox", "needs_confirmation"],
  },
  {
    key: "es_test",
    label: "ES・テスト",
    color: "blue",
    statuses: ["info_session", "es", "web_test", "coding_test", "case_study", "group_discussion"],
  },
  {
    key: "interview",
    label: "面接中",
    color: "purple",
    statuses: ["interview_1", "interview_2", "final_interview"],
  },
  {
    key: "waiting",
    label: "結果待ち",
    color: "amber",
    statuses: ["waiting_result"],
  },
  {
    key: "offer",
    label: "内定",
    color: "green",
    statuses: ["offer", "summer_pass", "autumn_pass", "winter_pass"],
  },
];

export const EXCLUDED_STATUSES: CompanyStatus[] = [
  "es_rejected",
  "gd_rejected",
  "interview_1_rejected",
  "interview_2_rejected",
  "withdrawn",
  "archived",
];

interface CompanyForPipeline {
  id: string;
  name: string;
  status: CompanyStatus;
  corporateUrl: string | null;
  nearestDeadline: {
    title: string;
    dueDate: string;
    type: string;
    daysLeft: number;
  } | null;
}

export interface PipelineData {
  columns: {
    key: string;
    label: string;
    color: string;
    companies: CompanyForPipeline[];
  }[];
  totalActive: number;
}

export function groupCompaniesByPipeline<T extends CompanyForPipeline>(
  companies: T[]
): PipelineData {
  const active = companies.filter(
    (c) => !EXCLUDED_STATUSES.includes(c.status)
  );

  const columns = PIPELINE_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    color: col.color,
    companies: active.filter((c) =>
      (col.statuses as readonly string[]).includes(c.status)
    ),
  }));

  return { columns, totalActive: active.length };
}

export function getStatusLabel(status: CompanyStatus): string {
  return getStatusConfig(status).label;
}

export function getCompanyFaviconUrl(corporateUrl: string | null): string | null {
  if (!corporateUrl) return null;
  try {
    const hostname = new URL(corporateUrl).hostname;
    return `https://icon.horse/icon/${hostname}`;
  } catch {
    return null;
  }
}

const AVATAR_COLORS = [
  "bg-red-100 text-red-700",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
  "bg-cyan-100 text-cyan-700",
] as const;

export function getCompanyAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
