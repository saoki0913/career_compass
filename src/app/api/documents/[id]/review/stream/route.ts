/**
 * Document AI Review SSE Stream API
 *
 * POST: Request AI review with real-time progress streaming
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, companies } from "@/lib/db/schema";
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
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { reserveCredits, confirmReservation, cancelReservation, calculateESReviewCost } from "@/lib/credits";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import type { TemplateType } from "@/hooks/useESReview";
import { isLowCostESReviewModel, isStandardESReviewModel } from "@/lib/ai/es-review-models";
import { resolveEffectiveTemplateTypeWithoutCompany } from "@/lib/es-review/companyless-templates";
import { inferTemplateTypeFromQuestion } from "@/lib/es-review/infer-template-type";
import { resolveIndustryForReview } from "@/lib/constants/es-review-role-catalog";
import {
  inferTrustedForEsReview,
  parseCorporateInfoSources,
  type CorporateInfoSource,
  type CorporateInfoSourceType,
} from "@/lib/company-info/sources";

function deriveCharMin(charLimit?: number | null) {
  if (!charLimit) {
    return null;
  }
  return Math.max(0, charLimit - 10);
}

const PRESTREAM_ENRICHMENT_TEMPLATE_TYPES = new Set<TemplateType>([
  "basic",
  "gakuchika",
  "self_pr",
  "work_values",
  "company_motivation",
  "intern_reason",
  "intern_goals",
  "post_join_goals",
  "role_course_reason",
]);
const ASSISTIVE_TEMPLATE_TYPES = new Set<TemplateType>(["basic", "gakuchika", "self_pr", "work_values"]);
const PRESTREAM_ENRICHMENT_BUDGET_MS = 4500;
/** Skip repeated pre-stream search when corporate URLs are still empty but we recently tried a fetch. */
const PRESTREAM_EMPTY_URL_RECENT_FETCH_TTL_MS = 24 * 60 * 60 * 1000;
const PRESTREAM_SEARCH_TIMEOUT_MS = 1800;
const PRESTREAM_FETCH_TIMEOUT_MS = 2400;
const PRESTREAM_MIN_REMAINING_MS = 250;
const GENERIC_ROLE_PATTERNS = [
  /^総合職$/i,
  /^総合職[abcd]?$/i,
  /^総合コース$/i,
  /^オープンコース$/i,
  /^open\s*course$/i,
  /^open$/i,
  /^global\s*staff$/i,
];
const BUSINESS_FOCUS_TERMS = new Set(["事業", "ビジネス", "成長領域", "注力分野", "方向性", "投資", "将来", "キャリア"]);
const PEOPLE_FOCUS_TERMS = new Set(["経験", "スキル", "成長", "若手", "価値観", "求める人物像", "社員", "インターン"]);
const SECONDARY_HINT_VOCAB = [
  "事業",
  "ビジネス",
  "成長領域",
  "注力分野",
  "経験",
  "スキル",
  "成長",
  "若手",
  "社員",
  "価値観",
  "求める人物像",
  "キャリア",
  "インターン",
];
const PRESTREAM_QUERY_STOP_TERMS = new Set([
  "について",
  "ください",
  "理由",
  "回答",
  "内容",
  "自分",
  "企業",
  "会社",
  "貴社",
  "設問",
  "経験",
  "成長",
  "学び",
  "仕事",
  "インターン",
]);

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
  sourceOrigin?: "manual_user" | "prestream_enrichment";
  secondaryContentTypes?: string[];
  sourceType?: CorporateInfoSourceType;
  relationCompanyName?: string | null;
  parentAllowed?: boolean;
  trustedForEsReview?: boolean;
}

interface SearchCandidate {
  url: string;
  title?: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  parentAllowed?: boolean;
}

interface PrestreamEnrichmentResult {
  attempted: boolean;
  completed: boolean;
  addedSources: number;
  sourceUrls: string[];
}

function normalizeRoleLabel(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function inferTemplateType(question: string): TemplateType {
  return inferTemplateTypeFromQuestion(question) as TemplateType;
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
    if (next) {
      parts.push(next);
    }
  };

  push(`設問タイプ:${input.templateType}`);
  if (input.industry) {
    push(`業界:${input.industry}`);
  }
  push(input.companyName ?? "");
  push(input.roleName ?? "");
  push(input.internName ?? "");
  push(input.sectionTitle);
  const summary = input.sectionContent.replace(/\s+/g, " ").trim().slice(0, 140);
  push(summary);

  if (input.profileContext) {
    const p = input.profileContext;
    const bits = [
      p.university,
      p.faculty,
      p.graduation_year != null ? `${p.graduation_year}年卒` : null,
      p.target_industries?.length ? `志望業界:${p.target_industries.slice(0, 4).join("・")}` : null,
      p.target_job_types?.length ? `志望職種:${p.target_job_types.slice(0, 4).join("・")}` : null,
    ].filter(Boolean);
    if (bits.length) {
      push(`プロフィール:${bits.join(" ")}`);
    }
  }

  for (const g of input.gakuchikaContext.slice(0, 4)) {
    const title = g.title?.trim();
    if (!title) {
      continue;
    }
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
    if (!t) {
      continue;
    }
    const c = sec.content.replace(/\s+/g, " ").trim().slice(0, 80);
    push(`他設問:「${t}」${c}`);
  }

  let joined = parts.join(" / ");
  if (joined.length > RETRIEVAL_QUERY_MAX_LENGTH) {
    joined = joined.slice(0, RETRIEVAL_QUERY_MAX_LENGTH);
  }
  return joined;
}

