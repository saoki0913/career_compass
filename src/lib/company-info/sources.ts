export type ContentType =
  | "new_grad_recruitment"
  | "midcareer_recruitment"
  | "corporate_site"
  | "ir_materials"
  | "ceo_message"
  | "employee_interviews"
  | "press_release"
  | "csr_sustainability"
  | "midterm_plan";

export type CorporateInfoSourceKind = "url" | "upload_pdf";
export type CorporateInfoSourceOrigin = "manual_user" | "prestream_enrichment";
export type CorporateInfoSourceStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface CorporateInfoSource {
  url: string;
  kind?: CorporateInfoSourceKind;
  sourceOrigin?: CorporateInfoSourceOrigin;
  fileName?: string;
  type?: "ir" | "business" | "about" | "general";
  contentType?: ContentType;
  secondaryContentTypes?: ContentType[];
  fetchedAt?: string;
  status?: CorporateInfoSourceStatus;
  jobId?: string;
  errorMessage?: string;
  chunksStored?: number;
  extractedChars?: number;
  extractionMethod?: string;
  updatedAt?: string;
}

const VALID_CONTENT_TYPES = new Set<ContentType>([
  "new_grad_recruitment",
  "midcareer_recruitment",
  "corporate_site",
  "ir_materials",
  "ceo_message",
  "employee_interviews",
  "press_release",
  "csr_sustainability",
  "midterm_plan",
]);

const VALID_SOURCE_STATUS = new Set<CorporateInfoSourceStatus>([
  "pending",
  "processing",
  "completed",
  "failed",
]);

const CONTENT_TYPE_URL_PATTERNS: Array<{ type: ContentType; patterns: string[] }> = [
  {
    type: "new_grad_recruitment",
    patterns: ["recruit", "shinsotsu", "newgrad", "entry", "saiyo", "graduate", "freshers"],
  },
  {
    type: "midcareer_recruitment",
    patterns: ["career", "midcareer", "tenshoku", "experienced", "chuto", "job-change"],
  },
  {
    type: "ceo_message",
    patterns: ["message", "ceo", "president", "greeting", "topmessage", "chairman", "representative"],
  },
  {
    type: "employee_interviews",
    patterns: ["interview", "voice", "story", "people", "staff", "member", "senpai"],
  },
  {
    type: "press_release",
    patterns: ["news", "press", "release", "newsroom", "information", "topics", "oshirase"],
  },
  {
    type: "ir_materials",
    patterns: ["ir", "investor", "financial", "stock", "kabunushi", "kessan", "securities"],
  },
  {
    type: "csr_sustainability",
    patterns: ["csr", "esg", "sustainability", "sdgs", "social", "environment", "responsible"],
  },
  {
    type: "midterm_plan",
    patterns: ["plan", "strategy", "mtp", "medium-term", "chuki", "keiei", "vision"],
  },
  {
    type: "corporate_site",
    patterns: ["about", "company", "corporate", "overview", "profile", "info"],
  },
];

export function isUploadSource(url: string): boolean {
  return url.startsWith("upload://");
}

export function detectContentTypeFromUrl(url: string): ContentType | null {
  const lower = url.toLowerCase();
  let bestType: ContentType | null = null;
  let bestScore = 0;

  for (const entry of CONTENT_TYPE_URL_PATTERNS) {
    let score = 0;
    for (const pattern of entry.patterns) {
      if (lower.includes(pattern)) {
        score += 1;
        if (lower.includes(`/${pattern}/`) || lower.endsWith(`/${pattern}`)) {
          score += 1;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = entry.type;
    }
  }

  return bestScore > 0 ? bestType : null;
}

function normalizeSecondaryContentTypes(value: unknown): ContentType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ContentType => typeof item === "string" && VALID_CONTENT_TYPES.has(item as ContentType));
}

function normalizeContentType(value: unknown): ContentType | undefined {
  if (typeof value !== "string") return undefined;
  return VALID_CONTENT_TYPES.has(value as ContentType) ? (value as ContentType) : undefined;
}

function normalizeSourceStatus(value: unknown): CorporateInfoSourceStatus | undefined {
  if (typeof value !== "string") return undefined;
  return VALID_SOURCE_STATUS.has(value as CorporateInfoSourceStatus)
    ? (value as CorporateInfoSourceStatus)
    : undefined;
}

export function parseCorporateInfoSources(raw: string | null | undefined): CorporateInfoSource[] {
  if (!raw || raw === "corporate_info_urls") {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry === "object" && typeof entry.url === "string")
      .map((entry) => {
        const uploadSource =
          entry.kind === "upload_pdf" || isUploadSource(String(entry.url));
        const normalizedContentType = normalizeContentType(entry.contentType);

        return {
          ...entry,
          kind: uploadSource ? "upload_pdf" : "url",
          sourceOrigin:
            entry.sourceOrigin === "prestream_enrichment"
              ? "prestream_enrichment"
              : "manual_user",
          fileName: typeof entry.fileName === "string" ? entry.fileName : undefined,
          contentType: normalizedContentType ?? (!uploadSource ? detectContentTypeFromUrl(String(entry.url)) ?? "corporate_site" : undefined),
          secondaryContentTypes: normalizeSecondaryContentTypes(entry.secondaryContentTypes),
          status: normalizeSourceStatus(entry.status) ?? "completed",
          jobId: typeof entry.jobId === "string" ? entry.jobId : undefined,
          errorMessage: typeof entry.errorMessage === "string" ? entry.errorMessage : undefined,
          chunksStored: typeof entry.chunksStored === "number" ? entry.chunksStored : undefined,
          extractedChars: typeof entry.extractedChars === "number" ? entry.extractedChars : undefined,
          extractionMethod: typeof entry.extractionMethod === "string" ? entry.extractionMethod : undefined,
          fetchedAt: typeof entry.fetchedAt === "string" ? entry.fetchedAt : undefined,
          updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
        } satisfies CorporateInfoSource;
      });
  } catch (error) {
    console.warn("Invalid corporateInfoUrls JSON, defaulting to empty.", error);
    return [];
  }
}

export function serializeCorporateInfoSources(sources: CorporateInfoSource[]): string {
  return JSON.stringify(sources);
}

export function upsertCorporateInfoSource(
  sources: CorporateInfoSource[],
  nextSource: CorporateInfoSource
): CorporateInfoSource[] {
  const next = [...sources];
  const index = next.findIndex((source) => source.url === nextSource.url);
  if (index >= 0) {
    next[index] = { ...next[index], ...nextSource };
    return next;
  }
  next.push(nextSource);
  return next;
}
