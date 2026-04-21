/**
 * Phase 2 Stage 8: Interview growth dashboard aggregations.
 *
 * Pure functions that transform `interview_feedback_histories` rows into
 * four dashboard sections:
 *   1. Trend series — 7 axis scores across the most recent N sessions
 *   2. Company heatmap — company x axis average scores (top N companies)
 *   3. Format heatmap — interview_format x axis average scores
 *   4. Recurring issues — keyword frequency TOP 5 across the most recent N sessions
 *
 * The 7 axes are aligned with the backend `INTERVIEW_FEEDBACK_SCHEMA`:
 *   company_fit / role_fit / specificity / logic / persuasiveness / consistency / credibility
 *
 * These helpers are pure and deterministic so they can be unit-tested without
 * touching the database / HTTP layer.
 */

/** 7 axes used by the interview feedback schema. Kept in this order across UI. */
export const INTERVIEW_AXES = [
  "company_fit",
  "role_fit",
  "specificity",
  "logic",
  "persuasiveness",
  "consistency",
  "credibility",
] as const;

export type InterviewAxis = (typeof INTERVIEW_AXES)[number];

export const INTERVIEW_AXIS_LABELS: Record<InterviewAxis, string> = {
  company_fit: "企業適合",
  role_fit: "職種適合",
  specificity: "具体性",
  logic: "論理性",
  persuasiveness: "説得力",
  consistency: "一貫性",
  credibility: "信頼性",
};

/** 4 interview formats used by the backend. */
export const INTERVIEW_FORMATS = [
  "standard_behavioral",
  "case",
  "technical",
  "life_history",
] as const;

export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number];

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  standard_behavioral: "通常",
  case: "ケース",
  technical: "技術",
  life_history: "自分史",
};

/**
 * Normalized history row.
 * `scores` is the raw jsonb column; `improvements` is string[] of issues;
 * `completedAt` is ISO timestamp of when feedback was generated.
 */
export type InterviewHistoryRow = {
  companyId: string | null;
  companyName: string | null;
  interviewFormat: string | null;
  scores: unknown;
  improvements: unknown;
  completedAt: Date | string;
};

export type TrendPoint = {
  /** Session index label used on the x-axis, e.g. "2026-04-17 14:30" */
  session: string;
  /** Raw completedAt ISO string; helpful for sorting / deduping in client code. */
  sessionAt: string;
  axis: InterviewAxis;
  score: number;
};

export type CompanyHeatmapCell = {
  company: string;
  axis: InterviewAxis;
  avgScore: number;
  sampleSize: number;
};

export type FormatHeatmapCell = {
  format: InterviewFormat;
  axis: InterviewAxis;
  avgScore: number;
  sampleSize: number;
};

export type RecurringIssue = {
  keyword: string;
  count: number;
};

function parseScores(raw: unknown): Partial<Record<InterviewAxis, number>> {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const out: Partial<Record<InterviewAxis, number>> = {};
  for (const axis of INTERVIEW_AXES) {
    const value = record[axis];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[axis] = value;
    }
  }
  return out;
}