function parseCorporateInfoUrls(raw: string | null): CorporateInfoUrlEntry[] {
  return parseCorporateInfoSources(raw) as CorporateInfoUrlEntry[];
}

function isGenericRoleLabel(roleName?: string | null): boolean {
  const normalized = roleName?.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return GENERIC_ROLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectKnownContentTypes(entries: CorporateInfoUrlEntry[]): Set<string> {
  const contentTypes = new Set<string>();
  for (const entry of entries) {
    if (entry.contentType) {
      contentTypes.add(entry.contentType);
    }
    for (const secondaryType of entry.secondaryContentTypes ?? []) {
      contentTypes.add(secondaryType);
    }
  }
  return contentTypes;
}

function filterTrustedCorporateInfoUrls(entries: CorporateInfoUrlEntry[]): CorporateInfoUrlEntry[] {
  return entries.filter((entry) => inferTrustedForEsReview(entry));
}

function summarizeTrustedCoverage(entries: CorporateInfoUrlEntry[]): {
  trustedEntries: CorporateInfoUrlEntry[];
  trustedContentTypes: Set<string>;
  hasPeople: boolean;
  hasBusiness: boolean;
  hasStrategy: boolean;
} {
  const trustedEntries = filterTrustedCorporateInfoUrls(entries);
  const trustedContentTypes = collectKnownContentTypes(trustedEntries);
  return {
    trustedEntries,
    trustedContentTypes,
    hasPeople:
      trustedContentTypes.has("new_grad_recruitment") || trustedContentTypes.has("employee_interviews"),
    hasBusiness:
      trustedContentTypes.has("corporate_site") ||
      trustedContentTypes.has("midterm_plan") ||
      trustedContentTypes.has("ir_materials"),
    hasStrategy:
      trustedContentTypes.has("midterm_plan") || trustedContentTypes.has("ir_materials"),
  };
}

function extractQuestionFocusSignals(input: {
  templateType: TemplateType;
  question: string;
  answer?: string;
  roleName?: string | null;
  internName?: string | null;
}): {
  themes: string[];
  queryTerms: string[];
} {
  const text = [
    input.templateType,
    input.question || "",
    input.answer || "",
    input.roleName || "",
    input.internName || "",
  ]
    .join(" ")
    .trim();
  const signals: Array<{ theme: string; terms: string[] }> = [];

  if (/事業|ビジネス|領域|商材|手掛け|手がけ|注力|投資/.test(text)) {
    signals.push({ theme: "事業理解", terms: ["事業", "ビジネス", "成長領域", "注力分野"] });
  }
  if (/経験|スキル|学び|学ぶ|獲得|成長|若手|挑戦/.test(text)) {
    signals.push({ theme: "成長機会", terms: ["経験", "スキル", "成長", "若手"] });
  }
  if (/価値観|人物|社風|文化|求める|大切|重視/.test(text)) {
    signals.push({ theme: "価値観", terms: ["価値観", "求める人物像", "社員"] });
  }
  if (/入社後|将来|キャリア|実現|やりたい|挑みたい/.test(text)) {
    signals.push({ theme: "将来接続", terms: ["入社後", "将来", "キャリア", "挑戦"] });
  }
  if (
    /職種|コース|部門|領域|業務|仕事内容|担当|システム|デジタル|企画|エンジニア|営業|開発/.test(text) ||
    (!!input.roleName && !isGenericRoleLabel(input.roleName))
  ) {
    signals.push({
      theme: "役割理解",
      terms: ["職種", "業務", "仕事内容", input.roleName || ""].filter(Boolean),
    });
  }
  if (/インターン|プログラム|実務|ワークショップ|体験/.test(text) || !!input.internName) {
    signals.push({
      theme: "インターン機会",
      terms: ["インターン", "プログラム", "実務", input.internName || ""].filter(Boolean),
    });
  }

  if (signals.length === 0) {
    const defaults: Partial<Record<TemplateType, Array<{ theme: string; terms: string[] }>>> = {
      post_join_goals: [
        { theme: "事業理解", terms: ["事業", "成長領域"] },
        { theme: "成長機会", terms: ["経験", "スキル"] },
      ],
      company_motivation: [
        { theme: "事業理解", terms: ["事業", "方向性"] },
        { theme: "価値観", terms: ["価値観", "人物像"] },
      ],
      role_course_reason: [
        { theme: "役割理解", terms: ["職種", "業務", "仕事内容", input.roleName || ""].filter(Boolean) },
        { theme: "事業理解", terms: ["事業", "顧客", "価値提供"] },
      ],
      intern_reason: [
        { theme: "インターン機会", terms: ["インターン", "プログラム", input.internName || ""].filter(Boolean) },
        { theme: "成長機会", terms: ["実務", "学び", "成長"] },
      ],
      intern_goals: [
        { theme: "インターン機会", terms: ["インターン", "プログラム", input.internName || ""].filter(Boolean) },
        { theme: "成長機会", terms: ["実務", "学び", "成長"] },
      ],
      self_pr: [
        { theme: "成長機会", terms: ["経験", "スキル"] },
        { theme: "価値観", terms: ["価値観", "人物像"] },
      ],
    };
    signals.push(...(defaults[input.templateType] || [{ theme: "企業理解", terms: ["事業", "価値観"] }]));
  }

  const themes: string[] = [];
  const queryTerms: string[] = [];
  for (const signal of signals) {
    if (!themes.includes(signal.theme)) {
      themes.push(signal.theme);
    }
    for (const term of signal.terms) {
      if (!queryTerms.includes(term)) {
        queryTerms.push(term);
      }
    }
  }
  return { themes: themes.slice(0, 6), queryTerms: queryTerms.slice(0, 10) };
}

function extractKeywordTerms(text: string, maxTerms = 4): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const terms: string[] = [];
  const matches = normalized.match(/[A-Za-z0-9][A-Za-z0-9.+/-]{1,}|[一-龠々ぁ-んァ-ヴー]{2,14}/g) ?? [];
  for (const match of matches) {
    const term = match.trim();
    if (
      term.length < 2 ||
      PRESTREAM_QUERY_STOP_TERMS.has(term) ||
      PRESTREAM_QUERY_STOP_TERMS.has(term.toLowerCase()) ||
      terms.includes(term)
    ) {
      continue;
    }
    terms.push(term);
    if (terms.length >= maxTerms) {
      break;
    }
  }

  return terms;
}

