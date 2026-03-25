/**
 * ES エディタ向け文書の分類（documents.es_category / API esCategory）。
 * documents.type は常に "es" のまま。別用途の documents.type = "tips" とは別カラム。
 */

import { z } from "zod";

export const ES_DOCUMENT_CATEGORIES = [
  "entry_sheet",
  "resume",
  "assignment",
  "memo",
  "interview_prep",
  "tips",
  "reflection",
  "other",
] as const;

export type EsDocumentCategory = (typeof ES_DOCUMENT_CATEGORIES)[number];

export const ES_DOCUMENT_CATEGORY_LABELS: Record<EsDocumentCategory, string> = {
  entry_sheet: "エントリーシート",
  resume: "履歴書",
  assignment: "課題",
  memo: "メモ",
  interview_prep: "面接準備",
  tips: "Tips",
  reflection: "振り返り",
  other: "その他",
};

export const esDocumentCategorySchema = z.enum(ES_DOCUMENT_CATEGORIES);

export const DEFAULT_ES_DOCUMENT_CATEGORY: EsDocumentCategory = "entry_sheet";

export function normalizeEsDocumentCategory(value: unknown): EsDocumentCategory {
  if (typeof value === "string" && (ES_DOCUMENT_CATEGORIES as readonly string[]).includes(value)) {
    return value as EsDocumentCategory;
  }
  return DEFAULT_ES_DOCUMENT_CATEGORY;
}
