"""
Company Info Fetch Router

Fetches company recruitment information from URLs using web scraping and LLM.
Also handles RAG (Retrieval Augmented Generation) for company information.

SPEC Section 9.5 Requirements:
- Extract minimal set: 締切/募集区分/提出物/応募方法
- Each item needs: 根拠URL + 信頼度(高/中/低)
- Partial success: if deadline not found but other items extracted = 0.5 credit
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import Optional
from datetime import datetime
from urllib.parse import urlparse, urlunparse
import re
import httpx
from bs4 import BeautifulSoup

try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    HAS_DDGS = False
    print("[企業サイト検索] ⚠️ ddgs 未インストール - モック結果を使用")

from app.utils.llm import call_llm_with_error
from app.config import settings
from app.utils.company_names import (
    get_company_domain_patterns,
    is_blog_platform,
    has_personal_site_pattern,
    BLOG_PLATFORMS,
    PERSONAL_SITE_PATTERNS,
)
from app.utils.vector_store import (
    store_company_info,
    search_company_context,
    get_company_context_for_review,
    get_enhanced_context_for_review,
    has_company_rag,
    delete_company_rag,
    store_full_text_content,
    get_company_rag_status,
    delete_company_rag_by_type,
    delete_company_rag_by_urls,
)
from app.utils.embeddings import resolve_embedding_backend
from app.utils.content_types import (
    CONTENT_TYPES_ALL,
    CONTENT_TYPES_NEW,
    LEGACY_CONTENT_TYPES,
    STRUCTURED_CONTENT_TYPE,
)
from app.utils.cache import get_rag_cache

router = APIRouter(prefix="/company-info", tags=["company-info"])


class FetchRequest(BaseModel):
    url: HttpUrl
    graduation_year: Optional[int] = None  # 卒業年度 (e.g., 2027 for 27卒)
    selection_type: Optional[str] = None  # "main_selection" | "internship" | None


class SearchPagesRequest(BaseModel):
    """Request to search for company recruitment pages."""
    company_name: str
    industry: Optional[str] = None
    custom_query: Optional[str] = None  # Custom search query (e.g., "三井物産 IR")
    max_results: int = 10  # Maximum number of results to return
    graduation_year: Optional[int] = None  # 卒業年度 (e.g., 2027 for 27卒)
    selection_type: Optional[str] = None  # "main_selection" | "internship" | None
    allow_snippet_match: bool = False  # If True, also match company name in snippet (less reliable)


class SearchCandidate(BaseModel):
    """A candidate recruitment page URL."""
    url: str
    title: str
    confidence: str  # high, medium, low
    source_type: str = "other"  # official, job_site, other


class ExtractedItem(BaseModel):
    """Base model for extracted items with source and confidence."""
    value: str
    source_url: str  # 根拠URL
    confidence: str  # high, medium, low (高/中/低)


class ExtractedDeadline(BaseModel):
    """Deadline with source and confidence per SPEC Section 9.5."""
    type: str  # es_submission, web_test, interview_1, etc.
    title: str
    due_date: Optional[str]  # ISO format
    source_url: str  # 根拠URL
    confidence: str  # high, medium, low (高/中/低)


class ExtractedRecruitmentType(BaseModel):
    """募集区分 with source and confidence."""
    name: str  # e.g., "夏インターン", "本選考"
    source_url: str
    confidence: str


class ExtractedDocument(BaseModel):
    """提出物 with source and confidence."""
    name: str  # e.g., "履歴書", "ES"
    required: bool
    source_url: str
    confidence: str


class ExtractedInfo(BaseModel):
    """Extracted company recruitment information per SPEC Section 9.5."""
    deadlines: list[ExtractedDeadline]
    recruitment_types: list[ExtractedRecruitmentType]  # 募集区分
    required_documents: list[ExtractedDocument]  # 提出物
    application_method: Optional[ExtractedItem]  # 応募方法
    selection_process: Optional[ExtractedItem]  # 選考プロセス (optional)


class ExtractedScheduleInfo(BaseModel):
    """Extracted selection schedule information (focused scope)."""
    deadlines: list[ExtractedDeadline]
    required_documents: list[ExtractedDocument]  # 提出物
    application_method: Optional[ExtractedItem]  # 応募方法
    selection_process: Optional[ExtractedItem]  # 選考プロセス (optional)


class FetchResponse(BaseModel):
    success: bool
    partial_success: bool = False  # True if deadlines not found but other items extracted
    data: Optional[ExtractedInfo]
    source_url: str
    extracted_at: str
    error: Optional[str]
    # Credit consumption info for caller
    deadlines_found: bool = False
    other_items_found: bool = False
    # NEW: Raw text content for full-text RAG storage
    raw_text: Optional[str] = None
    # NEW: Raw HTML (optional, for better section chunking)
    raw_html: Optional[str] = None


class SelectionScheduleResponse(BaseModel):
    success: bool
    partial_success: bool = False
    data: Optional[ExtractedScheduleInfo]
    source_url: str
    extracted_at: str
    error: Optional[str]
    deadlines_found: bool = False
    other_items_found: bool = False
    raw_text: Optional[str] = None
    raw_html: Optional[str] = None


COMPANY_INFO_SCHEMA = {
    "name": "company_info_extract",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "deadlines",
            "recruitment_types",
            "required_documents",
            "application_method",
            "selection_process",
        ],
        "properties": {
            "deadlines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["type", "title", "due_date", "source_url", "confidence"],
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "es_submission",
                                "web_test",
                                "aptitude_test",
                                "interview_1",
                                "interview_2",
                                "interview_3",
                                "interview_final",
                                "briefing",
                                "internship",
                                "offer_response",
                                "other",
                            ],
                        },
                        "title": {"type": "string"},
                        "due_date": {"type": ["string", "null"]},
                        "source_url": {"type": "string"},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    },
                },
            },
            "recruitment_types": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "source_url", "confidence"],
                    "properties": {
                        "name": {"type": "string"},
                        "source_url": {"type": "string"},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    },
                },
            },
            "required_documents": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "required", "source_url", "confidence"],
                    "properties": {
                        "name": {"type": "string"},
                        "required": {"type": "boolean"},
                        "source_url": {"type": "string"},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    },
                },
            },
            "application_method": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "required": ["value", "source_url", "confidence"],
                "properties": {
                    "value": {"type": "string"},
                    "source_url": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
            "selection_process": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "required": ["value", "source_url", "confidence"],
                "properties": {
                    "value": {"type": "string"},
                    "source_url": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
        },
    },
}

SELECTION_SCHEDULE_SCHEMA = {
    "name": "selection_schedule_extract",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "deadlines",
            "required_documents",
            "application_method",
            "selection_process",
        ],
        "properties": {
            "deadlines": COMPANY_INFO_SCHEMA["schema"]["properties"]["deadlines"],
            "required_documents": COMPANY_INFO_SCHEMA["schema"]["properties"]["required_documents"],
            "application_method": COMPANY_INFO_SCHEMA["schema"]["properties"]["application_method"],
            "selection_process": COMPANY_INFO_SCHEMA["schema"]["properties"]["selection_process"],
        },
    },
}


async def fetch_page_content(url: str) -> str:
    """Fetch page content from URL."""
    try:
        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
        ) as client:
            response = await client.get(str(url))
            response.raise_for_status()
            return response.text
    except httpx.ConnectError as e:
        # DNS resolution or connection failure
        raise HTTPException(
            status_code=400,
            detail=f"URLに接続できませんでした。URLが正しいか確認してください。({str(e)[:100]})"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=400,
            detail="URLの取得がタイムアウトしました。しばらく後にお試しください。"
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400,
            detail=f"URLの取得に失敗しました: {str(e)[:100]}"
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=400,
                detail="指定されたページが見つかりませんでした（404）。別のURLをお試しください。"
            )
        elif e.response.status_code == 403:
            raise HTTPException(
                status_code=400,
                detail="ページへのアクセスが拒否されました（403）。別のURLをお試しください。"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"ページの取得に失敗しました（HTTPエラー: {e.response.status_code}）"
            )


def extract_text_from_html(html: str) -> str:
    """Extract readable text from HTML.

    Note: We only remove script/style tags, keeping nav/header/footer
    as they may contain recruitment information on some sites.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Remove only script and style elements (keep nav/header/footer for recruitment info)
    for script in soup(["script", "style", "noscript", "iframe"]):
        script.decompose()

    # Get text
    text = soup.get_text(separator="\n")

    # Clean up whitespace
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = "\n".join(chunk for chunk in chunks if chunk)

    # Increased limit to 15000 characters (was 10000)
    # This helps capture more content from longer recruitment pages
    return text[:15000]