function collectProfileHintTerms(profileContext: ProfileContext | null): string[] {
  if (!profileContext) {
    return [];
  }

  return [
    ...profileContext.target_job_types.slice(0, 2),
    ...profileContext.target_industries.slice(0, 2),
  ].filter((term, index, array) => term && array.indexOf(term) === index);
}

function collectGakuchikaHintTerms(gakuchikaContext: GakuchikaContextItem[]): string[] {
  const hints: string[] = [];
  for (const item of gakuchikaContext) {
    const candidates = [
      item.title,
      item.action_text,
      item.result_text,
      item.content_excerpt,
      ...(item.fact_spans ?? []),
    ];

    for (const strength of item.strengths ?? []) {
      if (typeof strength === "string") {
        candidates.push(strength);
      } else {
        candidates.push(strength.title ?? "", strength.description ?? "");
      }
    }

    for (const candidate of candidates) {
      for (const term of extractKeywordTerms(candidate ?? "", 2)) {
        if (!hints.includes(term)) {
          hints.push(term);
        }
        if (hints.length >= 2) {
          return hints;
        }
      }
    }
  }

  return hints;
}

function collectDocumentHintTerms(otherSections: DocumentSectionContext[]): string[] {
  const hints: string[] = [];
  for (const section of otherSections) {
    for (const candidate of [section.title, section.content]) {
      for (const term of extractKeywordTerms(candidate, 2)) {
        if (!hints.includes(term)) {
          hints.push(term);
        }
        if (hints.length >= 2) {
          return hints;
        }
      }
    }
  }
  return hints;
}

function buildPrestreamUserHintTerms(input: {
  profileContext: ProfileContext | null;
  gakuchikaContext: GakuchikaContextItem[];
  otherSections: DocumentSectionContext[];
}): string[] {
  const terms: string[] = [];

  for (const term of [
    ...collectProfileHintTerms(input.profileContext),
    ...collectGakuchikaHintTerms(input.gakuchikaContext),
    ...collectDocumentHintTerms(input.otherSections),
  ]) {
    if (!term || terms.includes(term)) {
      continue;
    }
    terms.push(term);
    if (terms.length >= 6) {
      break;
    }
  }

  return terms;
}

function buildQuery(parts: Array<string | null | undefined>): string {
  const deduped: string[] = [];
  for (const part of parts) {
    const normalized = part?.replace(/\s+/g, " ").trim();
    if (!normalized || deduped.includes(normalized)) {
      continue;
    }
    deduped.push(normalized);
  }
  return deduped.join(" / ");
}

function hasAssistiveCompanySignal(templateType: TemplateType, question: string): boolean {
  const text = `${templateType} ${question || ""}`;
  if (templateType === "self_pr") return /(強み|自己pr|自己ＰＲ|活か|発揮|貢献)/i.test(text);
  if (templateType === "work_values") return /(価値観|大切|重視|働く|姿勢)/.test(text);
  if (templateType === "gakuchika") return /(学び|強み|活か|仕事|貢献|将来|価値観)/.test(text);
  if (templateType === "basic") return /(強み|価値観|活か|志望|理由|将来|入社後)/.test(text);
  return false;
}

