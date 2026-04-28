import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import {
  extractOtherDocumentSections,
  fetchGakuchikaContext,
  fetchProfileContext,
} from "@/lib/ai/user-context";
import type {
  DocumentSectionContext,
  GakuchikaContextItem,
  ProfileContext,
} from "@/lib/ai/user-context";
import { calculateESReviewCost } from "@/lib/credits";
import { FREE_PLAN_ES_REVIEW_MODEL, isStandardESReviewModel } from "@/lib/ai/es-review-models";
import { resolveEffectiveTemplateTypeWithoutCompany } from "@/lib/es-review/companyless-templates";
import { inferTemplateTypeDetailsFromQuestion } from "@/lib/es-review/infer-template-type";
import { resolveIndustryForReview } from "@/lib/constants/es-review-role-catalog";
import { parseCorporateInfoSources } from "@/lib/company-info/sources";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity, type RequestIdentity } from "@/app/api/_shared/request-identity";
import { getOwnedDocument } from "@/app/api/_shared/owner-access";
import { enforceRateLimitLayers, REVIEW_RATE_LAYERS } from "@/lib/rate-limit-spike";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import type { TemplateType } from "@/hooks/useESReview";

const jsonErr = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });

function deriveCharMin(charLimit?: number | null) {
  if (!charLimit) return null;
  return Math.max(0, charLimit - 10);
}

type RoleSource = "user_input" | "none";

interface RoleContext {
  primary_role?: string;
  role_candidates: string[];
  source: RoleSource;
}

interface CorporateInfoUrlEntry {
  url: string;
  contentType?: string;
  fetchedAt?: string;
  kind?: "url" | "upload_pdf";
  sourceOrigin?: "manual_user";
  secondaryContentTypes?: string[];
  sourceType?: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  parentAllowed?: boolean;
  trustedForEsReview?: boolean;
  complianceStatus?: "allowed" | "warning" | "blocked";
}

function normalizeRoleLabel(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function inferTemplateTypeWithCompany(question: string): TemplateType {
  const inferred = inferTemplateTypeDetailsFromQuestion(question);
  if (inferred.confidence !== "high") return "basic";
  return inferred.templateType as TemplateType;
}

const RETRIEVAL_QUERY_MAX_LENGTH = 850;

function buildRetrievalQuery(input: {
  templateType: TemplateType;
  industry?: string | null;
  sectionTitle: string;
  sectionContent: string;
  companyName?: string | null;
  roleName?: string | null;
  internName?: string | null;
  profileContext: ProfileContext | null;
  gakuchikaContext: GakuchikaContextItem[];
  otherSections: DocumentSectionContext[];
}) {
  const parts: string[] = [];
  const push = (value: string) => {
    const next = value.replace(/\s+/g, " ").trim();
    if (next) parts.push(next);
  };

  push(`設問タイプ:${input.templateType}`);
  if (input.industry) push(`業界:${input.industry}`);
  push(input.companyName ?? "");
  push(input.roleName ?? "");
  push(input.internName ?? "");
  push(input.sectionTitle);
  push(input.sectionContent.replace(/\s+/g, " ").trim().slice(0, 140));

  if (input.profileContext) {
    const p = input.profileContext;
    const bits = [
      p.university, p.faculty,
      p.graduation_year != null ? `${p.graduation_year}年卒` : null,
      p.target_industries?.length ? `志望業界:${p.target_industries.slice(0, 4).join("・")}` : null,
      p.target_job_types?.length ? `志望職種:${p.target_job_types.slice(0, 4).join("・")}` : null,
    ].filter(Boolean);
    if (bits.length) push(`プロフィール:${bits.join(" ")}`);
  }

  for (const g of input.gakuchikaContext.slice(0, 4)) {
    const title = g.title?.trim();
    if (!title) continue;
    let excerpt = "";
    if (g.source_status === "structured_summary") {
      excerpt = [g.action_text, g.result_text].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 100);
    } else if (g.content_excerpt) {
      excerpt = g.content_excerpt.replace(/\s+/g, " ").trim().slice(0, 100);
    }
    push(`ガクチカ:「${title}」${excerpt}`);
  }

  for (const sec of input.otherSections.slice(0, 4)) {
    const t = sec.title?.trim();
    if (!t) continue;
    push(`他設問:「${t}」${sec.content.replace(/\s+/g, " ").trim().slice(0, 80)}`);
  }

  const joined = parts.join(" / ");
  return joined.length > RETRIEVAL_QUERY_MAX_LENGTH
    ? joined.slice(0, RETRIEVAL_QUERY_MAX_LENGTH)
    : joined;
}