async def extract_info_with_llm(text: str, url: str) -> ExtractedInfo:
    """
    Extract recruitment information using LLM.

    Per SPEC Section 9.5:
    - Extract minimal set: 締切/募集区分/提出物/応募方法
    - Each item needs: 根拠URL + 信頼度(高/中/低)

    Uses OpenAI via shared LLM utility (feature="company_info").
    """
    # Get current year for date inference
    current_year = datetime.now().year

    system_prompt = f"""あなたは日本の就活情報を抽出する専門アシスタントです。
以下のWebページテキストから、採用に関する情報を抽出してJSONで返してください。

## 重要な指示

1. **日付の推測**: 日付が曖昧でも推測して抽出してください
   - 「6月上旬」→ "{current_year}-06-01"
   - 「7月中旬」→ "{current_year}-07-15"
   - 「8月下旬」→ "{current_year}-08-25"
   - 「随時」「未定」→ null
   - 年が明記されていない場合は{current_year}年または{current_year + 1}年と推測

2. **部分的な情報も抽出**: 締切情報がなくても、他の情報（募集区分、応募方法など）があれば抽出してください

3. **信頼度の判定**:
   - high: 明確に記載されている（日付、具体的な手順など）
   - medium: 推測を含む（曖昧な日付、一般的な記述など）
   - low: 不確実（断片的な情報、古い可能性がある情報など）

## 抽出項目

1. **deadlines**: 締切情報のリスト
   - type: es_submission, web_test, aptitude_test, interview_1, interview_2, interview_3, interview_final, briefing, internship, offer_response, other
   - title: 締切のタイトル（例: "ES提出 (一次締切)"）
   - due_date: ISO形式の日付（YYYY-MM-DD）または null
   - source_url: "{url}"
   - confidence: high, medium, low

2. **recruitment_types**: 募集区分のリスト
   - name: 募集区分の名前（例: "夏インターン", "本選考", "早期選考"）
   - source_url: "{url}"
   - confidence: high, medium, low

3. **required_documents**: 必要書類のリスト
   - name: 書類名（例: "履歴書", "ES", "成績証明書"）
   - required: 必須かどうか（true/false）
   - source_url: "{url}"
   - confidence: high, medium, low

4. **application_method**: 応募方法（見つからない場合はnull）
   - value: 応募方法の説明（例: "マイページから応募"、"WEBエントリー"）
   - source_url: "{url}"
   - confidence: high, medium, low

5. **selection_process**: 選考プロセス（見つからない場合はnull）
   - value: 選考プロセスの説明（例: "ES→Webテスト→面接3回→最終面接"）
   - source_url: "{url}"
   - confidence: high, medium, low

## 出力形式

必ず以下の形式の有効なJSONを返してください:
{{
  "deadlines": [...],
  "recruitment_types": [...],
  "required_documents": [...],
  "application_method": {{...}} または null,
  "selection_process": {{...}} または null
}}"""

    user_message = f"以下のWebページテキストから採用情報を抽出してください:\n\n{text}"

    # feature="company_info" → OpenAI (Responses API + Structured Outputs)
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=2000,
        temperature=0.1,
        feature="company_info",
        response_format="json_schema",
        json_schema=COMPANY_INFO_SCHEMA,
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
    )

    if not llm_result.success:
        # Raise HTTPException with detailed error
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "企業情報の抽出中にエラーが発生しました。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            }
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": "Empty response from LLM"
            }
        )

    # Parse LLM response
    try:
        # Parse deadlines
        deadlines = []
        for d in data.get("deadlines", []):
            deadlines.append(ExtractedDeadline(
                type=d.get("type", "other"),
                title=d.get("title", ""),
                due_date=d.get("due_date"),
                source_url=d.get("source_url", url),
                confidence=d.get("confidence", "low")
            ))

        # Parse recruitment types
        recruitment_types = []
        for rt in data.get("recruitment_types", []):
            recruitment_types.append(ExtractedRecruitmentType(
                name=rt.get("name", ""),
                source_url=rt.get("source_url", url),
                confidence=rt.get("confidence", "low")
            ))

        # Parse required documents
        required_documents = []
        for doc in data.get("required_documents", []):
            required_documents.append(ExtractedDocument(
                name=doc.get("name", ""),
                required=doc.get("required", False),
                source_url=doc.get("source_url", url),
                confidence=doc.get("confidence", "low")
            ))

        # Parse application method
        application_method = None
        am_data = data.get("application_method")
        if am_data:
            application_method = ExtractedItem(
                value=am_data.get("value", ""),
                source_url=am_data.get("source_url", url),
                confidence=am_data.get("confidence", "low")
            )

        # Parse selection process
        selection_process = None
        sp_data = data.get("selection_process")
        if sp_data:
            selection_process = ExtractedItem(
                value=sp_data.get("value", ""),
                source_url=sp_data.get("source_url", url),
                confidence=sp_data.get("confidence", "low")
            )

        return ExtractedInfo(
            deadlines=deadlines,
            recruitment_types=recruitment_types,
            required_documents=required_documents,
            application_method=application_method,
            selection_process=selection_process
        )
    except Exception as e:
        print(f"[企業情報抽出] ❌ LLM応答解析失敗: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": str(e)
            }
        )


async def extract_schedule_with_llm(
    text: str,
    url: str,
    feature: str = "selection_schedule",
    graduation_year: int | None = None,
    selection_type: str | None = None
) -> ExtractedScheduleInfo:
    """
    Extract selection schedule information using LLM.

    Focused scope (no recruitment_types) for schedule-specific endpoint.

    Args:
        text: Page text content to extract from
        url: Source URL for reference
        feature: Feature name for LLM call tracking
        graduation_year: Target graduation year (e.g., 2027 for 27卒)
        selection_type: "main_selection" | "internship" | None
    """
    # Use provided graduation_year or calculate default
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100  # e.g., 27 for 2027
    start_year = grad_year - 2  # e.g., 2025 for 27卒
    end_year = grad_year - 1    # e.g., 2026 for 27卒

    # Build year inference rules based on selection type
    if selection_type == "main_selection":
        year_rules = f"""
### 本選考の年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年
- **7月〜12月の締切** → {start_year}年

例:
- 「4月30日締切」→ "{end_year}-04-30"
- 「10月15日締切」→ "{start_year}-10-15"
"""
    elif selection_type == "internship":
        year_rules = f"""
### インターンの年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜3月の締切** → {end_year}年
- **4月〜12月の締切** → {start_year}年

例:
- 「6月30日締切」→ "{start_year}-06-30"（サマーインターン）
- 「2月15日締切」→ "{end_year}-02-15"（冬インターン）
"""
    else:
        year_rules = f"""
### 年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年（本選考の可能性が高い）
- **7月〜12月の締切** → {start_year}年（インターン/早期選考の可能性が高い）

例:
- 「4月30日締切」→ "{end_year}-04-30"
- 「8月15日締切」→ "{start_year}-08-15"
"""

    selection_type_label = "本選考" if selection_type == "main_selection" else "インターン" if selection_type == "internship" else "選考"

    system_prompt = f"""あなたは日本の就活情報を抽出する専門アシスタントです。
対象: **{grad_year_short}卒** の就活生向けの **{selection_type_label}** 情報
有効な締切範囲: **{start_year}年4月 〜 {end_year}年6月**

以下のWebページテキストから、選考スケジュールに関する情報を抽出してJSONで返してください。

## 重要な指示

### 1. 日付の推測
日付が曖昧でも推測して抽出してください:
- 「6月上旬」→ 適切な年-06-01
- 「7月中旬」→ 適切な年-07-15
- 「8月下旬」→ 適切な年-08-25
- 「随時」「未定」→ null

{year_rules}

### 2. 部分的な情報も抽出
締切情報がなくても、他の情報（応募方法、提出物、選考プロセス）があれば抽出してください。

### 3. 信頼度の判定
- **high**: 明確に記載されている（日付、具体的な手順など）
- **medium**: 推測を含む（曖昧な日付、一般的な記述など）
- **low**: 不確実（断片的な情報、古い可能性がある情報など）

## 抽出項目

1. **deadlines**: 締切情報のリスト
   - type: es_submission, web_test, aptitude_test, interview_1, interview_2, interview_3, interview_final, briefing, internship, offer_response, other
   - title: 締切のタイトル（例: "ES提出 (一次締切)"）
   - due_date: ISO形式の日付（YYYY-MM-DD）または null
   - source_url: "{url}"
   - confidence: high, medium, low

2. **required_documents**: 必要書類のリスト
   - name: 書類名（例: "履歴書", "ES", "成績証明書"）
   - required: 必須かどうか（true/false）
   - source_url: "{url}"
   - confidence: high, medium, low

3. **application_method**: 応募方法（見つからない場合はnull）
   - value: 応募方法の説明（例: "マイページから応募"、"WEBエントリー"）
   - source_url: "{url}"
   - confidence: high, medium, low

4. **selection_process**: 選考プロセス（見つからない場合はnull）
   - value: 選考プロセスの説明（例: "ES→Webテスト→面接3回→最終面接"）
   - source_url: "{url}"
   - confidence: high, medium, low

## 出力形式

必ず以下の形式の有効なJSONを返してください:
{{
  "deadlines": [...],
  "required_documents": [...],
  "application_method": {{...}} または null,
  "selection_process": {{...}} または null
}}"""

    user_message = f"以下のWebページテキストから{selection_type_label}情報を抽出してください:\n\n{text}"

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=2000,
        temperature=0.1,
        feature=feature,
    )

    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "選考スケジュール抽出中にエラーが発生しました。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            }
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": "Empty response from LLM"
            }
        )

    try:
        deadlines = []
        raw_deadlines = data.get("deadlines") if isinstance(data, dict) else []
        if not isinstance(raw_deadlines, list):
            raw_deadlines = []
        for d in raw_deadlines:
            deadlines.append(ExtractedDeadline(
                type=d.get("type", "other"),
                title=d.get("title", ""),
                due_date=d.get("due_date"),
                source_url=d.get("source_url", url),
                confidence=d.get("confidence", "low")
            ))

        required_documents = []
        raw_docs = data.get("required_documents") if isinstance(data, dict) else []
        if not isinstance(raw_docs, list):
            raw_docs = []
        for doc in raw_docs:
            required_documents.append(ExtractedDocument(
                name=doc.get("name", ""),
                required=doc.get("required", True),
                source_url=doc.get("source_url", url),
                confidence=doc.get("confidence", "low")
            ))

        am_data = data.get("application_method") if isinstance(data, dict) else None
        application_method = None
        if isinstance(am_data, dict):
            application_method = ExtractedItem(
                value=am_data.get("value", ""),
                source_url=am_data.get("source_url", url),
                confidence=am_data.get("confidence", "low")
            )

        sp_data = data.get("selection_process") if isinstance(data, dict) else None
        selection_process = None
        if isinstance(sp_data, dict):
            selection_process = ExtractedItem(
                value=sp_data.get("value", ""),
                source_url=sp_data.get("source_url", url),
                confidence=sp_data.get("confidence", "low")
            )

        return ExtractedScheduleInfo(
            deadlines=deadlines,
            required_documents=required_documents,
            application_method=application_method,
            selection_process=selection_process
        )
    except Exception as e:
        print(f"[選考スケジュール抽出] ❌ LLM応答解析失敗: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": str(e)
            }
        )


