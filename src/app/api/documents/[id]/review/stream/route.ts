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
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { reserveCredits, confirmReservation, cancelReservation, calculateESReviewCost } from "@/lib/credits";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import type { TemplateType } from "@/hooks/useESReview";
import { isSelectableStandardESReviewModel, isStandardESReviewModel } from "@/lib/ai/es-review-models";
import { resolveIndustryForReview } from "@/lib/constants/es-review-role-catalog";

function deriveCharMin(charLimit?: number | null) {
  if (!charLimit) {
    return null;
  }
  return Math.max(0, charLimit - 10);
}

const COMPANYLESS_TEMPLATE_TYPES: TemplateType[] = ["gakuchika", "self_pr", "work_values"];
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
}

interface SearchCandidate {
  url: string;
  title?: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
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
  const text = question.trim();
  if (/学生時代|力を入れた|頑張ったこと|学業以外/.test(text)) return "gakuchika";
  if (/(自己pr|自己ＰＲ|自分の強み|あなたの強み|セールスポイント)/i.test(text)) return "self_pr";
  if (/インターン.*(理由|参加)/.test(text)) return "intern_reason";
  if (/インターン.*(学び|やりたい|目標|達成)/.test(text)) return "intern_goals";
  if (/(入社後|将来|実現したい|挑戦したい|やりたいこと)/.test(text)) return "post_join_goals";
  if (/(価値観|大切にしている|働くうえで)/.test(text)) return "work_values";
  if (/(職種|コース|部門|領域|デジタル企画|エンジニア|総合職).*理由/.test(text) || (/選択した理由/.test(text) && !/(当社|企業|貴社)/.test(text))) {
    return "role_course_reason";
  }
  if (/(志望理由|なぜ当社|当社を志望|選んだ理由)/.test(text)) return "company_motivation";
  return "basic";
}

function buildRetrievalQuery(input: {
  sectionTitle: string;
  sectionContent: string;
  companyName?: string | null;
  roleName?: string | null;
  internName?: string | null;
}) {
  const summary = input.sectionContent.replace(/\s+/g, " ").trim().slice(0, 140);
  return [input.companyName, input.roleName, input.internName, input.sectionTitle, summary].filter(Boolean).join(" / ");
}

