/**
 * 志望動機フィードバックサマリ（面接で話す要点整理）の型と防御的パーサ。
 * ガクチカ summary.ts と同じく、LLM 由来の緩い構造を安全に正規化する。
 */

export interface MotivationFeedbackPoint {
  title: string;
  description: string;
}

export interface MotivationFeedbackSummary {
  one_line_core_answer: string;
  strengths: MotivationFeedbackPoint[];
  improvements: MotivationFeedbackPoint[];
  next_preparation: string[];
  likely_followup_questions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

/** {title,description}[] へ正規化。文字列要素は {title, description:""} に昇格する。 */
function normalizePointItems(value: unknown): MotivationFeedbackPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        const title = item.trim();
        return title ? { title, description: "" } : null;
      }
      if (!isRecord(item)) return null;
      const title = cleanString(item.title);
      if (!title) return null;
      return { title, description: cleanString(item.description) };
    })
    .filter((item): item is MotivationFeedbackPoint => item !== null);
}

export function parseMotivationFeedbackSummary(value: unknown): MotivationFeedbackSummary | null {
  if (!value) return null;

  if (typeof value === "string") {
    try {
      return parseMotivationFeedbackSummary(JSON.parse(value));
    } catch {
      // FB は構造化前提のため、plain-text フォールバックは持たない。
      return null;
    }
  }

  if (!isRecord(value)) return null;

  const parsed: MotivationFeedbackSummary = {
    one_line_core_answer: cleanString(value.one_line_core_answer),
    strengths: normalizePointItems(value.strengths),
    improvements: normalizePointItems(value.improvements),
    next_preparation: cleanStringList(value.next_preparation),
    likely_followup_questions: cleanStringList(value.likely_followup_questions),
  };

  return motivationFeedbackHasVisibleContent(parsed) ? parsed : null;
}

/** 1 セクションでも描画する内容があれば true。 */
export function motivationFeedbackHasVisibleContent(s: MotivationFeedbackSummary): boolean {
  if (s.one_line_core_answer.trim()) return true;
  if (s.strengths.length > 0) return true;
  if (s.improvements.length > 0) return true;
  if (s.next_preparation.some((line) => line.trim())) return true;
  if (s.likely_followup_questions.some((line) => line.trim())) return true;
  return false;
}