def _classify_url_confidence(url: str, title: str, company_name: str = "") -> str:
    """Backward-compatible wrapper for recruitment URL confidence."""
    score = _score_recruit_candidate(url, title, "", company_name, "")
    if score is None:
        return "low"
    source_type = _get_source_type(url, company_name) if company_name else "other"
    return _score_to_confidence(score, source_type)


EXCLUDE_SITES_STRONG = [
    "openwork", "vorkers", "wikipedia", "youtube", "twitter", "x.com",
    "instagram", "facebook", "tiktok", "note.com", "blog", "blogspot",
    "nikkei", "toyokeizai", "diamond.jp", "news.yahoo", "livedoor",
    "prtimes", "pressrelease", "press-release"
]

# Keywords that typically indicate a subsidiary company
SUBSIDIARY_KEYWORDS = [
    # Japanese
    "サプライチェーン", "ソリューション", "ソリューションズ",
    "ロジスティクス", "流通", "ビジネスパートナーズ",
    "グローバル", "インターナショナル", "ジャパン",
    "テクノロジー", "テクノロジーズ", "システム", "システムズ",
    "サービス", "サービシーズ", "エンジニアリング",
    "マネジメント", "コンサルティング", "ファイナンス",
    "リテール", "トレーディング", "プロパティ", "アセット",
    "ケミカル", "マテリアル", "マーケティング", "プランニング",
    # Industry-specific Japanese
    "プラスチック", "プラスチックス", "メタル", "メタルズ",
    "スチール", "ペトロ", "ケミカルズ", "フーズ", "フード",
    "不動産", "リアルティ", "ファシリティ", "ファシリティーズ",
    "デベロップメント", "インシュアランス", "セキュリティ",
    "オートモーティブ", "エレクトロニクス", "エナジー",
    # English suffixes
    "supply chain", "solutions", "logistics", "global",
    "international", "technology", "systems", "services",
    "engineering", "management", "consulting", "finance",
    "retail", "trading", "property", "asset", "chemical",
    "material", "marketing", "planning",
    # Industry-specific English
    "plastics", "metal", "metals", "steel", "petro", "foods",
    "realty", "facility", "facilities", "development", "insurance", "security",
    "automotive", "electronics", "energy",
]

# Known job/recruitment aggregator sites
JOB_SITES = [
    "mynavi.jp", "rikunabi.com", "onecareer.jp", "unistyle.jp",
    "nikki.ne.jp", "goodfind.jp", "offerbox.jp", "labbase.jp",
    "gaishishukatsu.com", "type.jp", "en-japan.com", "doda.jp",
    "syukatsu-kaigi.jp", "career-tasu", "job.mynavi.jp", "job.rikunabi.com",
]

# Completely irrelevant sites that should always be filtered out
IRRELEVANT_SITES = [
    # Shopping/EC sites
    "shopping-park", "rakuten.co.jp", "amazon", "yahoo-shopping",
    # Document sharing/PDF viewers
    "fliphtml5", "scribd", "slideshare", "issuu", "docplayer",
    # Social media (additional)
    "linkedin.com",
    # Blogs/Personal sites
    "socialen.net", "hatena", "ameba", "qiita", "zenn.dev",
    # Non-Japanese organizations
    "igad.int", ".gov", ".edu",
    # XML feeds/APIs
    "/api/", ".xml", "/feed/", "/rss",
    # Other irrelevant
    "mitsui-fudosan", "mitsui-shopping",  # Real estate/shopping (not recruitment)
]

AGGREGATOR_SITES = [
    "mynavi.jp", "rikunabi.com", "onecareer.jp", "unistyle.jp",
    "syukatsu-kaigi.jp", "gaishishukatsu.com", "career-tasu",
    "goodfind", "job.mynavi.jp", "job.rikunabi.com", "en-japan.com",
    "doda.jp", "type.jp"
]

RECRUIT_URL_KEYWORDS = [
    "recruit", "saiyo", "entry", "career", "graduate", "fresh", "newgrads",
    "intern", "internship", "shinsotsu", "mypage"
]

RECRUIT_TITLE_KEYWORDS = [
    "採用", "新卒", "エントリー", "募集", "選考", "インターン",
    "マイページ", "採用情報", "新卒採用"
]

CORP_KEYWORDS = {
    "ir": {
        "url": ["ir", "investor", "financial", "stock", "shareholder", "kessan"],
        "title": ["IR", "投資家", "株主", "決算", "有価証券", "統合報告", "財務"],
        "snippet": ["IR", "投資家", "株主", "決算", "有価証券", "統合報告", "財務"],
    },
    "business": {
        "url": ["business", "service", "product", "solution", "service", "jigyo"],
        "title": ["事業", "事業内容", "事業紹介", "製品", "サービス", "ソリューション"],
        "snippet": ["事業", "事業内容", "製品", "サービス", "ソリューション"],
    },
    "about": {
        "url": ["company", "about", "corporate", "profile", "overview"],
        "title": ["会社概要", "企業情報", "会社案内", "沿革", "拠点", "組織"],
        "snippet": ["会社概要", "企業情報", "会社案内", "沿革", "拠点", "組織"],
    },
}

IR_DOC_KEYWORDS = [
    "有価証券報告書", "有報", "統合報告書", "統合報告", "アニュアルレポート",
    "annual report", "securities report", "security report", "yuho",
    "決算説明資料", "決算短信"
]

CORP_SEARCH_MIN_SCORE = 3.5
CORP_STRICT_MIN_RESULTS = 3


def _normalize_company_name(name: str) -> tuple[str, str]:
    """Return (normalized, ascii_only) company name tokens."""
    cleaned = name or ""
    suffixes = [
        "株式会社", "（株）", "(株)", "㈱", "有限会社", "合同会社",
        "Inc.", "Inc", "Ltd", "Co.,Ltd", "Co., Ltd", "Corporation",
        "Holdings", "ホールディングス"
    ]
    for suffix in suffixes:
        cleaned = cleaned.replace(suffix, "")
    cleaned = cleaned.strip()
    normalized = re.sub(r"\s+", "", cleaned)
    ascii_only = re.sub(r"[^0-9a-zA-Z]", "", normalized).lower()
    return normalized, ascii_only


def _normalize_text_for_match(text: str) -> str:
    """Normalize text for company name matching (remove spaces and punctuation)."""
    if not text:
        return ""
    normalized = text.lower()
    normalized = re.sub(r"[\s　]+", "", normalized)
    normalized = re.sub(r"[・･\-‐‑–—―/()\\[\\]{}<>\"'`~!@#$%^&*_=+.,:;?｜|]", "", normalized)
    return normalized


def _is_valid_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _company_name_matches(title: str, snippet: str, domain: str, company_name: str) -> bool:
    normalized_name, ascii_name = _normalize_company_name(company_name)
    if not normalized_name and not ascii_name:
        return False
    normalized_name = normalized_name.lower()
    norm_title = _normalize_text_for_match(title)
    norm_snippet = _normalize_text_for_match(snippet)
    if normalized_name and (normalized_name in norm_title or normalized_name in norm_snippet):
        return True
    if ascii_name and ascii_name in (domain or ""):
        return True
    return False


def _normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
    except Exception:
        return url


