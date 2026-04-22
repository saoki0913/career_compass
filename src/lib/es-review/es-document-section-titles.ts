/**
 * H2 text for ES documents created by product flows.
 * Must stay aligned with keywords in infer-template-type.ts / es_template_classifier.py
 * so review auto-classification matches the intended template.
 */

const GAKUCHIKA_SECTION_PREFIX = "学生時代に力を入れたこと";

/** Topic-only titles (e.g. club name) do not match the classifier; prefix with standard ES wording. */
export function buildGakuchikaEsSectionTitle(topic: string): string {
  const t = topic.trim();
  return t ? `${GAKUCHIKA_SECTION_PREFIX}：${t}` : GAKUCHIKA_SECTION_PREFIX;
}

/** Explicit motivation wording for stable company_motivation classification. */
export function buildCompanyMotivationEsSectionTitle(): string {
  return "志望動機（なぜ当社を志望するのか）";
}