function getRemainingTimeMs(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response | null; timedOut: boolean }> {
  if (timeoutMs <= 0) {
    return { response: null, timedOut: true };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return { response, timedOut: false };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { response: null, timedOut: true };
    }
    return { response: null, timedOut: false };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrestreamEnrichmentSpecs(input: {
  templateType: TemplateType;
  companyName: string;
  industry?: string | null;
  question: string;
  answer?: string;
  roleName?: string | null;
  internName?: string | null;
  userHintTerms?: string[];
}): Array<{ contentType: string; query: string; preferredTerms: string[] }> {
  const focusSignals = extractQuestionFocusSignals({
    templateType: input.templateType,
    question: input.question,
    answer: input.answer,
    roleName: input.roleName,
    internName: input.internName,
  });
  const genericRoleMode = isGenericRoleLabel(input.roleName);
  const businessTerms = focusSignals.queryTerms.filter((term) => BUSINESS_FOCUS_TERMS.has(term)).slice(0, 4);
  const peopleTerms = focusSignals.queryTerms.filter((term) => PEOPLE_FOCUS_TERMS.has(term)).slice(0, 4);
  const peopleQuery = buildQuery([
    input.companyName,
    input.industry,
    input.templateType === "intern_reason" || input.templateType === "intern_goals" ? input.internName : undefined,
    genericRoleMode ? undefined : input.roleName,
    ...(input.userHintTerms ?? []).slice(0, 3),
    ...peopleTerms,
    input.question,
  ]);
  const businessQuery = buildQuery([
    input.companyName,
    input.industry,
    genericRoleMode ? undefined : input.roleName,
    ...(input.userHintTerms ?? []).slice(0, 4),
    ...businessTerms,
    input.question,
    input.answer,
  ]);

  const specs: Array<{ contentType: string; query: string; preferredTerms: string[] }> = [
    { contentType: "new_grad_recruitment", query: peopleQuery || businessQuery, preferredTerms: peopleTerms },
    { contentType: "employee_interviews", query: peopleQuery || businessQuery, preferredTerms: [...peopleTerms, ...focusSignals.queryTerms] },
    { contentType: "corporate_site", query: businessQuery || peopleQuery, preferredTerms: businessTerms },
  ];

  if (
    focusSignals.themes.includes("事業理解") ||
    focusSignals.themes.includes("将来接続") ||
    input.templateType === "post_join_goals"
  ) {
    specs.push(
      { contentType: "midterm_plan", query: businessQuery || peopleQuery, preferredTerms: businessTerms },
      { contentType: "ir_materials", query: businessQuery || peopleQuery, preferredTerms: [...businessTerms, "投資", "成長領域"] },
    );
  }

  const seenContentTypes = new Set<string>();
  return specs.filter((spec) => {
    if (!spec.query || seenContentTypes.has(spec.contentType)) {
      return false;
    }
    seenContentTypes.add(spec.contentType);
    return true;
  });
}

function selectPrestreamSpecsForCoverage(input: {
  templateType: TemplateType;
  question: string;
  answer?: string;
  roleName?: string | null;
  entries: CorporateInfoUrlEntry[];
  specs: Array<{ contentType: string; query: string; preferredTerms: string[] }>;
}): Array<{ contentType: string; query: string; preferredTerms: string[] }> {
  const coverage = summarizeTrustedCoverage(input.entries);
  const genericRoleMode = isGenericRoleLabel(input.roleName);
  const focusSignals = extractQuestionFocusSignals({
    templateType: input.templateType,
    question: input.question,
    answer: input.answer,
    roleName: input.roleName,
  });
  const desiredContentTypes: string[] = [];

  if (!coverage.hasPeople) {
    desiredContentTypes.push("new_grad_recruitment");
    if (
      input.templateType === "role_course_reason" ||
      input.templateType === "intern_reason" ||
      input.templateType === "intern_goals"
    ) {
      desiredContentTypes.push("employee_interviews");
    }
  }

  if (!coverage.hasBusiness) {
    desiredContentTypes.push("corporate_site");
  }

  if (
    !coverage.hasStrategy &&
    genericRoleMode &&
    (focusSignals.themes.includes("事業理解") || focusSignals.themes.includes("将来接続"))
  ) {
    desiredContentTypes.push("midterm_plan", "ir_materials");
  }

  if (desiredContentTypes.length === 0) {
    return [];
  }

  const desired = new Set(desiredContentTypes);
  const selected = input.specs.filter((spec) => desired.has(spec.contentType));
  const maxSpecs = ASSISTIVE_TEMPLATE_TYPES.has(input.templateType) ? 1 : 2;
  return (selected.length > 0 ? selected : input.specs.slice(0, maxSpecs)).slice(0, maxSpecs);
}

export function hasSufficientCompanyCoverage(input: {
  templateType: TemplateType;
  question: string;
  answer?: string;
  roleName?: string | null;
  entries: CorporateInfoUrlEntry[];
}): boolean {
  const { hasPeople, hasBusiness, hasStrategy } = summarizeTrustedCoverage(input.entries);
  const genericRoleMode = isGenericRoleLabel(input.roleName);
  const focusSignals = extractQuestionFocusSignals({
    templateType: input.templateType,
    question: input.question,
    answer: input.answer,
    roleName: input.roleName,
  });
  const assistiveMode = ASSISTIVE_TEMPLATE_TYPES.has(input.templateType);

  if (assistiveMode) {
    if (input.templateType === "gakuchika" && !hasAssistiveCompanySignal(input.templateType, input.question)) {
      return true;
    }
    return hasPeople || hasBusiness;
  }

  if (input.templateType === "intern_reason" || input.templateType === "intern_goals" || input.templateType === "role_course_reason") {
    return hasPeople && hasBusiness;
  }
  if (input.templateType === "company_motivation" || input.templateType === "post_join_goals") {
    return hasPeople && hasBusiness;
  }
  if (genericRoleMode) {
    if (focusSignals.themes.includes("事業理解") || focusSignals.themes.includes("将来接続")) {
      return hasPeople && hasBusiness && hasStrategy;
    }
    return hasPeople && hasBusiness;
  }
  return hasBusiness;
}

export function shouldRunPrestreamEnrichment(input: {
  templateType: TemplateType;
  question: string;
  answer?: string;
  roleName?: string | null;
  llmModel?: string | null;
  corporateInfoUrls: CorporateInfoUrlEntry[];
  corporateInfoFetchedAt?: Date | null;
}): boolean {
  if (!PRESTREAM_ENRICHMENT_TEMPLATE_TYPES.has(input.templateType)) {
    return false;
  }
  if (isLowCostESReviewModel(input.llmModel)) {
    return false;
  }
  if (ASSISTIVE_TEMPLATE_TYPES.has(input.templateType) && !hasAssistiveCompanySignal(input.templateType, input.question)) {
    return false;
  }
  const emptyUrls = input.corporateInfoUrls.length === 0;
  if (emptyUrls) {
    const fetchedAt = input.corporateInfoFetchedAt;
    if (fetchedAt instanceof Date && !Number.isNaN(fetchedAt.getTime())) {
      const ageMs = Date.now() - fetchedAt.getTime();
      if (ageMs >= 0 && ageMs < PRESTREAM_EMPTY_URL_RECENT_FETCH_TTL_MS) {
        return false;
      }
    }
  }
  if (!hasSufficientCompanyCoverage({
    templateType: input.templateType,
    question: input.question,
    answer: input.answer,
    roleName: input.roleName,
    entries: input.corporateInfoUrls,
  })) {
    return true;
  }
  return false;
}

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return { userId: null, guestId: guest.id };
    }
  }

  return null;
}