def _domain_from_url(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def _score_to_confidence(score: float, source_type: str = "other") -> str:
    """
    Convert score to confidence level.

    公式サイトは閾値を緩和（ドメインが信頼できるため）。
    ブログは閾値を厳格化。

    Args:
        score: スコア値
        source_type: "official" | "job_site" | "blog" | "other"

    Returns:
        "high" | "medium" | "low"
    """
    if source_type == "official":
        # Official sites get confidence boost
        if score >= 6:
            return "high"
        if score >= 3:
            return "medium"
        return "low"
    elif source_type == "blog":
        # Blogs need higher score for confidence
        if score >= 10:
            return "high"
        if score >= 6:
            return "medium"
        return "low"
    else:
        # Default thresholds
        if score >= 7:
            return "high"
        if score >= 4:
            return "medium"
        return "low"


def _is_excluded_url(url: str) -> bool:
    url_lower = url.lower()
    return any(site in url_lower for site in EXCLUDE_SITES_STRONG)


def _is_irrelevant_url(url: str) -> bool:
    """Filter out completely irrelevant URLs like shopping sites, PDF viewers, etc."""
    url_lower = url.lower()
    return any(pattern in url_lower for pattern in IRRELEVANT_SITES)


def _is_subsidiary(company_name: str, title: str, url: str) -> bool:
    """
    Detect if a search result is for a subsidiary company.

    Returns True if the title or URL contains the parent company name
    along with subsidiary-indicating keywords.
    """
    title_lower = (title or "").lower()
    url_lower = (url or "").lower()

    # Get normalized parent company name
    normalized_name, _ = _normalize_company_name(company_name)
    if not normalized_name:
        return False

    normalized_name_lower = normalized_name.lower()

    # Check if title/URL contains parent company name
    has_parent_name = (
        normalized_name_lower in title_lower or
        normalized_name_lower in url_lower
    )

    if not has_parent_name:
        return False

    # Check for subsidiary keywords in title or URL
    for keyword in SUBSIDIARY_KEYWORDS:
        keyword_lower = keyword.lower()
        if keyword_lower in title_lower or keyword_lower in url_lower:
            return True

    return False


def _get_blog_penalty(url: str, domain: str, company_name: str) -> float:
    """
    Calculate penalty score for blog/personal sites.

    企業公式ブログ（note.com/company_nameなど）は軽減ペナルティ。
    個人ブログは強いペナルティ。

    Args:
        url: 完全なURL
        domain: ドメイン名
        company_name: 企業名

    Returns:
        ペナルティスコア（負の値）。0.0 = ブログではない
    """
    domain_lower = domain.lower()
    url_lower = url.lower()

    # Check if it's a blog platform
    if is_blog_platform(domain_lower):
        # Check if company name is in URL path (likely official blog)
        _, ascii_name = _normalize_company_name(company_name)
        patterns = get_company_domain_patterns(company_name, ascii_name)

        url_path = urlparse(url).path.lower()
        for pattern in patterns:
            if len(pattern) >= 3 and pattern in url_path:
                return -1.0  # 公式ブログの可能性 → 軽減ペナルティ

        return -5.0  # 個人ブログ → フルペナルティ

    # Check for personal site patterns (not blog platforms)
    if has_personal_site_pattern(url_lower, domain_lower):
        # Additional check: if domain is very short and personal-looking
        domain_base = domain_lower.split('.')[0]
        if len(domain_base) <= 10:
            return -3.0  # 個人サイトパターン → 中程度ペナルティ

    return 0.0  # ブログ/個人サイトではない


def _get_source_type(url: str, company_name: str) -> str:
    """
    Classify the source type of a URL.

    ドメインパターンマッチングを使用して公式サイトを検出。
    企業マッピング（backend/data/company_mappings.json）を活用。

    Returns: "official" | "job_site" | "blog" | "other"
    """
    domain = _domain_from_url(url).lower()
    url_lower = url.lower()

    # 1. Check if it's a known job site
    for site in JOB_SITES:
        if site in domain:
            return "job_site"

    # 2. Check if it's a blog/personal site
    blog_penalty = _get_blog_penalty(url, domain, company_name)
    if blog_penalty <= -3.0:
        return "blog"

    # 3. Check if it's the company's official site using domain patterns
    _, ascii_name = _normalize_company_name(company_name)
    domain_patterns = get_company_domain_patterns(company_name, ascii_name)

    for pattern in domain_patterns:
        if len(pattern) >= 3 and pattern in domain:
            return "official"

    # 4. Additional check: recruitment subdomain with partial name match
    recruit_subdomains = ["career.", "recruit.", "saiyo.", "jobs.", "entry."]
    if any(sub in domain for sub in recruit_subdomains):
        # Remove subdomain and check if remaining part matches any pattern
        for sub in recruit_subdomains:
            if sub in domain:
                base_domain = domain.replace(sub, "")
                for pattern in domain_patterns:
                    if len(pattern) >= 3 and pattern in base_domain:
                        return "official"

    # 5. Legacy: short name check (fallback)
    if ascii_name and len(ascii_name) >= 6:
        short_name = ascii_name[:len(ascii_name)//2]
        if len(short_name) >= 3 and short_name in domain:
            recruit_keywords = ["career", "recruit", "saiyo", "jobs", "entry", "newgrad", "shinsotsu"]
            if any(kw in domain or kw in url_lower for kw in recruit_keywords):
                return "official"

    return "other"


def _contains_company_name(
    company_name: str,
    title: str,
    url: str,
    snippet: str = "",
    allow_snippet_match: bool = False
) -> bool:
    """
    Check if the search result actually contains the target company name.

    This filters out results that appear due to industry keyword matches
    but are for completely different companies (e.g., filtering out "日新火災海上保険"
    when searching for "東京海上日動火災保険").

    By default, only checks title and URL (not snippet) because DuckDuckGo often
    includes the search query in snippets of unrelated pages.

    Args:
        company_name: Target company name to search for
        title: Page title from search result
        url: Page URL from search result
        snippet: Page snippet/description from search result
        allow_snippet_match: If True, also check snippet (less reliable)

    Returns True if title or URL contains the company name or its distinctive prefix.
    """
    normalized_name, ascii_name = _normalize_company_name(company_name)

    if not normalized_name and not ascii_name:
        return True  # Can't verify, allow by default

    title_lower = (title or "").lower()
    url_lower = (url or "").lower()

    # Build list of prefixes to check (longer = more reliable)
    prefixes = []
    if normalized_name and len(normalized_name) >= 4:
        prefixes = [
            normalized_name[:min(8, len(normalized_name))].lower(),
            normalized_name[:min(6, len(normalized_name))].lower(),
            normalized_name[:4].lower(),
        ]

    # Level 1: Title match (most reliable)
    if normalized_name:
        name_lower = normalized_name.lower()
        if name_lower in title_lower:
            return True

    for prefix in prefixes:
        if prefix in title_lower:
            return True

    # Level 2: URL/domain match (reliable)
    for prefix in prefixes:
        if prefix in url_lower:
            return True

    if ascii_name and len(ascii_name) >= 4:
        # Check full ASCII name
        if ascii_name in url_lower:
            return True
        # Check significant prefix (at least 4 chars or half the name)
        prefix_len = max(4, len(ascii_name) // 2)
        prefix = ascii_name[:prefix_len]
        if prefix in url_lower:
            return True

    # Level 3: Snippet match (least reliable - only if explicitly allowed)
    # DuckDuckGo snippets often contain search query in unrelated pages
    if allow_snippet_match and snippet:
        snippet_lower = snippet.lower()
        if normalized_name and normalized_name.lower() in snippet_lower:
            return True
        for prefix in prefixes:
            if prefix in snippet_lower:
                return True

    return False


def _score_recruit_candidate(
    url: str,
    title: str,
    snippet: str,
    company_name: str,
    industry: str
) -> float | None:
    """
    Score a recruitment page candidate.

    改善版スコアリング:
    - ドメインパターンマッチング（企業マッピング活用）
    - ブログ/個人サイトペナルティ
    - TLD品質スコア

    スコア配分:
    +4.0  企業ドメインパターン一致
    +3.0  採用サブドメイン（career., recruit.）
    +3.0  企業名タイトル一致
    +3.0  採用URLキーワード
    +2.0  企業名スニペット一致
    +2.0  採用タイトルキーワード
    +2.0  .co.jp TLD
    +1.0  その他有効TLD
    +1.0  卒業年度
    +1.0  マイページ
    +0.5  業界名一致
    -5.0  個人ブログ
    -3.0  アグリゲーター
    """
    if _is_excluded_url(url):
        return None

    url_lower = url.lower()
    title_lower = (title or "").lower()
    snippet_lower = (snippet or "").lower()
    domain = _domain_from_url(url)
    path = urlparse(url).path.lower()

    normalized_name, ascii_name = _normalize_company_name(company_name)
    domain_patterns = get_company_domain_patterns(company_name, ascii_name)

    score = 0.0

    # --- Company Name Match ---
    if normalized_name and normalized_name in title:
        score += 3.0
    if normalized_name and normalized_name in snippet:
        score += 2.0

    # --- Domain Pattern Match (improved) ---
    domain_matched = False
    for pattern in domain_patterns:
        if len(pattern) >= 3 and pattern in domain:
            score += 4.0  # Increased from 3.0
            domain_matched = True
            break

    # Legacy fallback for ASCII name
    if not domain_matched and ascii_name and ascii_name in domain:
        score += 3.0

    # --- Recruitment Subdomain (increased) ---
    if any(sub in domain for sub in ["recruit.", "saiyo.", "entry.", "career."]):
        score += 3.0  # Increased from 2.0

    # --- Recruitment URL Keywords ---
    if any(kw in path for kw in RECRUIT_URL_KEYWORDS):
        score += 3.0

    # --- Recruitment Title Keywords ---
    if any(kw in title_lower for kw in RECRUIT_TITLE_KEYWORDS):
        score += 2.0

    if any(kw in snippet_lower for kw in RECRUIT_TITLE_KEYWORDS):
        score += 1.0

    # --- Graduation Year ---
    grad_year = str(_get_graduation_year())
    if grad_year in url or grad_year in title or grad_year in snippet:
        score += 1.0

    # --- TLD Quality Score (improved) ---
    if domain.endswith(".co.jp"):
        score += 2.0  # Japanese corporate - higher trust
    elif domain.endswith(".jp"):
        score += 1.5
    elif domain.endswith(".com"):
        score += 1.0
    elif domain.endswith(".net"):
        score += 0.5
    elif any(domain.endswith(bad) for bad in [".xyz", ".info", ".biz"]):
        score -= 1.0  # Low quality TLDs

    # --- Industry Match ---
    if industry and industry.lower() in snippet_lower:
        score += 0.5

    # --- Aggregator Penalty ---
    if any(site in domain for site in AGGREGATOR_SITES):
        score -= 3.0

    # --- Blog/Personal Site Penalty (NEW) ---
    blog_penalty = _get_blog_penalty(url, domain, company_name)
    score += blog_penalty

    # --- MyPage Bonus ---
    if "mypage" in url_lower:
        score += 1.0

    return score


def _validate_and_correct_due_date(
    due_date_str: str,
    graduation_year: int,
    selection_type: str | None,
    month: int | None = None
) -> dict:
    """
    Validate and correct due date based on graduation year and selection type.

    Year inference rules (for graduation_year=2027 as example):

    本選考 (main_selection):
    - 1-6月 → graduation_year - 1 (2026年)
    - 7-12月 → graduation_year - 2 (2025年)

    インターン (internship):
    - 4-12月 → graduation_year - 2 (2025年)
    - 1-3月 → graduation_year - 1 (2026年)

    Valid date range: graduation_year - 2 年4月 〜 graduation_year - 1 年6月

    Args:
        due_date_str: ISO format date string (YYYY-MM-DD)
        graduation_year: Target graduation year (e.g., 2027 for 27卒)
        selection_type: "main_selection" | "internship" | None
        month: Optional month override (if date parsing fails)

    Returns:
        dict with keys:
        - is_valid: bool
        - corrected_date: str or None (ISO format if corrected)
        - original_date: str (original input)
        - confidence_adjustment: "unchanged" | "lowered"
        - reason: str (explanation in Japanese)
    """
    result = {
        "is_valid": False,
        "corrected_date": None,
        "original_date": due_date_str,
        "confidence_adjustment": "unchanged",
        "reason": ""
    }

    if not due_date_str:
        result["reason"] = "日付が指定されていません"
        return result

    # Parse the date
    try:
        due_date = datetime.strptime(due_date_str, "%Y-%m-%d")
        parsed_year = due_date.year
        parsed_month = due_date.month
        parsed_day = due_date.day
    except ValueError:
        result["reason"] = f"無効な日付形式: {due_date_str}"
        return result

    # Calculate valid date range
    start_year = graduation_year - 2  # e.g., 2025 for 27卒
    end_year = graduation_year - 1    # e.g., 2026 for 27卒

    valid_start = datetime(start_year, 4, 1)   # April of graduation_year - 2
    valid_end = datetime(end_year, 6, 30)      # June of graduation_year - 1

    # Check if date is within valid range
    if valid_start <= due_date <= valid_end:
        result["is_valid"] = True
        result["reason"] = "日付は有効範囲内です"
        return result

    # Date is outside valid range - try to correct the year
    inferred_year = None

    if selection_type == "main_selection":
        # 本選考: 1-6月 → end_year (26年), 7-12月 → start_year (25年)
        if 1 <= parsed_month <= 6:
            inferred_year = end_year
        else:  # 7-12月
            inferred_year = start_year
    elif selection_type == "internship":
        # インターン: 4-12月 → start_year (25年), 1-3月 → end_year (26年)
        if 1 <= parsed_month <= 3:
            inferred_year = end_year
        else:  # 4-12月
            inferred_year = start_year
    else:
        # Selection type unknown - use heuristics
        # Generally: later months (7-12) are start_year, earlier months (1-6) are end_year
        if 1 <= parsed_month <= 6:
            inferred_year = end_year
        else:
            inferred_year = start_year

    # Validate the corrected date
    try:
        corrected_date = datetime(inferred_year, parsed_month, parsed_day)

        if valid_start <= corrected_date <= valid_end:
            result["is_valid"] = True
            result["corrected_date"] = corrected_date.strftime("%Y-%m-%d")
            result["confidence_adjustment"] = "lowered"
            result["reason"] = f"年を{parsed_year}年から{inferred_year}年に修正しました（{graduation_year}卒、{'本選考' if selection_type == 'main_selection' else 'インターン' if selection_type == 'internship' else '選考タイプ不明'}）"
            return result
        else:
            result["reason"] = f"日付 {due_date_str} は{graduation_year}卒の有効範囲（{start_year}年4月〜{end_year}年6月）外です"
            return result
    except ValueError:
        result["reason"] = f"日付修正に失敗しました: {inferred_year}-{parsed_month:02d}-{parsed_day:02d}"
        return result


def _infer_year_for_month(
    month: int,
    graduation_year: int,
    selection_type: str | None
) -> int:
    """
    Infer the year for a given month based on graduation year and selection type.

    Args:
        month: Month (1-12)
        graduation_year: Target graduation year
        selection_type: "main_selection" | "internship" | None

    Returns:
        Inferred year
    """
    start_year = graduation_year - 2
    end_year = graduation_year - 1

    if selection_type == "main_selection":
        # 本選考: 1-6月 → end_year, 7-12月 → start_year
        return end_year if 1 <= month <= 6 else start_year
    elif selection_type == "internship":
        # インターン: 4-12月 → start_year, 1-3月 → end_year
        return end_year if 1 <= month <= 3 else start_year
    else:
        # Default: same as main_selection
        return end_year if 1 <= month <= 6 else start_year


def _score_corporate_candidate(
    url: str,
    title: str,
    snippet: str,
    company_name: str,
    search_type: str,
    preferred_domain: str | None = None,
    strict_company_match: bool = False,
    allow_aggregators: bool = True
) -> float | None:
    if _is_excluded_url(url):
        return None
    if not _is_valid_http_url(url):
        return None

    url_lower = url.lower()
    title_lower = (title or "").lower()
    snippet_lower = (snippet or "").lower()
    domain = _domain_from_url(url)
    path = urlparse(url).path.lower()
    is_aggregator = any(site in domain for site in AGGREGATOR_SITES)
    if is_aggregator and not allow_aggregators:
        return None

    normalized_name, ascii_name = _normalize_company_name(company_name)
    normalized_title = _normalize_text_for_match(title)
    normalized_snippet = _normalize_text_for_match(snippet)
    company_match = _company_name_matches(title, snippet, domain, company_name)
    preferred_domain_match = False
    if preferred_domain:
        preferred_domain_match = domain == preferred_domain or domain.endswith(f".{preferred_domain}")
    if strict_company_match and not (company_match or preferred_domain_match):
        return None
    score = 0.0

    normalized_name = normalized_name.lower()
    if normalized_name and normalized_name in normalized_title:
        score += 3.0
    if normalized_name and normalized_name in normalized_snippet:
        score += 2.0
    if ascii_name and ascii_name in domain:
        score += 3.0
    if not company_match and not preferred_domain_match:
        score -= 4.0

    if domain.endswith((".co.jp", ".jp", ".com", ".net")):
        score += 1.0

    keywords = CORP_KEYWORDS.get(search_type, {})
    for kw in keywords.get("url", []):
        if kw in path or kw in url_lower:
            score += 2.0
            break
    for kw in keywords.get("title", []):
        if kw.lower() in title_lower or kw in title:
            score += 2.0
            break
    for kw in keywords.get("snippet", []):
        if kw.lower() in snippet_lower or kw in snippet:
            score += 1.0
            break

    if preferred_domain:
        if domain == preferred_domain or domain.endswith(f".{preferred_domain}"):
            score += 3.0
        else:
            score -= 1.0

    if search_type == "ir" and url_lower.endswith(".pdf"):
        score += 1.5

    if search_type == "ir":
        for kw in IR_DOC_KEYWORDS:
            kw_lower = kw.lower()
            if kw_lower in title_lower or kw_lower in snippet_lower or kw_lower in url_lower:
                score += 2.5
                break

    if is_aggregator:
        score -= 2.0

    return score


async def _search_with_ddgs(query: str, max_results: int = 10) -> list[dict]:
    """
    Search using DuckDuckGo.

    Args:
        query: Search query string
        max_results: Maximum number of results

    Returns:
        List of search results with url, title, body
    """
    if not HAS_DDGS:
        return []

    try:
        with DDGS() as ddgs:
            # Don't specify region - let query language guide results
            # The jp-jp region doesn't work well with DuckDuckGo
            results = list(ddgs.text(
                query,
                safesearch="moderate",
                max_results=max_results
            ))
            return results
    except Exception as e:
        print(f"[企業サイト検索] ❌ DuckDuckGo 検索エラー: {e}")
        return []


def _get_graduation_year() -> int:
    """Calculate the current graduation year for job hunting.

    In Japan, job hunting starts around April for students graduating next year.
    """
    now = datetime.now()
    # If it's April or later, target next year's graduates
    # If it's before April, target current year's graduates
    if now.month >= 4:
        return now.year + 2  # 2026卒 if current year is 2024 and month >= 4
    else:
        return now.year + 1


def _build_recruit_queries(
    company_name: str,
    industry: str | None,
    custom_query: str | None,
    graduation_year: int | None = None,
    selection_type: str | None = None
) -> list[str]:
    """
    Build search queries for recruitment pages.

    Args:
        company_name: Company name to search for
        industry: Industry hint (optional)
        custom_query: Custom search query (if provided, only this is used)
        graduation_year: Target graduation year (e.g., 2027 for 27卒)
        selection_type: "main_selection" | "internship" | None

    Returns:
        List of search queries (max 4)
    """
    if custom_query:
        return [custom_query]

    # Use provided graduation_year or calculate default
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100  # e.g., 27 for 2027

    # Build queries based on selection type
    if selection_type == "internship":
        queries = [
            f"{company_name} インターン {grad_year_short}卒",
            f"{company_name} インターンシップ 募集",
            f"{company_name} サマーインターン {grad_year}",
            f"{company_name} インターン エントリー",
        ]
    elif selection_type == "main_selection":
        queries = [
            f"{company_name} 本選考 {grad_year_short}卒",
            f"{company_name} 新卒採用 {grad_year}",
            f"{company_name} 本選考 エントリー",
            f"{company_name} {grad_year_short}卒 選考",
        ]
    else:
        # Default: mixed queries for both
        queries = [
            f"{company_name} 新卒採用 {grad_year_short}卒",
            f"{company_name} 採用サイト {grad_year}",
            f"{company_name} エントリー",
            f"{company_name} 採用情報 {grad_year_short}卒",
        ]

    if industry:
        queries.append(f"{company_name} {industry} 採用")

    # Deduplicate while preserving order
    seen = set()
    result = []
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        result.append(q)

    # Keep queries compact to avoid noisy results
    return result[:4]


def _build_corporate_queries(
    company_name: str,
    search_type: str,
    custom_query: str | None = None,
    preferred_domain: str | None = None
) -> list[str]:
    type_queries = {
        "ir": [
            f"{company_name} IR",
            f"{company_name} 投資家情報",
            f"{company_name} 決算説明資料",
        ],
        "business": [
            f"{company_name} 事業内容",
            f"{company_name} 事業紹介",
            f"{company_name} 製品 サービス",
        ],
        "about": [
            f"{company_name} 会社概要",
            f"{company_name} 企業情報",
            f"{company_name} 会社案内",
        ],
    }
    if custom_query:
        queries = [custom_query]
    else:
        queries = type_queries.get(search_type, [f"{company_name} {search_type}"])
    seen = set()
    result = []
    for q in queries:
        query = q
        if preferred_domain and "site:" not in q:
            query = f"{q} site:{preferred_domain}"
        if query in seen:
            continue
        seen.add(query)
        result.append(query)
    return result


@router.post("/search-pages")
async def search_company_pages(request: SearchPagesRequest):
    """
    Search for company recruitment page candidates.

    This endpoint searches for company recruitment pages using DuckDuckGo
    based on the company name, industry, or custom query.

    Supports filtering by graduation year and selection type (main_selection/internship).

    Returns a list of up to max_results candidate URLs with confidence scores.
    """
    company_name = request.company_name
    industry = request.industry
    custom_query = request.custom_query
    max_results = min(request.max_results, 15)  # Cap at 15
    graduation_year = request.graduation_year
    selection_type = request.selection_type
    allow_snippet_match = request.allow_snippet_match

    candidates = []
    queries = _build_recruit_queries(
        company_name,
        industry,
        custom_query,
        graduation_year=graduation_year,
        selection_type=selection_type
    )

    # Try real web search with DuckDuckGo
    if HAS_DDGS:
        results_map = {}
        per_query = min(8, max_results + 3)

        for query in queries:
            search_results = await _search_with_ddgs(query, per_query)
            for result in search_results:
                url = result.get("href", result.get("url", ""))
                title = result.get("title", "")
                snippet = result.get("body", "")

                if not url:
                    continue

                normalized = _normalize_url(url)
                score = _score_recruit_candidate(url, title, snippet, company_name, industry or "")
                if score is None:
                    continue

                existing = results_map.get(normalized)
                if existing is None or score > existing["score"]:
                    results_map[normalized] = {
                        "url": url,
                        "title": title,
                        "snippet": snippet,
                        "score": score
                    }

        scored = sorted(results_map.values(), key=lambda x: (-x["score"], len(x["title"] or "")))

        # Filter out irrelevant sites, subsidiaries, and unrelated companies
        for item in scored:
            title = item["title"]
            url = item["url"]
            snippet = item.get("snippet", "")

            # Skip irrelevant sites (shopping, PDF viewers, etc.)
            if _is_irrelevant_url(url):
                continue

            # Skip subsidiaries
            if _is_subsidiary(company_name, title, url):
                continue

            # Skip results that don't contain the company name
            # This filters out different companies that share industry keywords
            # By default, only check title/URL (not snippet) to avoid false positives
            if not _contains_company_name(company_name, title, url, snippet, allow_snippet_match):
                continue

            source_type = _get_source_type(url, company_name)
            confidence = _score_to_confidence(item["score"], source_type)

            candidates.append(SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=source_type
            ))

            # Stop if we have enough candidates
            if len(candidates) >= max_results:
                break

        # If we got results, return them
        if candidates:
            return {"candidates": candidates}

    # Fallback: generate mock URLs (for when DDGS is not available)
    # Remove common corporate suffixes for URL generation
    name_clean = company_name
    for suffix in ["株式会社", "（株）", "(株)", "㈱", "有限会社", "合同会社"]:
        name_clean = name_clean.replace(suffix, "")
    name_clean = name_clean.strip()

    # Generate URL-friendly name (lowercase, alphanumeric)
    name_url = "".join(c.lower() for c in name_clean if c.isalnum())

    # URL encode for search queries
    from urllib.parse import quote
    encoded_name = quote(company_name)

    fallback_candidates = [
        SearchCandidate(
            url=f"https://job.mynavi.jp/26/pc/search/corp{name_url}/outline.html",
            title=f"{company_name} - マイナビ2026",
            confidence="medium",
            source_type="job_site"
        ),
        SearchCandidate(
            url=f"https://job.rikunabi.com/2026/company/{name_url}/",
            title=f"{company_name} - リクナビ2026",
            confidence="medium",
            source_type="job_site"
        ),
        SearchCandidate(
            url=f"https://www.onecareer.jp/companies/{name_url}",
            title=f"{company_name} - ONE CAREER",
            confidence="medium",
            source_type="job_site"
        ),
        SearchCandidate(
            url=f"https://unistyle.jp/companies/{name_url}",
            title=f"{company_name} - Unistyle",
            confidence="medium",
            source_type="job_site"
        ),
        SearchCandidate(
            url=f"https://syukatsu-kaigi.jp/companies/{name_url}",
            title=f"{company_name} - 就活会議",
            confidence="low",
            source_type="job_site"
        ),
    ]

    return {"candidates": fallback_candidates[:max_results]}


async def _fetch_schedule_response(
    request: FetchRequest,
    feature: str
) -> SelectionScheduleResponse:
    """
    Fetch and extract schedule from a URL.

    Uses graduation_year and selection_type from request if available.
    """
    try:
        html = await fetch_page_content(str(request.url))
        raw_html = html[:200000] if html else None

        text = extract_text_from_html(html)

        if not text or len(text) < 100:
            return SelectionScheduleResponse(
                success=False,
                partial_success=False,
                data=None,
                source_url=str(request.url),
                extracted_at=datetime.utcnow().isoformat(),
                error="ページの内容を取得できませんでした。JavaScriptで描画されるページの可能性があります。別のURLをお試しください。",
                deadlines_found=False,
                other_items_found=False,
                raw_text=None,
                raw_html=None
            )

        # Pass graduation_year and selection_type to LLM extraction
        extracted = await extract_schedule_with_llm(
            text,
            str(request.url),
            feature=feature,
            graduation_year=request.graduation_year,
            selection_type=request.selection_type
        )

        deadlines_found = len(extracted.deadlines) > 0
        other_items_found = (
            len(extracted.required_documents) > 0 or
            extracted.application_method is not None or
            extracted.selection_process is not None
        )

        success = deadlines_found or other_items_found
        partial_success = not deadlines_found and other_items_found

        error_message = None
        if not success:
            error_message = "採用情報が見つかりませんでした。別のURLをお試しください。"
        elif partial_success:
            error_message = "締切情報は取得できませんでしたが、他の情報を抽出しました"

        return SelectionScheduleResponse(
            success=success,
            partial_success=partial_success,
            data=extracted if success else None,
            source_url=str(request.url),
            extracted_at=datetime.utcnow().isoformat(),
            error=error_message,
            deadlines_found=deadlines_found,
            other_items_found=other_items_found,
            raw_text=text if success else None,
            raw_html=raw_html if success else None
        )

    except HTTPException:
        raise
    except Exception as e:
        return SelectionScheduleResponse(
            success=False,
            partial_success=False,
            data=None,
            source_url=str(request.url),
            extracted_at=datetime.utcnow().isoformat(),
            error=f"情報の抽出に失敗しました: {str(e)}",
            deadlines_found=False,
            other_items_found=False,
            raw_text=None,
            raw_html=None
        )


@router.post("/fetch-schedule", response_model=SelectionScheduleResponse)
async def fetch_selection_schedule(request: FetchRequest):
    """
    Fetch and extract selection schedule information from a URL.
    """
    return await _fetch_schedule_response(request, feature="selection_schedule")


@router.post("/fetch", response_model=FetchResponse)
async def fetch_company_info(request: FetchRequest):
    """
    Legacy endpoint. Delegates to /fetch-schedule for compatibility.
    """
    schedule_response = await _fetch_schedule_response(request, feature="selection_schedule_legacy")
    legacy_data = None
    if schedule_response.data:
        legacy_data = ExtractedInfo(
            deadlines=schedule_response.data.deadlines,
            recruitment_types=[],
            required_documents=schedule_response.data.required_documents,
            application_method=schedule_response.data.application_method,
            selection_process=schedule_response.data.selection_process
        )

    return FetchResponse(
        success=schedule_response.success,
        partial_success=schedule_response.partial_success,
        data=legacy_data if schedule_response.success else None,
        source_url=schedule_response.source_url,
        extracted_at=schedule_response.extracted_at,
        error=schedule_response.error,
        deadlines_found=schedule_response.deadlines_found,
        other_items_found=schedule_response.other_items_found,
        raw_text=schedule_response.raw_text,
        raw_html=schedule_response.raw_html
    )


# ============================================================================
# RAG (Retrieval Augmented Generation) Endpoints
# ============================================================================


class BuildRagRequest(BaseModel):
    """Request to build RAG from company information."""
    company_id: str
    company_name: str
    source_url: str
    # Raw content for embedding (optional - will be used instead of fetching URL)
    raw_content: Optional[str] = None
    # Raw content format: "text" or "html"
    raw_content_format: str = "text"
    # Structured data from previous extraction
    extracted_data: Optional[dict] = None
    # NEW: Store full text content (chunked) in addition to structured data
    store_full_text: bool = True
    # NEW: Content type for the raw content (new classification)
    content_type: Optional[str] = None
    # Legacy channel hint (recruitment/corporate_ir/corporate_business/corporate_general)
    content_channel: Optional[str] = None


class BuildRagResponse(BaseModel):
    """Response from building RAG."""
    success: bool
    company_id: str
    chunks_stored: int
    structured_chunks: int = 0
    full_text_chunks: int = 0
    error: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None


class RagContextRequest(BaseModel):
    """Request for RAG context."""
    company_id: str
    query: str  # Usually the ES content
    max_context_length: int = 2000


class RagContextResponse(BaseModel):
    """Response with RAG context."""
    success: bool
    company_id: str
    context: str
    has_rag: bool


class RagStatusResponse(BaseModel):
    """Response with RAG status."""
    company_id: str
    has_rag: bool


class DetailedRagStatusResponse(BaseModel):
    """Detailed RAG status response."""
    company_id: str
    has_rag: bool
    total_chunks: int = 0
    recruitment_chunks: int = 0
    corporate_ir_chunks: int = 0
    corporate_business_chunks: int = 0
    corporate_general_chunks: int = 0
    structured_chunks: int = 0
    # New content types (9 categories)
    new_grad_recruitment_chunks: int = 0
    midcareer_recruitment_chunks: int = 0
    corporate_site_chunks: int = 0
    ir_materials_chunks: int = 0
    ceo_message_chunks: int = 0
    employee_interviews_chunks: int = 0
    press_release_chunks: int = 0
    csr_sustainability_chunks: int = 0
    midterm_plan_chunks: int = 0
    # Legacy field for backward compatibility (sum of new grad + midcareer)
    recruitment_homepage_chunks: int = 0
    last_updated: Optional[str] = None


def _extracted_data_to_chunks(
    extracted_data: dict,
    source_url: str
) -> list[dict]:
    """
    Convert extracted company data to text chunks for embedding.

    Args:
        extracted_data: Extracted information dict
        source_url: Source URL

    Returns:
        List of content chunks
    """
    chunks = []

    # Deadlines
    for deadline in extracted_data.get("deadlines", []):
        text = f"締切: {deadline.get('title', '')}"
        if deadline.get("due_date"):
            text += f" ({deadline['due_date']})"
        chunks.append({
            "text": text,
            "type": "deadline",
            "metadata": {
                "deadline_type": deadline.get("type", "other"),
                "confidence": deadline.get("confidence", "low"),
            }
        })

    # Recruitment types
    for rt in extracted_data.get("recruitment_types", []):
        chunks.append({
            "text": f"募集区分: {rt.get('name', '')}",
            "type": "recruitment_type",
            "metadata": {"confidence": rt.get("confidence", "low")}
        })

    # Required documents
    docs = extracted_data.get("required_documents", [])
    if docs:
        doc_texts = [
            f"{'必須: ' if d.get('required') else ''}{d.get('name', '')}"
            for d in docs
        ]
        chunks.append({
            "text": f"提出物: {', '.join(doc_texts)}",
            "type": "required_documents",
            "metadata": {}
        })

    # Application method
    am = extracted_data.get("application_method")
    if am and am.get("value"):
        chunks.append({
            "text": f"応募方法: {am['value']}",
            "type": "application_method",
            "metadata": {"confidence": am.get("confidence", "low")}
        })

    # Selection process
    sp = extracted_data.get("selection_process")
    if sp and sp.get("value"):
        chunks.append({
            "text": f"選考プロセス: {sp['value']}",
            "type": "selection_process",
            "metadata": {"confidence": sp.get("confidence", "low")}
        })

    return chunks


@router.post("/rag/build", response_model=BuildRagResponse)
async def build_company_rag(request: BuildRagRequest):
    """
    Build RAG (vector embeddings) for a company.

    This endpoint:
    1. Takes company info (either raw content or pre-extracted data)
    2. Converts to text chunks
    3. Generates embeddings and stores in vector database
    4. Optionally stores full text content (chunked)

    The caller (Next.js API) is responsible for:
    - Authentication
    - Passing the company info

    New features:
    - store_full_text: When True, also stores full text content (chunked)
    - content_type: New classification (optional). Use content_channel for legacy.
    """
    try:
        structured_chunks = []
        full_text_stored = 0

        backend = resolve_embedding_backend()
        if backend is None:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                structured_chunks=0,
                full_text_chunks=0,
                error="No embedding backend available. Set OPENAI_API_KEY or install sentence-transformers.",
                embedding_provider=None,
                embedding_model=None,
            )

        # Resolve content_type/content_channel
        content_type = request.content_type
        content_channel = request.content_channel

        if content_type in LEGACY_CONTENT_TYPES and not content_channel:
            content_channel = content_type
            content_type = None

        if content_channel and content_channel not in LEGACY_CONTENT_TYPES:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                error=f"Invalid content_channel: {content_channel}"
            )

        if content_type and content_type not in CONTENT_TYPES_NEW + [STRUCTURED_CONTENT_TYPE]:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                error=f"Invalid content_type: {content_type}"
            )

        # If raw content provided and store_full_text is True, store full text
        if request.raw_content and request.store_full_text:
            # Use the new full text storage function
            full_text_success = await store_full_text_content(
                company_id=request.company_id,
                company_name=request.company_name,
                raw_text=request.raw_content,
                source_url=request.source_url,
                content_type=content_type,
                content_channel=content_channel,
                backend=backend,
                raw_format=request.raw_content_format
            )
            if full_text_success:
                # Count the chunks that were stored (approximate)
                from app.utils.text_chunker import (
                    JapaneseTextChunker,
                    extract_sections_from_html,
                    chunk_sections_with_metadata,
                    chunk_html_content,
                )

                if request.raw_content_format == "html":
                    sections = extract_sections_from_html(request.raw_content)
                    if sections:
                        chunks = chunk_sections_with_metadata(
                            sections,
                            chunk_size=500,
                            chunk_overlap=100
                        )
                    else:
                        chunks = chunk_html_content(
                            request.raw_content,
                            chunk_size=500,
                            chunk_overlap=100
                        )
                else:
                    chunker = JapaneseTextChunker(chunk_size=500, chunk_overlap=100)
                    chunks = chunker.chunk(request.raw_content)
                full_text_stored = len(chunks)
                print(f"[RAG保存] ✅ フルテキスト {full_text_stored}チャンク保存完了 (会社ID: {request.company_id[:8]}...)")

        # If extracted data provided, convert to structured chunks
        if request.extracted_data:
            structured_chunks = _extracted_data_to_chunks(
                request.extracted_data,
                request.source_url
            )

            # Store structured data with content_type="structured"
            if structured_chunks:
                # Add content_type/content_channel to each chunk
                for chunk in structured_chunks:
                    if "metadata" not in chunk:
                        chunk["metadata"] = {}
                    chunk["metadata"]["content_type"] = STRUCTURED_CONTENT_TYPE
                    if content_channel:
                        chunk["metadata"]["content_channel"] = content_channel

                success = await store_company_info(
                    company_id=request.company_id,
                    company_name=request.company_name,
                    content_chunks=structured_chunks,
                    source_url=request.source_url,
                    backend=backend
                )
                if not success:
                    print(f"[RAG保存] ❌ 構造化データ保存失敗 (会社ID: {request.company_id[:8]}...)")

        total_chunks = len(structured_chunks) + full_text_stored

        if total_chunks == 0:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                structured_chunks=0,
                full_text_chunks=0,
                error="No content to store",
                embedding_provider=backend.provider,
                embedding_model=backend.model
            )

        return BuildRagResponse(
            success=True,
            company_id=request.company_id,
            chunks_stored=total_chunks,
            structured_chunks=len(structured_chunks),
            full_text_chunks=full_text_stored,
            error=None,
            embedding_provider=backend.provider,
            embedding_model=backend.model
        )

    except Exception as e:
        print(f"[RAG保存] ❌ RAG構築失敗: {e}")
        return BuildRagResponse(
            success=False,
            company_id=request.company_id,
            chunks_stored=0,
            structured_chunks=0,
            full_text_chunks=0,
            error=str(e),
            embedding_provider=backend.provider if "backend" in locals() and backend else None,
            embedding_model=backend.model if "backend" in locals() and backend else None
        )


