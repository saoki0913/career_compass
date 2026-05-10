import type { NearestDeadline } from "@/hooks/useCompanies";

const DEADLINE_TYPE_LABELS: Record<string, string> = {
  es_submission: "ES提出",
  web_test: "WEBテスト",
  aptitude_test: "適性検査",
  interview_1: "一次面接",
  interview_2: "二次面接",
  interview_3: "三次面接",
  interview_final: "最終面接",
  briefing: "説明会",
  internship: "インターン",
  offer_response: "内定返答",
  other: "その他",
};

export type DeadlineTone = "none" | "overdue" | "urgent" | "warning" | "normal";

export interface DeadlineSummary {
  typeLabel: string;
  daysText: string;
  tone: DeadlineTone;
}

export function getCompanyNameClass(name: string): string {
  const len = name.length;
  if (len <= 6) return "text-[13px] leading-5";
  if (len <= 10) return "text-[12px] leading-[18px]";
  if (len <= 13) return "text-[11px] leading-[16px]";
  return "text-[10px] leading-[15px]";
}

export function getDeadlineSummary(deadline: NearestDeadline | null): DeadlineSummary | null {
  if (!deadline) {
    return null;
  }

  const { daysLeft, type } = deadline;
  const tone: DeadlineTone =
    daysLeft < 0
      ? "overdue"
      : daysLeft <= 3
        ? "urgent"
        : daysLeft <= 7
          ? "warning"
          : "normal";

  return {
    typeLabel: DEADLINE_TYPE_LABELS[type] || type,
    daysText:
      daysLeft < 0
        ? "期限切れ"
        : daysLeft === 0
          ? "今日"
          : daysLeft === 1
            ? "明日"
            : `${daysLeft}日`,
    tone,
  };
}
