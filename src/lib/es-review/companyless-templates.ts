import type { TemplateType } from "@/hooks/useESReview";
import { inferTemplateTypeDetailsFromQuestion } from "@/lib/es-review/infer-template-type";

/** 企業未選択時に UI で選べる明示テンプレ（自動以外） */
export const COMPANYLESS_EXPLICIT_TEMPLATE_TYPES = ["gakuchika", "self_pr", "work_values"] as const;

const _explicit = new Set<string>(COMPANYLESS_EXPLICIT_TEMPLATE_TYPES);

/** 企業未選択かつ設問タイプ「自動」のときに推論結果をそのまま使ってよいテンプレ */
const COMPANYLESS_INFERRED_ALLOWED = new Set<TemplateType>([
  "basic",
  "gakuchika",
  "self_pr",
  "work_values",
]);

export function isCompanylessExplicitTemplateType(templateType: TemplateType): boolean {
  return _explicit.has(templateType);
}

/** 企業なし添削用の最終テンプレ。明示が不正なら null（呼び出し側で 400）。 */
export function resolveEffectiveTemplateTypeWithoutCompany(
  requestedTemplate: TemplateType | undefined,
  sectionTitle: string,
): { ok: true; effective: TemplateType } | { ok: false } {
  if (requestedTemplate) {
    if (!isCompanylessExplicitTemplateType(requestedTemplate)) {
      return { ok: false };
    }
    return { ok: true, effective: requestedTemplate };
  }
  const inferred = inferTemplateTypeDetailsFromQuestion(sectionTitle);
  if (inferred.confidence !== "high") {
    return { ok: true, effective: "basic" };
  }
  const inferredTemplate = inferred.templateType as TemplateType;
  if (COMPANYLESS_INFERRED_ALLOWED.has(inferredTemplate)) {
    return { ok: true, effective: inferredTemplate };
  }
  return { ok: true, effective: "basic" };
}
