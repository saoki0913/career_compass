import { getGakuchikaSummaryPreview } from "@/lib/gakuchika/summary";
import {
  getInterviewCompanySeed,
  getInterviewIndustrySeed,
} from "@/lib/interview/company-seeds";
import { safeParseInterviewMessages } from "@/lib/interview/conversation";
import type { InterviewMaterialCard } from "@/lib/interview/types";

export function clipText(value: string | null | undefined, maxLength = 500) {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength).trim()}...`;
}

export function buildCompanySummary(input: {
  companyName: string;
  industry: string | null;
  role: string | null;
  notes: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
}) {
  return [
    `事業: ${input.companyName}${input.industry ? ` / ${input.industry}` : ""}`,
    input.role ? `選考上の主対象職種: ${input.role}` : "",
    input.notes ? `カルチャー / 補足: ${clipText(input.notes, 600)}` : "",
    input.recruitmentUrl ? `採用URL: ${input.recruitmentUrl}` : "",
    input.corporateUrl ? `企業URL: ${input.corporateUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMotivationSummary(input: {
  generatedDraft: string | null | undefined;
  selectedRole: string | null | undefined;
  desiredWork: string | null | undefined;
  messages: unknown;
}) {
  if (input.generatedDraft) {
    return clipText(input.generatedDraft, 900);
  }

  const messageTrail = safeParseInterviewMessages(input.messages)
    .slice(-4)
    .map((message) => message.content)
    .join(" ");

  return clipText(
    [
      input.selectedRole ? `職種理由: ${input.selectedRole}` : "",
      input.desiredWork ? `やりたい仕事: ${input.desiredWork}` : "",
      messageTrail ? `経験接続: ${messageTrail}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    900,
  );
}

export function buildGakuchikaSummary(rows: Array<{ title: string; summary: string | null }>) {
  return rows
    .map((row) => {
      const summary = getGakuchikaSummaryPreview(row.summary, 320) || "";
      return summary ? `${row.title}: 役割 / 行動 / 結果 / 再現性 -> ${summary}` : row.title;
    })
    .filter(Boolean)
    .join("\n");
}

export function pickSummaryFromTexts(texts: string[], keywords: RegExp, maxLength = 700) {
  const matched = texts.filter((text) => keywords.test(text)).slice(0, 3);
  const joined = matched.join("\n");
  return joined ? clipText(joined, maxLength) : null;
}

export function buildSeedMaterials(companyName: string, industry: string | null): InterviewMaterialCard[] {
  const industrySeed = getInterviewIndustrySeed(industry);
  const companySeed = getInterviewCompanySeed(industry, companyName);
  const materials: InterviewMaterialCard[] = [];

  if (industrySeed) {
    materials.push({
      label: "業界共通論点",
      kind: "industry_seed",
      text: [...industrySeed.commonTopics, ...industrySeed.watchouts].join(" / "),
    });
  }

  if (companySeed) {
    materials.push({
      label: "企業固有論点",
      kind: "company_seed",
      text: [...companySeed.companyTopics, ...companySeed.roleTopics, ...companySeed.cultureTopics].join(" / "),
    });
  }

  return materials;
}