function parseCorporateInfoUrls(raw: string | null): CorporateInfoUrlEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: CorporateInfoUrlEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || !("url" in item)) {
        continue;
      }
      const url = String((item as { url?: string }).url || "").trim();
      if (!url) {
        continue;
      }
      const entry = item as Partial<CorporateInfoUrlEntry>;
      entries.push({
        url,
        contentType: typeof entry.contentType === "string" ? entry.contentType : undefined,
        fetchedAt: typeof entry.fetchedAt === "string" ? entry.fetchedAt : undefined,
        kind: entry.kind === "upload_pdf" ? "upload_pdf" : "url",
        sourceOrigin: entry.sourceOrigin === "prestream_enrichment" ? "prestream_enrichment" : "manual_user",
        secondaryContentTypes: Array.isArray(entry.secondaryContentTypes)
          ? entry.secondaryContentTypes.filter((value): value is string => typeof value === "string")
          : [],
      });
    }
    return entries;
  } catch {
    return [];
  }
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
  question: string;
  answer?: string;
  roleName?: string | null;
  internName?: string | null;
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
    input.templateType === "intern_reason" || input.templateType === "intern_goals" ? input.internName : undefined,
    genericRoleMode ? undefined : input.roleName,
    ...peopleTerms,
    input.question,
  ]);
  const businessQuery = buildQuery([
    input.companyName,
    genericRoleMode ? undefined : input.roleName,
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

function hasSufficientCompanyCoverage(input: {
  templateType: TemplateType;
  question: string;
  answer?: string;
  roleName?: string | null;
  entries: CorporateInfoUrlEntry[];
}): boolean {
  const contentTypes = new Set(
    input.entries
      .map((entry) => entry.contentType)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const genericRoleMode = isGenericRoleLabel(input.roleName);
  const focusSignals = extractQuestionFocusSignals({
    templateType: input.templateType,
    question: input.question,
    answer: input.answer,
    roleName: input.roleName,
  });
  const hasPeople = contentTypes.has("new_grad_recruitment") || contentTypes.has("employee_interviews");
  const hasBusiness =
    contentTypes.has("corporate_site") || contentTypes.has("midterm_plan") || contentTypes.has("ir_materials");
  const hasStrategy = contentTypes.has("midterm_plan") || contentTypes.has("ir_materials");
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
  if (genericRoleMode) {
    if (focusSignals.themes.includes("事業理解") || focusSignals.themes.includes("将来接続")) {
      return hasPeople && hasBusiness && hasStrategy;
    }
    return hasPeople && hasBusiness;
  }
  return hasBusiness;
}

function shouldRunPrestreamEnrichment(input: {
  templateType: TemplateType;
  question: string;
  answer?: string;
  roleName?: string | null;
  corporateInfoFetchedAt?: Date | null;
  corporateInfoUrls: CorporateInfoUrlEntry[];
}): boolean {
  if (!PRESTREAM_ENRICHMENT_TEMPLATE_TYPES.has(input.templateType)) {
    return false;
  }
  if (ASSISTIVE_TEMPLATE_TYPES.has(input.templateType) && !hasAssistiveCompanySignal(input.templateType, input.question)) {
    return false;
  }
  if (input.corporateInfoUrls.length === 0) {
    return true;
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
  const lastFetchedAt = input.corporateInfoFetchedAt?.getTime() ?? 0;
  if (!lastFetchedAt) {
    return true;
  }
  return Date.now() - lastFetchedAt >= 24 * 60 * 60 * 1000;
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
  return /(interview|voice|people|member|staff|先輩社員|社員の声|働く人)/.test(text);
}

function isPrimaryCandidate(candidate: SearchCandidate, contentType: string, knownUrls: Set<string>): boolean {
  if (!candidate.url || knownUrls.has(candidate.url) || candidate.sourceType !== "official" || candidate.confidence === "low") {
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
  roleName?: string | null;
  internName?: string | null;
  corporateInfoFetchedAt?: Date | null;
  corporateInfoUrls: CorporateInfoUrlEntry[];
}): Promise<PrestreamEnrichmentResult> {
  if (
    !shouldRunPrestreamEnrichment({
      templateType: input.templateType,
      question: input.sectionTitle,
      answer: input.answer,
      roleName: input.roleName,
      corporateInfoFetchedAt: input.corporateInfoFetchedAt,
      corporateInfoUrls: input.corporateInfoUrls,
    })
  ) {
    return { attempted: false, completed: false, addedSources: 0, sourceUrls: [] };
  }

  const hasCoverage = hasSufficientCompanyCoverage({
    templateType: input.templateType,
    question: input.sectionTitle,
    answer: input.answer,
    roleName: input.roleName,
    entries: input.corporateInfoUrls,
  });
  const knownContentTypes = collectKnownContentTypes(input.corporateInfoUrls);
  let specs = buildPrestreamEnrichmentSpecs({
    templateType: input.templateType,
    companyName: input.companyName,
    question: input.sectionTitle,
    answer: input.answer,
    roleName: input.roleName,
    internName: input.internName,
  });
  if (!hasCoverage) {
    const missingCoverageSpecs = specs.filter((spec) => !knownContentTypes.has(spec.contentType));
    if (missingCoverageSpecs.length > 0) {
      specs = missingCoverageSpecs;
    }
  } else {
    specs = specs.slice(0, 2);
  }
  if (specs.length === 0) {
    return { attempted: false, completed: false, addedSources: 0, sourceUrls: [] };
  }

  console.info("[ES添削/企業補強] pre-stream enrichment start", {
    companyId: input.companyId,
    templateType: input.templateType,
    specCount: specs.length,
  });

  const knownUrls = new Set(input.corporateInfoUrls.map((entry) => entry.url));
  const groupedUrls = new Map<string, string[]>();
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
    if (typeof llmModel === "string" && isStandardESReviewModel(llmModel) && !isSelectableStandardESReviewModel(llmModel)) {
      return new Response(
        JSON.stringify({ error: "選択したモデルは現在調整中です" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const resolvedLLMModel =
      typeof llmModel === "string" && isSelectableStandardESReviewModel(llmModel) ? llmModel : null;

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

    const effectiveTemplateType = templateType ?? inferTemplateType(sectionTitle || "");
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
    const retrievalQuery = buildRetrievalQuery({
      sectionTitle: sectionTitle || "",
      sectionContent: content,
      companyName: companyInfo.name,
      roleName: resolvedRoleContext.primary_role,
      internName: internName || null,
    });

    if (!content || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "内容が空です" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!companyId && !COMPANYLESS_TEMPLATE_TYPES.includes(effectiveTemplateType)) {
      return new Response(
        JSON.stringify({ error: "企業未選択では、ガクチカ・自己PR・価値観のみ添削できます" }),
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

    // Calculate credit cost: max(2, ceil(chars/800)), max 5
    const charCount = content.length;
    const creditCost = calculateESReviewCost(charCount);

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
          roleName: resolvedRoleContext.primary_role || null,
          internName: internName || null,
          corporateInfoFetchedAt: companyInfo.corporateInfoFetchedAt,
          corporateInfoUrls: companyInfo.corporateInfoUrls,
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
