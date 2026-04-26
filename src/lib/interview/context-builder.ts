import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import {
  buildCompanySummary,
  buildGakuchikaSummary,
  buildMotivationSummary,
  buildSeedMaterials,
  clipText,
  pickSummaryFromTexts,
} from "@/lib/interview/context-builder-summaries";
import {
  fetchInterviewContextData,
  getOwnedCompany,
} from "@/lib/interview/context-builder-loaders";
import { buildSetupState } from "@/lib/interview/context-builder-setup";
import {
  hydrateInterviewConversation,
  toFeedbackHistoryItem,
} from "@/lib/interview/context-builder-hydration";
import { extractTextFromContent } from "@/lib/search/utils";
import type {
  InterviewFeedbackHistoryItem,
  InterviewMaterialCard,
} from "@/lib/interview/types";

export async function buildInterviewContext(companyId: string, identity: RequestIdentity) {
  const company = await getOwnedCompany(companyId, identity);
  if (!company) return null;

  const {
    motivationConversation,
    gakuchikaRows,
    documentRows,
    persistence,
    applicationContext,
  } = await fetchInterviewContextData(companyId, identity);

  const motivation = motivationConversation[0] ?? null;
  const activeConversation = persistence.activeConversation;
  const feedbackRows = persistence.feedbackRows;

  const motivationSummary = buildMotivationSummary({
    generatedDraft: motivation?.generatedDraft,
    selectedRole: motivation?.selectedRole,
    desiredWork: motivation?.desiredWork,
    messages: motivation?.messages,
  });

  const gakuchikaSummary = buildGakuchikaSummary(gakuchikaRows);
  const textCandidates = documentRows.map(
    (doc) => `${doc.title}: ${clipText(extractTextFromContent(doc.content), 280)}`,
  );
  const academicSummary =
    pickSummaryFromTexts(textCandidates, /(ゼミ|卒論|学業|授業|専攻|学ん|勉強)/i) ??
    pickSummaryFromTexts(
      textCandidates.filter((_, index) => documentRows[index]?.esCategory === "interview_prep"),
      /(ゼミ|卒論|学業|授業|専攻|学ん|勉強|研究)/i,
    );
  const researchSummary = pickSummaryFromTexts(textCandidates, /(研究|実験|分析|論文|研究室|テーマ|データ)/i);
  const esSummary = documentRows
    .slice(0, 4)
    .map((doc) => `${doc.title}: ${clipText(extractTextFromContent(doc.content), 260)}`)
    .filter(Boolean)
    .join("\n");

  const selectedIndustry = activeConversation?.selectedIndustry ?? company.industry ?? null;
  const setup = buildSetupState({
    companyName: company.name,
    companyIndustry: company.industry,
    companyStatus: company.status,
    selectedIndustry,
    selectedRole: activeConversation?.selectedRole ?? motivation?.selectedRole ?? null,
    selectedRoleSource: activeConversation?.selectedRoleSource ?? motivation?.selectedRoleSource ?? null,
    applicationTypes: applicationContext.applicationTypes,
    applicationRoles: applicationContext.applicationRoles,
    persisted: activeConversation
      ? {
          roleTrack: activeConversation.roleTrack,
          interviewFormat: activeConversation.interviewFormat,
          selectionType: activeConversation.selectionType,
          interviewStage: activeConversation.interviewStage,
          interviewerType: activeConversation.interviewerType,
          strictnessMode: activeConversation.strictnessMode,
        }
      : null,
  });

  const companySummary = buildCompanySummary({
    companyName: company.name,
    industry: setup.resolvedIndustry,
    role: setup.selectedRole,
    notes: company.notes,
    recruitmentUrl: company.recruitmentUrl,
    corporateUrl: company.corporateUrl,
  });

  const materials: InterviewMaterialCard[] = [];
  if (motivationSummary) materials.push({ label: "志望動機", text: motivationSummary, kind: "motivation" });
  if (gakuchikaSummary) materials.push({ label: "ガクチカ", text: gakuchikaSummary, kind: "gakuchika" });
  if (academicSummary) materials.push({ label: "学業 / ゼミ / 卒論", text: academicSummary, kind: "academic" });
  if (researchSummary) materials.push({ label: "研究", text: researchSummary, kind: "research" });
  if (esSummary) materials.push({ label: "関連ES", text: esSummary, kind: "es" });
  materials.push(...buildSeedMaterials(company.name, setup.resolvedIndustry));

  const hydratedConversation = hydrateInterviewConversation(activeConversation, setup);
  const feedbackHistories: InterviewFeedbackHistoryItem[] = feedbackRows.map(toFeedbackHistoryItem);

  return {
    company,
    companySummary,
    motivationSummary: motivationSummary || null,
    gakuchikaSummary: gakuchikaSummary || null,
    academicSummary,
    researchSummary,
    esSummary: esSummary || null,
    materials,
    setup,
    conversation: hydratedConversation,
    feedbackHistories,
  };
}