@router.post("/rag/context", response_model=RagContextResponse)
async def get_rag_context(request: RagContextRequest):
    """
    Get RAG context for ES review.

    This endpoint:
    1. Takes company ID and ES content as query
    2. Searches vector database for relevant company information
    3. Returns formatted context for LLM prompt

    The caller (Next.js API or ES review endpoint) uses this to:
    - Enrich ES review with company-specific context
    - Enable company_connection scoring axis
    """
    try:
        # Check if RAG exists
        rag_exists = has_company_rag(request.company_id)

        if not rag_exists:
            return RagContextResponse(
                success=True,
                company_id=request.company_id,
                context="",
                has_rag=False
            )

        # Get context
        context = await get_enhanced_context_for_review(
            company_id=request.company_id,
            es_content=request.query,
            max_context_length=request.max_context_length
        )

        return RagContextResponse(
            success=True,
            company_id=request.company_id,
            context=context,
            has_rag=True
        )

    except Exception as e:
        print(f"[RAG検索] ❌ コンテキスト取得失敗: {e}")
        return RagContextResponse(
            success=False,
            company_id=request.company_id,
            context="",
            has_rag=False
        )


@router.get("/rag/status/{company_id}", response_model=RagStatusResponse)
async def get_rag_status(company_id: str):
    """
    Check if a company has RAG data (simple check).

    Returns whether the company has vector embeddings stored.
    """
    return RagStatusResponse(
        company_id=company_id,
        has_rag=has_company_rag(company_id)
    )


