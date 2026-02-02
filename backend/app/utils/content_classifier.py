"""
Content classification utilities for company RAG chunks.
"""

from typing import Optional

from app.utils.content_types import CONTENT_TYPES
from app.utils.llm import call_llm_with_error


_URL_KEYWORDS = {
    "new_grad_recruitment": [
        "shinsotsu", "newgrad", "freshers", "graduate", "entry",
        "recruit/new", "saiyo/new", "new-graduate", "2025", "2026", "2027", "2028"
    ],
    "midcareer_recruitment": [
        "career", "midcareer", "mid-career", "experienced", "tenshoku",
        "recruit/career", "saiyo/career", "career-saiyo"
    ],
    "ir_materials": ["ir", "investor", "financial", "annual", "report", "ir-library"],
    "midterm_plan": ["midterm", "medium-term", "plan", "mgt-plan", "strategy"],
    "csr_sustainability": ["sustainability", "csr", "esg", "sdgs"],
    "press_release": ["press", "release", "/news", "/pr", "news-release"],
    "ceo_message": ["message", "ceo", "president", "greeting", "aisatsu", "top-message"],
    "employee_interviews": ["people", "interview", "staff", "talk", "story", "blog", "culture", "workstyle"],
}

_TEXT_KEYWORDS = {
    "new_grad_recruitment": [
        "新卒採用", "新卒向け", "25卒", "26卒", "27卒", "28卒",
        "卒業予定", "エントリー", "選考フロー", "マイページ", "新卒"
    ],
    "midcareer_recruitment": [
        "中途採用", "キャリア採用", "経験者採用", "転職", "即戦力",
        "キャリア", "経験者", "中途"
    ],
    "ir_materials": ["有価証券報告書", "決算短信", "決算説明資料", "統合報告書", "IR資料"],
    "midterm_plan": ["中期経営計画", "中計", "中期ビジョン", "中期計画", "経営方針"],
    "csr_sustainability": ["サステナビリティ", "CSR", "ESG", "SDGs", "環境", "社会", "ガバナンス"],
    "press_release": ["プレスリリース", "ニュースリリース", "報道発表", "お知らせ"],
    "ceo_message": ["社長", "代表", "CEO", "トップメッセージ", "ご挨拶", "社長挨拶", "代表挨拶"],
    "employee_interviews": ["社員", "インタビュー", "働く人", "カルチャー", "職種紹介", "ブログ", "ストーリー"],
}


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
        }
    }
}


def _contains_any(haystack: str, keywords: list[str]) -> bool:
    return any(k in haystack for k in keywords)


def classify_content_category(
    source_url: str,
    heading: Optional[str],
    text: Optional[str],
    source_channel: Optional[str] = None
) -> Optional[str]:
    """Rule-based classification. Returns None if ambiguous or unknown."""
    url = (source_url or "").lower()
    heading_text = heading or ""
    body = text or ""

    matches = set()

    for category, keys in _URL_KEYWORDS.items():
        if _contains_any(url, keys):
            matches.add(category)

    for category, keys in _TEXT_KEYWORDS.items():
        if _contains_any(heading_text, keys) or _contains_any(body, keys):
            matches.add(category)

    if len(matches) == 1:
        return next(iter(matches))

    if len(matches) == 0:
        if source_channel:
            return source_channel
        return None

    # Ambiguous → LLM fallback
    return None


async def classify_content_category_with_llm(
    source_url: str,
    heading: Optional[str],
    text: Optional[str],
    source_channel: Optional[str] = None
) -> Optional[str]:
    """LLM-based classification fallback."""
    system_prompt = """あなたは企業情報ページの分類アシスタントです。
以下のURL/見出し/本文から、最も適切な分類を1つ選んでください。
必ずJSONを1つだけ出力してください。コードブロックや説明文は禁止です。"""

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
            current_user_message += f"\n\n前回のエラー: {retry_reason}\nJSONのみを出力してください。"

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
            parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
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
    fallback_type: Optional[str] = None
) -> list[dict]:
    """Attach content_type to chunks using rule/LLM hybrid classification."""
    cache: dict[str, str] = {}

    for chunk in content_chunks:
        meta = chunk.get("metadata") or {}
        source_url = meta.get("source_url", "")
        heading = meta.get("heading_path") or meta.get("heading")
        text = chunk.get("text") or ""

        category = classify_content_category(source_url, heading, text, source_channel)

        if not category:
            cache_key = source_url or heading or text[:80]
            if cache_key in cache:
                category = cache[cache_key]
            else:
                category = await classify_content_category_with_llm(
                    source_url=source_url,
                    heading=heading,
                    text=text,
                    source_channel=source_channel
                )
                if category:
                    cache[cache_key] = category

        if not category:
            if fallback_type:
                category = fallback_type
            elif source_channel:
                category = source_channel
            else:
                category = "corporate_site"

        meta["content_type"] = category
        if source_channel:
            meta["content_channel"] = source_channel
        chunk["metadata"] = meta

    return content_chunks
