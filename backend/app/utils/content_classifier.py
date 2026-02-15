"""
Content classification utilities for company RAG chunks.
"""

from typing import Optional

from app.utils.content_types import CONTENT_TYPES
from app.utils.intent_profile import INTENT_PROFILES
from app.utils.llm import call_llm_with_error


CLASSIFY_SCHEMA = {
    "name": "rag_content_classify",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["category"],
        "properties": {
            "category": {
                "type": "string",
                "enum": CONTENT_TYPES,
            }
        },
    },
}


def _normalize_text(value: str) -> str:
    return (value or "").lower()


def _contains_any(haystack: str, keywords: list[str]) -> bool:
    return any((k or "").lower() in haystack for k in keywords)


def _detect_secondary_content_types(
    primary: Optional[str], heading: str, text: str
) -> tuple[Optional[str], list[str]]:
    body = _normalize_text(f"{heading}\n{text}")
    secondary: list[str] = []
    updated_primary = primary

    # 統合報告書 → IR + CSR
    integrated_terms = ["統合報告書", "統合報告", "integrated report"]
    if any(term in body for term in integrated_terms):
        if updated_primary != "ir_materials":
            updated_primary = "ir_materials"
        if "csr_sustainability" not in secondary:
            secondary.append("csr_sustainability")

    # ESG戦略資料 → CSR 主, 中期経営計画 副
    esg_strategy_terms = [
        "esg戦略",
        "esg strategy",
        "サステナビリティ戦略",
        "サステナビリティ方針",
    ]
    if any(term in body for term in esg_strategy_terms):
        if updated_primary != "csr_sustainability":
            updated_primary = "csr_sustainability"
        if "midterm_plan" not in secondary:
            secondary.append("midterm_plan")

    return updated_primary, secondary


def classify_content_category(
    source_url: str,
    heading: Optional[str],
    text: Optional[str],
    source_channel: Optional[str] = None,
) -> tuple[Optional[str], list[str]]:
    """Rule-based classification. Returns (primary, secondary)."""
    url = (source_url or "").lower()
    heading_text = heading or ""
    body = text or ""
    text_blob = _normalize_text(f"{heading_text}\n{body}")

    strong_matches: list[str] = []
    weak_matches: list[str] = []

    for category, profile in INTENT_PROFILES.items():
        # Exclude if explicit exclude terms are present
        if profile.exclude_keywords and _contains_any(text_blob, list(profile.exclude_keywords)):
            continue

        strong_hit = _contains_any(text_blob, list(profile.strong_keywords))
        weak_hit = _contains_any(text_blob, list(profile.weak_keywords))
        url_hit = _contains_any(url, list(profile.url_patterns))

        if strong_hit:
            strong_matches.append(category)
        elif weak_hit or url_hit:
            weak_matches.append(category)

    primary: Optional[str] = None

    if len(strong_matches) == 1:
        primary = strong_matches[0]
    elif len(strong_matches) == 0 and len(weak_matches) == 1:
        primary = weak_matches[0]

    if not primary:
        primary = None

    primary, secondary = _detect_secondary_content_types(primary, heading_text, body)

    return primary, secondary


async def classify_content_category_with_llm(
    source_url: str,
    heading: Optional[str],
    text: Optional[str],
    source_channel: Optional[str] = None,
) -> Optional[str]:
    """LLM-based classification fallback."""
    system_prompt = """あなたは企業情報ページの分類アシスタントです。
以下のURL/見出し/本文から、最も適切な分類を1つ選んでください。
必ずJSONを1つだけ出力してください。コードブロックや説明文は禁止です。

## カテゴリと判断基準
- new_grad_recruitment: 新卒採用ページ（エントリー、選考フロー、募集要項）
- midcareer_recruitment: 中途採用ページ（キャリア採用、経験者採用）
- corporate_site: 企業HP一般（会社概要、事業紹介、拠点情報）
- ir_materials: IR・決算資料（有価証券報告書、決算短信、株主向け）
- ceo_message: 社長/経営者メッセージ（トップメッセージ、ビジョン表明）
- employee_interviews: 社員インタビュー（先輩社員の声、1日のスケジュール）
- press_release: プレスリリース（ニュース、お知らせ、報道発表）
- csr_sustainability: CSR・サステナビリティ（ESG、環境、社会貢献）
- midterm_plan: 中期経営計画（成長戦略、中長期目標）

## 曖昧なケースの優先ルール
- 採用ページ内のインタビュー → employee_interviews
- IR内の中期計画 → midterm_plan
- 社長メッセージ内のビジョン → ceo_message"""

    excerpt = (text or "")[:800]
    user_message = f"""URL: {source_url}
source_channel: {source_channel or ""}
見出し: {heading or ""}
本文抜粋: {excerpt}

出力形式:
{{"category": "..." }}

出力例:
{{"category":"new_grad_recruitment"}}"""

    max_retries = 2
    retry_reason = ""

    for _attempt in range(max_retries + 1):
        current_user_message = user_message
        if retry_reason:
            current_user_message += (
                f"\n\n前回のエラー: {retry_reason}\nJSONのみを出力してください。説明文やコードブロックは禁止です。"
            )

        llm_result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=current_user_message,
            max_tokens=200,
            temperature=0.1,
            feature="rag_classify",
            response_format="json_schema",
            json_schema=CLASSIFY_SCHEMA,
            use_responses_api=True,
            retry_on_parse=True,
            parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。",
        )

        if not llm_result.success or not llm_result.data:
            retry_reason = "JSON解析に失敗しました"
            continue

        category = llm_result.data.get("category")
        if isinstance(category, str) and category in CONTENT_TYPES:
            return category
        retry_reason = "categoryが無効、または指定カテゴリに一致しません"
    return None


async def classify_chunks(
    content_chunks: list[dict],
    source_channel: Optional[str] = None,
    fallback_type: Optional[str] = None,
) -> list[dict]:
    """Attach content_type to chunks using rule/LLM hybrid classification."""
    cache: dict[str, str] = {}

    for chunk in content_chunks:
        meta = chunk.get("metadata") or {}
        source_url = meta.get("source_url", "")
        heading = meta.get("heading_path") or meta.get("heading")
        text = chunk.get("text") or ""

        category, secondary = classify_content_category(source_url, heading, text, source_channel)

        if not category:
            cache_key = source_url or heading or text[:80]
            if cache_key in cache:
                category = cache[cache_key]
            else:
                category = await classify_content_category_with_llm(
                    source_url=source_url,
                    heading=heading,
                    text=text,
                    source_channel=source_channel,
                )
                if category:
                    cache[cache_key] = category
            category, secondary = _detect_secondary_content_types(
                category, heading or "", text
            )

        if not category:
            if fallback_type and fallback_type in CONTENT_TYPES:
                category = fallback_type
            else:
                category = "corporate_site"
            category, secondary = _detect_secondary_content_types(
                category, heading or "", text
            )

        meta["content_type"] = category
        meta["secondary_content_types"] = secondary or []
        if source_channel:
            meta["content_channel"] = source_channel
        chunk["metadata"] = meta

    return content_chunks