async function verifyDocumentAccess(
  documentId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; document?: typeof documents.$inferSelect }> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) {
    return { valid: false };
  }

  if (userId && doc.userId === userId) {
    return { valid: true, document: doc };
  }
  if (guestId && doc.guestId === guestId) {
    return { valid: true, document: doc };
  }

  return { valid: false };
}

function resolveRoleContext(explicitRoleName?: string): RoleContext {
  const manualRole = normalizeRoleLabel(explicitRoleName);
  if (manualRole) {
    return {
      primary_role: manualRole,
      role_candidates: [manualRole],
      source: "user_input",
    };
  }

  return {
    primary_role: undefined,
    role_candidates: [],
    source: "none",
  };
}

function isRootCorporatePage(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    return pathname === "";
  } catch {
    return false;
  }
}

function hasInterviewSignal(candidate: { url: string; title?: string; snippet?: string }): boolean {
  const text = `${candidate.url} ${candidate.title ?? ""} ${candidate.snippet ?? ""}`.toLowerCase();
  return /(interview|voice|people|member|staff|先輩社員|社員の声|働く人|社員紹介|人を知る|座談会|project story|プロジェクトストーリー|career story|職種紹介)/.test(text);
}

function isTrustedSearchCandidate(candidate: SearchCandidate): boolean {
  if (candidate.confidence === "low") {
    return false;
  }
  if (candidate.sourceType === "official") {
    return true;
  }
  return candidate.sourceType === "parent" && candidate.parentAllowed === true;
}

function isPrimaryCandidate(candidate: SearchCandidate, contentType: string, knownUrls: Set<string>): boolean {
  if (!candidate.url || knownUrls.has(candidate.url) || !isTrustedSearchCandidate(candidate)) {
    return false;
  }
  if (contentType === "employee_interviews") {
    return !isRootCorporatePage(candidate.url) && hasInterviewSignal(candidate);
  }
  return true;
}

function collectUserProvidedCorporateUrls(entries: CorporateInfoUrlEntry[]): string[] {
  const urls: string[] = [];
  for (const entry of entries) {
    if (!entry.url) {
      continue;
    }
    if (entry.sourceOrigin === "prestream_enrichment") {
      continue;
    }
    if (!urls.includes(entry.url)) {
      urls.push(entry.url);
    }
  }
  return urls;
}

function extractSecondaryHintTerms(
  candidates: SearchCandidate[],
  preferredTerms: string[],
  companyName: string,
): string[] {
  const hints: string[] = [];
  const vocab = [...preferredTerms, ...SECONDARY_HINT_VOCAB];
  const companyNameTokens = companyName.replace(/\s+/g, "").split(/[・\s]/).filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.sourceType === "official" || candidate.confidence === "low") {
      continue;
    }
    const text = `${candidate.title ?? ""} ${candidate.snippet ?? ""}`.trim();
    if (!text) {
      continue;
    }
    for (const term of vocab) {
      if (
        text.includes(term) &&
        !hints.includes(term) &&
        !companyNameTokens.some((token) => token && term.includes(token))
      ) {
        hints.push(term);
      }
      if (hints.length >= 3) {
        return hints;
      }
    }
  }

  return hints;
}