function parseCorporateInfoUrls(raw: string | null): CorporateInfoUrlEntry[] {
  return parseCorporateInfoSources(raw) as CorporateInfoUrlEntry[];
}

function resolveRoleContext(explicitRoleName?: string): RoleContext {
  const manualRole = normalizeRoleLabel(explicitRoleName);
  if (manualRole) return { primary_role: manualRole, role_candidates: [manualRole], source: "user_input" };
  return { primary_role: undefined, role_candidates: [], source: "none" };
}

function collectUserProvidedCorporateUrls(entries: CorporateInfoUrlEntry[]): string[] {
  const urls: string[] = [];
  for (const entry of entries) {
    if (!entry.url || entry.complianceStatus === "blocked") continue;
    if (!urls.includes(entry.url)) urls.push(entry.url);
  }
  return urls;
}

export type ReviewStreamPreparedContext =
  | { ok: false; response: Response }
  | {
      ok: true;
      identity: RequestIdentity;
      userId: string | null;
      guestId: string | null;
      billingContext: {
        userId: string | null;
        guestId: string | null;
        documentId: string;
        creditCost: number;
      };
      creditCost: number;
      principal: {
        scope: "ai-stream";
        actor: { kind: "user" | "guest"; id: string };
        companyId: string | null;
        plan: Awaited<ReturnType<typeof getViewerPlan>>;
      };
      payload: Record<string, unknown>;
    };