@router.get("/rag/status-detailed/{company_id}", response_model=DetailedRagStatusResponse)
async def get_detailed_rag_status(company_id: str):
    """
    Get detailed RAG status for a company.

    Returns chunk counts by content type and last update time.
    """
    status = get_company_rag_status(company_id)
    # Get new recruitment type counts
    new_grad_chunks = status.get("new_grad_recruitment_chunks", 0)
    midcareer_chunks = status.get("midcareer_recruitment_chunks", 0)
    # For backward compatibility, also check legacy recruitment_homepage
    legacy_recruitment = status.get("recruitment_homepage_chunks", 0)
    # recruitment_homepage_chunks = sum of new types + any legacy data
    recruitment_homepage_total = new_grad_chunks + midcareer_chunks + legacy_recruitment

    return DetailedRagStatusResponse(
        company_id=company_id,
        has_rag=status["has_rag"],
        total_chunks=status["total_chunks"],
        recruitment_chunks=status["recruitment_chunks"],
        corporate_ir_chunks=status["corporate_ir_chunks"],
        corporate_business_chunks=status["corporate_business_chunks"],
        corporate_general_chunks=status.get("corporate_general_chunks", 0),
        structured_chunks=status["structured_chunks"],
        new_grad_recruitment_chunks=new_grad_chunks,
        midcareer_recruitment_chunks=midcareer_chunks,
        corporate_site_chunks=status.get("corporate_site_chunks", 0),
        ir_materials_chunks=status.get("ir_materials_chunks", 0),
        ceo_message_chunks=status.get("ceo_message_chunks", 0),
        employee_interviews_chunks=status.get("employee_interviews_chunks", 0),
        press_release_chunks=status.get("press_release_chunks", 0),
        csr_sustainability_chunks=status.get("csr_sustainability_chunks", 0),
        midterm_plan_chunks=status.get("midterm_plan_chunks", 0),
        recruitment_homepage_chunks=recruitment_homepage_total,
        last_updated=status["last_updated"]
    )