async function searchCorporateCandidates(input: {
  origin: string;
  headers: HeadersInit;
  companyId: string;
  contentType: string;
  query: string;
  allowSnippetMatch?: boolean;
  timeoutMs: number;
}): Promise<{ candidates: SearchCandidate[]; timedOut: boolean }> {
  const { response, timedOut } = await fetchWithTimeout(
    `${input.origin}/api/companies/${input.companyId}/search-corporate-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...input.headers,
      },
      body: JSON.stringify({
        contentType: input.contentType,
        customQuery: input.query,
        allowSnippetMatch: input.allowSnippetMatch ?? false,
        cacheMode: "use",
      }),
    },
    input.timeoutMs,
  );

  if (!response?.ok) {
    return { candidates: [], timedOut };
  }

  const data = (await response.json().catch(() => null)) as { candidates?: SearchCandidate[] } | null;
  return {
    candidates: Array.isArray(data?.candidates) ? data!.candidates : [],
    timedOut,
  };
}

async function performPrestreamCompanyEnrichment(input: {
  origin: string;
  headers: HeadersInit;
  companyId: string;
  companyName: string;
  templateType: TemplateType;
  sectionTitle: string;
  answer: string;
  industry?: string | null;
  roleName?: string | null;
  internName?: string | null;
  profileContext: ProfileContext | null;
  gakuchikaContext: GakuchikaContextItem[];
  otherSections: DocumentSectionContext[];
  corporateInfoFetchedAt?: Date | null;
  corporateInfoUrls: CorporateInfoUrlEntry[];
  llmModel?: string | null;
}): Promise<PrestreamEnrichmentResult> {
  if (
    !shouldRunPrestreamEnrichment({
      templateType: input.templateType,
      question: input.sectionTitle,
      answer: input.answer,
      roleName: input.roleName,
      llmModel: input.llmModel,
      corporateInfoUrls: input.corporateInfoUrls,
      corporateInfoFetchedAt: input.corporateInfoFetchedAt,
    })
  ) {
    return { attempted: false, completed: false, addedSources: 0, sourceUrls: [] };
  }

  const userHintTerms = buildPrestreamUserHintTerms({
    profileContext: input.profileContext,
    gakuchikaContext: input.gakuchikaContext,
    otherSections: input.otherSections,
  });
  let specs = buildPrestreamEnrichmentSpecs({
    templateType: input.templateType,
    companyName: input.companyName,
    industry: input.industry,
    question: input.sectionTitle,
    answer: input.answer,
    roleName: input.roleName,
    internName: input.internName,
    userHintTerms,
  });
  specs = selectPrestreamSpecsForCoverage({
    templateType: input.templateType,
    question: input.sectionTitle,
    answer: input.answer,
    roleName: input.roleName,
    entries: input.corporateInfoUrls,
    specs,
  });
  if (specs.length === 0) {
    return { attempted: false, completed: false, addedSources: 0, sourceUrls: [] };
  }

  console.info("[ES添削/企業補強] pre-stream enrichment start", {
    companyId: input.companyId,
    templateType: input.templateType,
    specCount: specs.length,
    userHintTerms,
  });

  const knownUrls = new Set(input.corporateInfoUrls.map((entry) => entry.url));
  const groupedUrls = new Map<string, string[]>();
  const groupedSourceMetadata = new Map<string, Record<string, Partial<CorporateInfoSource>>>();
  const deadlineMs = Date.now() + PRESTREAM_ENRICHMENT_BUDGET_MS;
  let completed = true;
  const sourceUrls: string[] = [];

  for (const spec of specs) {
    const initialRemainingMs = getRemainingTimeMs(deadlineMs);
    if (initialRemainingMs < PRESTREAM_MIN_REMAINING_MS) {
      completed = false;
      break;
    }
    const initialSearch = await searchCorporateCandidates({
      origin: input.origin,
      headers: input.headers,
      companyId: input.companyId,
      contentType: spec.contentType,
      query: spec.query,
      timeoutMs: Math.min(PRESTREAM_SEARCH_TIMEOUT_MS, initialRemainingMs),
    });
    if (initialSearch.timedOut) {
      completed = false;
    }
    const initialCandidates = initialSearch.candidates;

    let chosen = initialCandidates.find((candidate) => isPrimaryCandidate(candidate, spec.contentType, knownUrls));

    if (!chosen) {
      const hintTerms = extractSecondaryHintTerms(initialCandidates, spec.preferredTerms, input.companyName);
      if (hintTerms.length > 0) {
        const retryRemainingMs = getRemainingTimeMs(deadlineMs);
        if (retryRemainingMs < PRESTREAM_MIN_REMAINING_MS) {
          completed = false;
          break;
        }
        const retrySearch = await searchCorporateCandidates({
          origin: input.origin,
          headers: input.headers,
          companyId: input.companyId,
          contentType: spec.contentType,
          query: buildQuery([spec.query, ...hintTerms]),
          allowSnippetMatch: true,
          timeoutMs: Math.min(PRESTREAM_SEARCH_TIMEOUT_MS, retryRemainingMs),
        });
        if (retrySearch.timedOut) {
          completed = false;
        }
        chosen = retrySearch.candidates.find((candidate) => isPrimaryCandidate(candidate, spec.contentType, knownUrls));
      }
    }

    if (!chosen) {
      continue;
    }

    const bucket = groupedUrls.get(spec.contentType) ?? [];
    bucket.push(chosen.url);
    groupedUrls.set(spec.contentType, bucket);
    const metadataBucket = groupedSourceMetadata.get(spec.contentType) ?? {};
    metadataBucket[chosen.url] = {
      sourceType: chosen.sourceType,
      relationCompanyName: chosen.relationCompanyName ?? undefined,
      parentAllowed: chosen.parentAllowed === true,
      trustedForEsReview: isTrustedSearchCandidate(chosen),
    };
    groupedSourceMetadata.set(spec.contentType, metadataBucket);
    knownUrls.add(chosen.url);
    if (!sourceUrls.includes(chosen.url)) {
      sourceUrls.push(chosen.url);
    }
  }

  let addedSources = 0;
  for (const [contentType, urls] of groupedUrls.entries()) {
    if (urls.length === 0) {
      continue;
    }
    const remainingMs = getRemainingTimeMs(deadlineMs);
    if (remainingMs < PRESTREAM_MIN_REMAINING_MS) {
      completed = false;
      break;
    }
    const { response, timedOut } = await fetchWithTimeout(
      `${input.origin}/api/companies/${input.companyId}/fetch-corporate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...input.headers,
        },
        body: JSON.stringify({
          urls,
          contentType,
          contentChannel:
            contentType === "ir_materials" || contentType === "midterm_plan"
              ? "corporate_ir"
              : "corporate_general",
          sourceOrigin: "prestream_enrichment",
          sourceMetadata: groupedSourceMetadata.get(contentType) ?? {},
        }),
      },
      Math.min(PRESTREAM_FETCH_TIMEOUT_MS, remainingMs),
    );
    if (timedOut) {
      completed = false;
    }

    if (!response) {
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.warn("[ES添削/企業補強] fetch-corporate failed", {
        companyId: input.companyId,
        contentType,
        urls,
        status: response.status,
        body: errorBody,
      });
      continue;
    }

    const data = (await response.json().catch(() => null)) as { pagesCrawled?: number } | null;
    addedSources += data?.pagesCrawled ?? urls.length;
  }

  console.info("[ES添削/企業補強] pre-stream enrichment complete", {
    companyId: input.companyId,
    addedSources,
    completed,
  });
  return { attempted: true, completed, addedSources, sourceUrls };
}