export async function prepareReviewStreamContext(
  request: NextRequest,
  documentId: string,
): Promise<ReviewStreamPreparedContext> {
  const identity = await getRequestIdentity(request);
  if (!identity) return { ok: false, response: jsonErr("Authentication required", 401) };
  const limitResponse = await guardDailyTokenLimit(identity);
  if (limitResponse) return { ok: false, response: limitResponse };
  const { userId, guestId } = identity;

  const rateLimited = await enforceRateLimitLayers(request, [...REVIEW_RATE_LAYERS], userId, guestId, "documents_review_stream");
  if (rateLimited) return { ok: false, response: rateLimited };

  const documentRow = await getOwnedDocument(documentId, identity);
  if (!documentRow) return { ok: false, response: jsonErr("Document not found", 404) };

  const body = await request.json();
  const {
    content, sectionId, companyId: requestCompanyId,
    sectionTitle, sectionCharLimit, templateType, internName, roleName,
    industryOverride, llmModel,
  } = body as {
    content: string; sectionId?: string; companyId?: string;
    sectionTitle?: string; sectionCharLimit?: number; templateType?: TemplateType;
    internName?: string; roleName?: string; industryOverride?: string; llmModel?: string;
  };
  let resolvedLLMModel = typeof llmModel === "string" && isStandardESReviewModel(llmModel) ? llmModel : null;

  let userPlan: "free" | "standard" | "pro" = "free";
  if (userId) {
    const [profile] = await db
      .select({ plan: userProfiles.plan })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const p = profile?.plan;
    userPlan = p === "standard" || p === "pro" ? p : "free";
  }
  if (userPlan === "free") resolvedLLMModel = FREE_PLAN_ES_REVIEW_MODEL;

  let companyId = documentRow.companyId;
  if (requestCompanyId && requestCompanyId !== documentRow.companyId) {
    const [ownedCompany] = await db
      .select({ id: companies.id, userId: companies.userId, guestId: companies.guestId })
      .from(companies)
      .where(eq(companies.id, requestCompanyId))
      .limit(1);
    if (
      ownedCompany &&
      ((userId && ownedCompany.userId === userId) || (guestId && ownedCompany.guestId === guestId))
    ) {
      companyId = requestCompanyId;
    }
  } else if (requestCompanyId) {
    companyId = requestCompanyId;
  }

  let companyInfo: { name: string | null; industry: string | null; corporateInfoUrls: CorporateInfoUrlEntry[] } = {
    name: null, industry: null, corporateInfoUrls: [],
  };
  if (companyId) {
    const [company] = await db
      .select({ name: companies.name, industry: companies.industry, corporateInfoUrls: companies.corporateInfoUrls })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (company) {
      companyInfo = { name: company.name, industry: company.industry, corporateInfoUrls: parseCorporateInfoUrls(company.corporateInfoUrls) };
    }
  }

  const inferredTemplateDetails = inferTemplateTypeDetailsFromQuestion(sectionTitle || "");
  let effectiveTemplateType: TemplateType;
  if (!companyId) {
    const resolved = resolveEffectiveTemplateTypeWithoutCompany(templateType, sectionTitle || "");
    if (!resolved.ok) {
      return {
        ok: false,
        response: jsonErr("企業未選択の添削では、設問タイプは自動・ガクチカ・自己PR・価値観のいずれかにしてください", 400),
      };
    }
    effectiveTemplateType = resolved.effective;
  } else {
    effectiveTemplateType = templateType ?? inferTemplateTypeWithCompany(sectionTitle || "");
  }
  const resolvedIndustry = resolveIndustryForReview({ companyName: companyInfo.name, companyIndustry: companyInfo.industry, industryOverride });
  const resolvedRoleContext = resolveRoleContext(roleName);
  const [profileContext, gakuchikaContext] = userId
    ? await Promise.all([fetchProfileContext(userId), fetchGakuchikaContext(userId, { allowIncomplete: true, limit: 4 })])
    : [null, []];
  const otherSections = extractOtherDocumentSections(documentRow.content, sectionTitle || null, { maxSections: 4, maxCharsPerSection: 260 });

  if (!content || content.trim().length === 0) return { ok: false, response: jsonErr("内容が空です", 400) };
  if (companyId && !resolvedIndustry) return { ok: false, response: jsonErr("企業に合わせた添削では、先に業界を選択してください", 400) };
  if (companyId && !resolvedRoleContext.primary_role) return { ok: false, response: jsonErr("企業に合わせた添削では、先に職種を選択してください", 400) };

  const retrievalQuery = buildRetrievalQuery({
    templateType: effectiveTemplateType, industry: resolvedIndustry,
    sectionTitle: sectionTitle || "", sectionContent: content,
    companyName: companyInfo.name, roleName: resolvedRoleContext.primary_role,
    internName: internName || null, profileContext, gakuchikaContext, otherSections,
  });

  const creditCost = calculateESReviewCost(content.length, resolvedLLMModel, { userPlan });
  const userProvidedCorporateUrls = collectUserProvidedCorporateUrls(companyInfo.corporateInfoUrls);
  const principalPlan = await getViewerPlan(identity);

  return {
    ok: true,
    identity,
    userId,
    guestId,
    creditCost,
    billingContext: { userId, guestId, documentId, creditCost },
    principal: {
      scope: "ai-stream",
      actor: userId ? { kind: "user", id: userId } : { kind: "guest", id: guestId! },
      companyId: companyId || null,
      plan: principalPlan,
    },
    payload: {
      content,
      section_id: sectionId,
      company_id: companyId || null,
      section_title: sectionTitle || null,
      section_char_limit: sectionCharLimit || null,
      template_request: effectiveTemplateType
        ? {
            template_type: effectiveTemplateType,
            company_name: companyInfo.name,
            industry: resolvedIndustry,
            question: sectionTitle || "",
            answer: content,
            char_min: deriveCharMin(sectionCharLimit),
            char_max: sectionCharLimit || null,
            intern_name: internName || null,
            role_name: resolvedRoleContext.primary_role || null,
            inferred_template_type: inferredTemplateDetails.templateType,
            inferred_confidence: inferredTemplateDetails.confidence,
            secondary_template_types: inferredTemplateDetails.secondaryCandidates,
            classification_rationale: inferredTemplateDetails.rationale,
            recommended_grounding_level: inferredTemplateDetails.recommendedGroundingLevel,
          }
        : null,
      role_context: resolvedRoleContext,
      retrieval_query: retrievalQuery,
      profile_context: profileContext,
      gakuchika_context: gakuchikaContext,
      document_context: otherSections.length > 0 ? { other_sections: otherSections } : null,
      llm_model: resolvedLLMModel,
      document_id: documentId,
      user_id: userId,
      credit_cost: creditCost,
      user_provided_corporate_urls: userProvidedCorporateUrls,
    },
  };
}