@router.delete("/rag/{company_id}")
async def delete_rag(company_id: str):
    """
    Delete all RAG data for a company.

    Used when company info is updated or company is deleted.
    """
    success = delete_company_rag(company_id)
    cache = get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id)
    return {"success": success, "company_id": company_id}


@router.delete("/rag/{company_id}/{content_type}")
async def delete_rag_by_type(company_id: str, content_type: str):
    """
    Delete RAG data for a company by content type.

    Used when only specific content type needs to be updated.
    """
    if content_type not in CONTENT_TYPES_ALL:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_type: {content_type}. Valid types: {CONTENT_TYPES_ALL}"
        )

    success = delete_company_rag_by_type(company_id, content_type)
    cache = get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id)
    return {"success": success, "company_id": company_id, "content_type": content_type}


class DeleteByUrlsRequest(BaseModel):
    """Request to delete RAG data by source URLs."""
    urls: list[str]


class DeleteByUrlsResponse(BaseModel):
    """Response from deleting RAG by URLs."""
    success: bool
    company_id: str
    urls_deleted: list[str]
    chunks_deleted: int
    errors: list[str]


@router.post("/rag/{company_id}/delete-by-urls", response_model=DeleteByUrlsResponse)
async def delete_rag_by_urls(company_id: str, request: DeleteByUrlsRequest):
    """
    Delete RAG data for a company by source URLs.

    Used when specific URLs are removed from the company's registered URLs.
    This also deletes the associated vector chunks from ChromaDB.

    Note: Using POST instead of DELETE because DELETE with request body
    is not well supported across all HTTP clients.
    """
    if not request.urls:
        return DeleteByUrlsResponse(
            success=True,
            company_id=company_id,
            urls_deleted=[],
            chunks_deleted=0,
            errors=[]
        )

    try:
        result = delete_company_rag_by_urls(company_id, request.urls)

        urls_deleted = [url for url, count in result["per_url"].items() if count > 0]

        cache = get_rag_cache()
        if cache:
            await cache.invalidate_company(company_id)

        return DeleteByUrlsResponse(
            success=True,
            company_id=company_id,
            urls_deleted=urls_deleted,
            chunks_deleted=result["total_deleted"],
            errors=[]
        )
    except Exception as e:
        print(f"[RAG削除] ❌ URL別削除エラー: {e}")
        return DeleteByUrlsResponse(
            success=False,
            company_id=company_id,
            urls_deleted=[],
            chunks_deleted=0,
            errors=[str(e)]
        )