export async function handleReviewStream(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  backendPath: string = "/api/es/review/stream",
) {
  try {
    const { id: documentId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    // Rate limiting check
    const rateLimitKey = createRateLimitKey("review", userId, guestId);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.review);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "リクエストが多すぎます。しばらく待ってから再試行してください。",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    const access = await verifyDocumentAccess(documentId, userId, guestId);
    if (!access.valid || !access.document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const {
      content,
      sectionId,
      hasCompanyRag = false,
      companyId: requestCompanyId,
      sectionTitle,
      sectionCharLimit,
      templateType,
      internName,
      roleName,
      industryOverride,
      llmModel,
    } = body as {
      content: string;
      sectionId?: string;
      hasCompanyRag?: boolean;
      companyId?: string;
      sectionTitle?: string;
      sectionCharLimit?: number;
      templateType?: TemplateType;
      internName?: string;
      roleName?: string;
      industryOverride?: string;
      llmModel?: string;
    };
    const resolvedLLMModel = typeof llmModel === "string" && isStandardESReviewModel(llmModel) ? llmModel : null;

    // Verify requestCompanyId ownership to prevent IDOR
    let companyId = access.document.companyId;
    if (requestCompanyId && requestCompanyId !== access.document.companyId) {
      const [ownedCompany] = await db
        .select({ id: companies.id, userId: companies.userId, guestId: companies.guestId })
        .from(companies)
        .where(eq(companies.id, requestCompanyId))
        .limit(1);
      if (
        ownedCompany &&
        ((userId && ownedCompany.userId === userId) ||
         (guestId && ownedCompany.guestId === guestId))
      ) {
        companyId = requestCompanyId;
      }
      // else: silently fall back to document's companyId (safe default)
    } else if (requestCompanyId) {
      companyId = requestCompanyId;
    }

    // Fetch company info so prompt construction can use company-aware quality guidance.
    let companyInfo: {
      name: string | null;
      industry: string | null;
      corporateInfoFetchedAt: Date | null;
      corporateInfoUrls: CorporateInfoUrlEntry[];
    } = {
      name: null,
      industry: null,
      corporateInfoFetchedAt: null,
      corporateInfoUrls: [],
    };
    if (companyId) {
      const [company] = await db
        .select({
          name: companies.name,
          industry: companies.industry,
          corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
          corporateInfoUrls: companies.corporateInfoUrls,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (company) {
        companyInfo = {
          name: company.name,
          industry: company.industry,
          corporateInfoFetchedAt: company.corporateInfoFetchedAt,
          corporateInfoUrls: parseCorporateInfoUrls(company.corporateInfoUrls),
        };
      }
    }

    let effectiveTemplateType: TemplateType;
    if (!companyId) {
      const resolved = resolveEffectiveTemplateTypeWithoutCompany(templateType, sectionTitle || "");
      if (!resolved.ok) {
        return new Response(
          JSON.stringify({
            error:
              "企業未選択の添削では、設問タイプは自動・ガクチカ・自己PR・価値観のいずれかにしてください",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      effectiveTemplateType = resolved.effective;
    } else {
      effectiveTemplateType = templateType ?? inferTemplateType(sectionTitle || "");
    }
    const resolvedIndustry = resolveIndustryForReview({
      companyName: companyInfo.name,
      companyIndustry: companyInfo.industry,
      industryOverride,
    });
    const resolvedRoleContext = resolveRoleContext(roleName);
    const [profileContext, gakuchikaContext] = userId
      ? await Promise.all([
          fetchProfileContext(userId),
          fetchGakuchikaContext(userId, { allowIncomplete: true, limit: 4 }),
        ])
      : [null, []];
    const otherSections = extractOtherDocumentSections(
      access.document.content,
      sectionTitle || null,
      { maxSections: 4, maxCharsPerSection: 260 },
    );
    if (!content || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "内容が空です" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (companyId && !resolvedIndustry) {
      return new Response(
        JSON.stringify({ error: "企業に合わせた添削では、先に業界を選択してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (companyId && !resolvedRoleContext.primary_role) {
      return new Response(
        JSON.stringify({ error: "企業に合わせた添削では、先に職種を選択してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const retrievalQuery = buildRetrievalQuery({
      templateType: effectiveTemplateType,
      industry: resolvedIndustry,
      sectionTitle: sectionTitle || "",
      sectionContent: content,
      companyName: companyInfo.name,
      roleName: resolvedRoleContext.primary_role,
      internName: internName || null,
      profileContext,
      gakuchikaContext,
      otherSections,
    });

    // Calculate credit cost: max(2, ceil(chars/800)), max 5
    const charCount = content.length;
    const creditCost = calculateESReviewCost(charCount, resolvedLLMModel);

    // Reserve credits upfront (only for logged-in users)
    // Credits are deducted now and refunded if the stream fails.
    let reservationId: string | null = null;
    if (userId) {
      const reservation = await reserveCredits(userId, creditCost, "es_review", documentId, `ES添削: ${documentId}`);
      if (!reservation.success) {
        return new Response(
          JSON.stringify({ error: "クレジットが不足しています", creditCost }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      reservationId = reservation.reservationId;
    } else {
      // Guests can't use AI review - require login
      return new Response(
        JSON.stringify({ error: "AI添削機能を使用するにはログインが必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    let prestreamEnrichmentAttempted = false;
    let prestreamEnrichmentCompleted = false;
    let prestreamEnrichmentSourcesAdded = 0;
    let prestreamSourceUrls: string[] = [];
    const userProvidedCorporateUrls = collectUserProvidedCorporateUrls(companyInfo.corporateInfoUrls);
    if (companyId && companyInfo.name) {
      try {
        const enrichment = await performPrestreamCompanyEnrichment({
          origin: request.nextUrl.origin,
          headers: {
            cookie: request.headers.get("cookie") || "",
            "x-device-token": request.headers.get("x-device-token") || "",
          },
          companyId,
          companyName: companyInfo.name,
          templateType: effectiveTemplateType,
          sectionTitle: sectionTitle || "",
          answer: content,
          industry: resolvedIndustry,
          roleName: resolvedRoleContext.primary_role || null,
          internName: internName || null,
          profileContext,
          gakuchikaContext,
          otherSections,
          corporateInfoFetchedAt: companyInfo.corporateInfoFetchedAt,
          corporateInfoUrls: companyInfo.corporateInfoUrls,
          llmModel: resolvedLLMModel,
        });
        prestreamEnrichmentAttempted = enrichment.attempted;
        prestreamEnrichmentCompleted = enrichment.completed || enrichment.sourceUrls.length > 0;
        prestreamEnrichmentSourcesAdded = enrichment.addedSources;
        prestreamSourceUrls = enrichment.sourceUrls;
      } catch (enrichmentError) {
        prestreamEnrichmentAttempted = true;
        console.warn("[ES添削/企業補強] pre-stream enrichment error", {
          companyId,
          templateType: effectiveTemplateType,
          error:
            enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError),
        });
      }
    }

    // Call FastAPI SSE streaming endpoint
    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";

    const aiResponse = await fetch(`${fastApiUrl}${backendPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        section_id: sectionId,
        has_company_rag: hasCompanyRag,
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
            }
          : null,
        role_context: resolvedRoleContext,
        retrieval_query: retrievalQuery,
        profile_context: profileContext,
        gakuchika_context: gakuchikaContext,
        document_context: otherSections.length > 0 ? { other_sections: otherSections } : null,
        llm_model: resolvedLLMModel,
        // SSE specific: include document_id for credit consumption on completion
        document_id: documentId,
        user_id: userId,
        credit_cost: creditCost,
        prestream_enrichment_attempted: prestreamEnrichmentAttempted,
        prestream_enrichment_completed: prestreamEnrichmentCompleted,
        prestream_enrichment_sources_added: prestreamEnrichmentSourcesAdded,
        prestream_source_urls: prestreamSourceUrls,
        user_provided_corporate_urls: userProvidedCorporateUrls,
      }),
    });

    if (!aiResponse.ok) {
      // FastAPI rejected the request — refund reserved credits
      if (reservationId) {
        await cancelReservation(reservationId).catch(console.error);
      }
      const errorBody = await aiResponse.json().catch(() => null);
      return new Response(
        JSON.stringify({
          error: errorBody?.detail?.error || "AI review failed",
          error_type: errorBody?.detail?.error_type,
        }),
        { status: aiResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Consume and re-emit individual SSE events so the browser receives
    // stable event boundaries even when upstream chunks are bursty.
    const fastApiBody = aiResponse.body;
    if (!fastApiBody) {
      if (reservationId) {
        await cancelReservation(reservationId).catch(console.error);
      }
      return new Response(
        JSON.stringify({ error: "AIレスポンスが空です" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const capturedReservationId = reservationId;
    let creditConfirmed = false;
    const reader = fastApiBody.getReader();
    const decoder = new TextDecoder();

    const confirmCreditsIfNeeded = async (eventType: unknown) => {
      if (eventType !== "complete" || creditConfirmed || !capturedReservationId) {
        return;
      }
      creditConfirmed = true;
      await confirmReservation(capturedReservationId).catch(console.error);
    };

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let buffer = "";

        const forwardEventBlock = async (eventBlock: string) => {
          if (!eventBlock.trim()) {
            return;
          }

          const dataLine = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data:"));

          if (dataLine) {
            const payload = dataLine.slice(5).trim();
            try {
              const event = JSON.parse(payload) as { type?: string };
              await confirmCreditsIfNeeded(event.type);
            } catch {
              // Forward raw payload even if parsing fails.
            }
          }

          controller.enqueue(encoder.encode(`${eventBlock}\n\n`));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const eventBlocks = buffer.split("\n\n");
            buffer = eventBlocks.pop() || "";

            for (const eventBlock of eventBlocks) {
              await forwardEventBlock(eventBlock);
            }
          }

          if (buffer.trim()) {
            await forwardEventBlock(buffer);
          }

          controller.close();
        } catch (streamError) {
          console.error(`Error proxying ES review SSE stream (${backendPath}):`, streamError);
          const errorEvent = {
            type: "error",
            message: "AIストリーム接続が途中で切れました。しばらくしてから再試行してください。",
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
          );
          controller.close();
        } finally {
          if (!creditConfirmed && capturedReservationId) {
            await cancelReservation(capturedReservationId).catch(console.error);
          }
          reader.releaseLock();
        }
      },
      async cancel() {
        await reader.cancel().catch(() => undefined);
        if (!creditConfirmed && capturedReservationId) {
          await cancelReservation(capturedReservationId).catch(console.error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error(`Error in review stream (${backendPath}):`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleReviewStream(request, { params }, "/api/es/review/stream");
}