function parseImprovements(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toSessionLabel(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const iso = date.toISOString();
  // YYYY-MM-DD HH:mm (UTC ベース — 同一クライアントで並び順のみ保証)
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function isInterviewFormat(value: unknown): value is InterviewFormat {
  return typeof value === "string" && (INTERVIEW_FORMATS as readonly string[]).includes(value);
}

/**
 * Past `limit` sessions (oldest first within the slice) x 7 axes.
 *
 * Histories are expected to be provided newest-first (same as
 * `order by completed_at desc` in SQL). We slice the most recent `limit`
 * then reverse to return oldest -> newest so the chart reads left-to-right.
 */
export function computeTrendSeries(
  histories: InterviewHistoryRow[],
  limit = 10,
): TrendPoint[] {
  if (!Array.isArray(histories) || histories.length === 0) return [];
  const recent = histories.slice(0, Math.max(0, limit));
  const ordered = [...recent].reverse();
  const points: TrendPoint[] = [];
  for (const history of ordered) {
    const scores = parseScores(history.scores);
    const sessionAt = toIsoString(history.completedAt);
    const session = toSessionLabel(history.completedAt);
    for (const axis of INTERVIEW_AXES) {
      const score = scores[axis];
      if (typeof score !== "number") continue;
      points.push({ session, sessionAt, axis, score });
    }
  }
  return points;
}

/**
 * For each of the top `limit` companies by sample count, compute the average
 * score of each axis across that company's sessions.
 */
export function computeCompanyHeatmap(
  histories: InterviewHistoryRow[],
  limit = 10,
): CompanyHeatmapCell[] {
  if (!Array.isArray(histories) || histories.length === 0) return [];
  // group by companyName (fallback to companyId if name missing)
  const byCompany = new Map<
    string,
    { sumByAxis: Partial<Record<InterviewAxis, number>>; countByAxis: Partial<Record<InterviewAxis, number>>; total: number }
  >();
  for (const history of histories) {
    const key = history.companyName?.trim() || history.companyId?.trim();
    if (!key) continue;
    const scores = parseScores(history.scores);
    let bucket = byCompany.get(key);
    if (!bucket) {
      bucket = { sumByAxis: {}, countByAxis: {}, total: 0 };
      byCompany.set(key, bucket);
    }
    bucket.total += 1;
    for (const axis of INTERVIEW_AXES) {
      const score = scores[axis];
      if (typeof score !== "number") continue;
      bucket.sumByAxis[axis] = (bucket.sumByAxis[axis] ?? 0) + score;
      bucket.countByAxis[axis] = (bucket.countByAxis[axis] ?? 0) + 1;
    }
  }

  // sort by total sample size desc, tiebreak alphabetically for determinism
  const sorted = [...byCompany.entries()].sort((a, b) => {
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    return a[0].localeCompare(b[0]);
  });
  const top = sorted.slice(0, Math.max(0, limit));

  const cells: CompanyHeatmapCell[] = [];
  for (const [company, bucket] of top) {
    for (const axis of INTERVIEW_AXES) {
      const count = bucket.countByAxis[axis] ?? 0;
      const sum = bucket.sumByAxis[axis] ?? 0;
      const avgScore = count > 0 ? sum / count : 0;
      cells.push({
        company,
        axis,
        avgScore: Number(avgScore.toFixed(2)),
        sampleSize: count,
      });
    }
  }
  return cells;
}

/**
 * For each of the 4 interview formats, compute the average score of each axis.
 * Formats with zero samples still return a row with sampleSize=0 to keep the
 * UI grid stable.
 */
export function computeFormatHeatmap(histories: InterviewHistoryRow[]): FormatHeatmapCell[] {
  const buckets = new Map<
    InterviewFormat,
    { sumByAxis: Partial<Record<InterviewAxis, number>>; countByAxis: Partial<Record<InterviewAxis, number>> }
  >();
  for (const format of INTERVIEW_FORMATS) {
    buckets.set(format, { sumByAxis: {}, countByAxis: {} });
  }
  for (const history of histories ?? []) {
    const format = isInterviewFormat(history.interviewFormat) ? history.interviewFormat : null;
    if (!format) continue;
    const scores = parseScores(history.scores);
    const bucket = buckets.get(format)!;
    for (const axis of INTERVIEW_AXES) {
      const score = scores[axis];
      if (typeof score !== "number") continue;
      bucket.sumByAxis[axis] = (bucket.sumByAxis[axis] ?? 0) + score;
      bucket.countByAxis[axis] = (bucket.countByAxis[axis] ?? 0) + 1;
    }
  }

  const cells: FormatHeatmapCell[] = [];
  for (const format of INTERVIEW_FORMATS) {
    const bucket = buckets.get(format)!;
    for (const axis of INTERVIEW_AXES) {
      const count = bucket.countByAxis[axis] ?? 0;
      const sum = bucket.sumByAxis[axis] ?? 0;
      const avgScore = count > 0 ? sum / count : 0;
      cells.push({
        format,
        axis,
        avgScore: Number(avgScore.toFixed(2)),
        sampleSize: count,
      });
    }
  }
  return cells;
}

// Common Japanese stopwords / particles / fillers we strip while building keyword frequency.
const JA_STOPWORDS = new Set([
  "こと", "もの", "ため", "よう", "ここ", "そこ", "これ", "それ", "あれ", "どれ",
  "ください", "ましょう", "ですが", "ですね", "ました", "ません", "ところ", "うえ",
  "ただ", "もっと", "さらに", "また", "ほか", "以上", "以下", "など", "ほど",
  "という", "といった", "そして", "しかし", "ただし", "例えば", "たとえば",
  "場合", "必要", "方法", "観点", "部分", "内容", "箇所", "点", "回答", "質問",
  "面接", "あなた", "自分", "応募", "応答", "状態", "基本", "具体", "非常",
  "強化", "改善", "検討", "記述", "整理",
]);
const EN_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "and", "or",
  "on", "for", "with", "you", "your", "be", "at", "as", "it", "this", "that",
  "by", "but", "from", "have", "has", "had", "do", "does", "did", "can", "could",
  "should", "would", "will", "may", "might", "not", "no", "all", "any", "more",
  "less", "very", "just", "too", "also", "their", "they", "there",
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  const lowered = text.toLowerCase();
  // Capture runs of alphanumerics/kana/CJK (length >= 2). Punctuation/whitespace is a boundary.
  const matches = lowered.match(/[a-z0-9]{2,}|[\u3040-\u309f\u30a0-\u30ff]{2,}|[\u3400-\u9fff]{2,}/g);
  if (!matches) return [];
  return matches.filter((token) => {
    if (JA_STOPWORDS.has(token)) return false;
    if (EN_STOPWORDS.has(token)) return false;
    return token.length >= 2;
  });
}

/**
 * Keyword TOP 5 across the `improvements` field of the provided (recent) histories.
 * Deduplicates within each improvement text so "具体" mentioned twice in the same bullet
 * only counts once per bullet.
 */
export function computeRecurringIssues(
  recentHistories: InterviewHistoryRow[],
  topN = 5,
): RecurringIssue[] {
  if (!Array.isArray(recentHistories) || recentHistories.length === 0) return [];
  const counter = new Map<string, number>();
  for (const history of recentHistories) {
    const improvements = parseImprovements(history.improvements);
    for (const bullet of improvements) {
      const tokens = new Set(tokenize(bullet));
      for (const token of tokens) {
        counter.set(token, (counter.get(token) ?? 0) + 1);
      }
    }
  }
  const sorted = [...counter.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  return sorted.slice(0, Math.max(0, topN)).map(([keyword, count]) => ({ keyword, count }));
}

export type InterviewDashboardPayload = {
  trendSeries: TrendPoint[];
  companyHeatmap: CompanyHeatmapCell[];
  formatHeatmap: FormatHeatmapCell[];
  recurringIssues: RecurringIssue[];
  totalSessions: number;
};

/**
 * Convenience orchestrator that runs all four aggregations with the default
 * limits used by the /api/interview/dashboard route.
 */
export function buildInterviewDashboardPayload(
  histories: InterviewHistoryRow[],
  options: { trendLimit?: number; companyLimit?: number; recurringLimit?: number } = {},
): InterviewDashboardPayload {
  return {
    trendSeries: computeTrendSeries(histories, options.trendLimit ?? 10),
    companyHeatmap: computeCompanyHeatmap(histories, options.companyLimit ?? 10),
    formatHeatmap: computeFormatHeatmap(histories),
    recurringIssues: computeRecurringIssues(histories.slice(0, 3), options.recurringLimit ?? 5),
    totalSessions: histories.length,
  };
}