# ============================================================================
# Corporate Site Crawling Endpoints
# ============================================================================


class CrawlCorporateRequest(BaseModel):
    """Request to crawl corporate site pages."""
    company_id: str
    company_name: str
    urls: list[str]  # List of URLs to crawl
    content_type: Optional[str] = None  # legacy channel (for backward compatibility)
    content_channel: Optional[str] = None  # corporate_ir, corporate_business, corporate_general


class CrawlCorporateResponse(BaseModel):
    """Response from corporate site crawling."""
    success: bool
    company_id: str
    pages_crawled: int
    chunks_stored: int
    errors: list[str]


class SearchCorporatePagesRequest(BaseModel):
    """Request to search for corporate page candidates."""
    company_name: str
    search_type: str  # "ir", "business", "about"
    custom_query: Optional[str] = None
    preferred_domain: Optional[str] = None
    strict_company_match: Optional[bool] = True
    allow_aggregators: Optional[bool] = False
    max_results: int = 5
    allow_snippet_match: bool = False  # If True, also match company name in snippet (less reliable)


class CorporatePageCandidate(BaseModel):
    """A candidate corporate page URL."""
    url: str
    title: str
    snippet: str
    confidence: str
    source_type: str = "other"  # official, job_site, other


@router.post("/rag/crawl-corporate", response_model=CrawlCorporateResponse)
async def crawl_corporate_pages(request: CrawlCorporateRequest):
    """
    Crawl and index corporate site pages for RAG.

    This endpoint:
    1. Fetches each URL
    2. Extracts and chunks text
    3. Stores in vector DB with content_channel="corporate_ir"/"corporate_business"/"corporate_general"
    4. Updates BM25 index

    The caller (Next.js API) is responsible for:
    - Authentication
    - Plan limit checking (page count limits)
    - Storing URLs in company record
    """
    valid_channels = ["corporate_ir", "corporate_business", "corporate_general"]
    channel = request.content_channel or request.content_type or "corporate_general"
    if channel not in valid_channels:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_channel: {channel}. Valid: {valid_channels}"
        )

    pages_crawled = 0
    chunks_stored = 0
    errors = []

    backend = resolve_embedding_backend()
    if backend is None:
        return CrawlCorporateResponse(
            success=False,
            company_id=request.company_id,
            pages_crawled=0,
            chunks_stored=0,
            errors=["No embedding backend available. Set OPENAI_API_KEY or install sentence-transformers."],
        )

    import asyncio

    for url in request.urls:
        try:
            # Fetch page content
            html = await fetch_page_content(url)

            # Extract text
            text = extract_text_from_html(html)

            if not text or len(text) < 100:
                errors.append(f"{url}: ページ内容が取得できませんでした")
                continue

            # Store full text content (HTML-aware chunking)
            success = await store_full_text_content(
                company_id=request.company_id,
                company_name=request.company_name,
                raw_text=html,
                source_url=url,
                content_channel=channel,
                backend=backend,
                raw_format="html"
            )

            if success:
                pages_crawled += 1
                # Estimate chunk count
                from app.utils.text_chunker import JapaneseTextChunker
                chunker = JapaneseTextChunker(chunk_size=500, chunk_overlap=100)
                chunks = chunker.chunk(text)
                chunks_stored += len(chunks)
            else:
                errors.append(f"{url}: ベクトル保存に失敗しました")

            # Rate limiting: wait 1 second between requests
            await asyncio.sleep(1)

        except HTTPException as e:
            errors.append(f"{url}: {e.detail}")
        except Exception as e:
            errors.append(f"{url}: {str(e)[:100]}")

    return CrawlCorporateResponse(
        success=pages_crawled > 0,
        company_id=request.company_id,
        pages_crawled=pages_crawled,
        chunks_stored=chunks_stored,
        errors=errors
    )


@router.post("/search-corporate-pages")
async def search_corporate_pages(request: SearchCorporatePagesRequest):
    """
    Search for corporate page candidates (IR, business info, etc.).

    Returns URL candidates for user to select.
    """
    company_name = request.company_name
    search_type = request.search_type
    custom_query = request.custom_query
    preferred_domain = request.preferred_domain
    strict_company_match = True if request.strict_company_match is None else request.strict_company_match
    allow_aggregators = True if request.allow_aggregators else False
    max_results = min(request.max_results, 10)
    allow_snippet_match = request.allow_snippet_match

    queries = _build_corporate_queries(company_name, search_type, custom_query, preferred_domain)

    candidates = []

    # Try web search
    if HAS_DDGS:
        results_map = {}
        per_query = min(8, max_results + 3)
        _log_corporate_search_debug(
            f"start company={company_name} type={search_type} custom_query={'yes' if custom_query else 'no'} "
            f"preferred_domain={preferred_domain or '-'} strict={strict_company_match} "
            f"allow_aggregators={allow_aggregators} max={max_results}"
        )

        async def _collect_results(strict_match: bool, allow_aggs: bool) -> None:
            for query in queries:
                search_results = await _search_with_ddgs(query, per_query)
                for result in search_results:
                    url = result.get("href", result.get("url", ""))
                    title = result.get("title", "")
                    snippet = result.get("body", "")

                    if not url:
                        continue

                    normalized = _normalize_url(url)
                    score = _score_corporate_candidate(
                        url,
                        title,
                        snippet,
                        company_name,
                        search_type,
                        preferred_domain=preferred_domain,
                        strict_company_match=strict_match,
                        allow_aggregators=allow_aggs
                    )
                    if score is None or score < CORP_SEARCH_MIN_SCORE:
                        continue

                    existing = results_map.get(normalized)
                    if existing is None or score > existing["score"]:
                        results_map[normalized] = {
                            "url": url,
                            "title": title,
                            "snippet": snippet,
                            "score": score
                        }

        await _collect_results(strict_company_match, allow_aggregators)
        _log_corporate_search_debug(f"strict results={len(results_map)}")

        if strict_company_match and len(results_map) < CORP_STRICT_MIN_RESULTS:
            _log_corporate_search_debug("relaxed pass enabled")
            await _collect_results(False, allow_aggregators)

        if not allow_aggregators and len(results_map) == 0:
            _log_corporate_search_debug("aggregator fallback enabled")
            await _collect_results(False, True)

        scored = sorted(results_map.values(), key=lambda x: (-x["score"], len(x["title"] or "")))

        # Filter and add source_type
        for item in scored:
            url = item["url"]
            title = item["title"]
            snippet = item.get("snippet", "")

            # Skip irrelevant sites (shopping, PDF viewers, etc.)
            if _is_irrelevant_url(url):
                continue

            # Skip subsidiaries
            if _is_subsidiary(company_name, title, url):
                continue

            # Skip results that don't contain the company name
            # By default, only check title/URL (not snippet) to avoid false positives
            if not _contains_company_name(company_name, title, url, snippet, allow_snippet_match):
                continue

            source_type = _get_source_type(url, company_name)
            confidence = _score_to_confidence(item["score"], source_type)

            candidates.append(CorporatePageCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                snippet=snippet[:200] if snippet else "",
                confidence=confidence,
                source_type=source_type
            ))

            # Stop if we have enough candidates
            if len(candidates) >= max_results:
                break
        if scored:
            top_items = scored[:3]
            summary = []
            for item in top_items:
                domain = _domain_from_url(item["url"])
                src_type = _get_source_type(item["url"], company_name)
                summary.append(
                    f"score={item['score']:.2f} conf={_score_to_confidence(item['score'], src_type)} "
                    f"domain={domain} src={src_type} title={(item['title'] or '')[:60]}"
                )
            _log_corporate_search_debug(
                f"final candidates={len(candidates)} top=[{'; '.join(summary)}]"
            )

    return {"candidates": candidates}


def _classify_corporate_url_confidence(url: str, title: str, search_type: str, company_name: str = "") -> str:
    """Backward-compatible wrapper for corporate URL confidence."""
    score = _score_corporate_candidate(url, title, "", company_name, search_type, preferred_domain=None, strict_company_match=False)
    if score is None:
        return "low"
    source_type = _get_source_type(url, company_name) if company_name else "other"
    return _score_to_confidence(score, source_type)


def _log_corporate_search_debug(message: str) -> None:
    if settings.company_search_debug:
        print(f"[企業サイト検索] {message}")
