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
import httpx
from bs4 import BeautifulSoup

from app.utils.llm import call_llm_with_error
from app.utils.vector_store import (
    store_company_info,
    search_company_context,
    get_company_context_for_review,
    has_company_rag,
    delete_company_rag,
)

router = APIRouter(prefix="/company-info", tags=["company-info"])


class FetchRequest(BaseModel):
    url: HttpUrl


class SearchPagesRequest(BaseModel):
    """Request to search for company recruitment pages."""
    company_name: str
    industry: Optional[str] = None


class SearchCandidate(BaseModel):
    """A candidate recruitment page URL."""
    url: str
    title: str
    confidence: str  # high, medium, low


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
    except httpx.RequestError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"HTTP error: {e.response.status_code}")


def extract_text_from_html(html: str) -> str:
    """Extract readable text from HTML."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove script and style elements
    for script in soup(["script", "style", "nav", "header", "footer"]):
        script.decompose()

    # Get text
    text = soup.get_text(separator="\n")

    # Clean up whitespace
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = "\n".join(chunk for chunk in chunks if chunk)

    # Limit to first 10000 characters
    return text[:10000]


async def extract_info_with_llm(text: str, url: str) -> ExtractedInfo:
    """
    Extract recruitment information using LLM.

    Per SPEC Section 9.5:
    - Extract minimal set: 締切/募集区分/提出物/応募方法
    - Each item needs: 根拠URL + 信頼度(高/中/低)

    Uses gpt-4o-mini via shared LLM utility (feature="company_info").
    """
    system_prompt = f"""あなたは日本の就活情報を抽出するアシスタントです。
以下のWebページテキストから、採用に関する情報を抽出してJSONで返してください。

**重要**: 各項目には必ず以下を含めてください:
- source_url: 情報の根拠となるURL（今回は "{url}" を使用）
- confidence: high（明確に記載）, medium（推測を含む）, low（不確実）のいずれか

抽出する情報:
1. deadlines: 締切情報のリスト
   - type: es_submission, web_test, aptitude_test, interview_1, interview_2, interview_3, interview_final, briefing, internship, offer_response, other のいずれか
   - title: 締切のタイトル（例: "ES提出 (一次締切)"）
   - due_date: ISO形式の日付（見つからない場合はnull）
   - source_url: "{url}"
   - confidence: high, medium, low のいずれか

2. recruitment_types: 募集区分のリスト
   - name: 募集区分の名前（例: "夏インターン", "本選考", "早期選考"）
   - source_url: "{url}"
   - confidence: high, medium, low

3. required_documents: 必要書類のリスト
   - name: 書類名（例: "履歴書", "ES", "成績証明書"）
   - required: 必須かどうか（true/false）
   - source_url: "{url}"
   - confidence: high, medium, low

4. application_method: 応募方法（見つからない場合はnull）
   - value: 応募方法の説明
   - source_url: "{url}"
   - confidence: high, medium, low

5. selection_process: 選考プロセス（見つからない場合はnull）
   - value: 選考プロセスの説明
   - source_url: "{url}"
   - confidence: high, medium, low

見つからない情報はnullまたは空のリストで返してください。
必ず有効なJSONを返してください。"""

    user_message = f"以下のWebページテキストから採用情報を抽出してください:\n\n{text}"

    # feature="company_info" → automatically selects gpt-4o-mini
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=2000,
        temperature=0.1,
        feature="company_info"
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
        print(f"Error parsing LLM response: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": str(e)
            }
        )


@router.post("/search-pages")
async def search_company_pages(request: SearchPagesRequest):
    """
    Search for company recruitment page candidates.

    This endpoint generates candidate URLs for company recruitment pages
    based on the company name and industry.

    Returns a list of 3 candidate URLs with confidence scores.
    """
    company_name = request.company_name
    industry = request.industry or ""

    # Generate candidate URLs based on company name
    # Remove common corporate suffixes for URL generation
    name_clean = company_name
    for suffix in ["株式会社", "（株）", "(株)", "㈱", "有限会社", "合同会社"]:
        name_clean = name_clean.replace(suffix, "")
    name_clean = name_clean.strip()

    # Generate URL-friendly name (lowercase, alphanumeric)
    name_url = "".join(c.lower() for c in name_clean if c.isalnum())

    candidates = [
        SearchCandidate(
            url=f"https://www.{name_url}.co.jp/recruit/",
            title=f"{company_name} 採用情報",
            confidence="high"
        ),
        SearchCandidate(
            url=f"https://job.mynavi.jp/search/?searchButton=1&focusSearchBox=0&keyword={company_name}",
            title=f"{company_name} - マイナビ",
            confidence="medium"
        ),
        SearchCandidate(
            url=f"https://job.rikunabi.com/2026/company/{name_url}/",
            title=f"{company_name} - リクナビ",
            confidence="medium"
        ),
    ]

    return {"candidates": candidates}


@router.post("/fetch", response_model=FetchResponse)
async def fetch_company_info(request: FetchRequest):
    """
    Fetch and extract company recruitment information from a URL.

    This endpoint:
    1. Fetches the page content from the provided URL
    2. Extracts text from HTML
    3. Uses LLM to extract structured recruitment information
    4. Returns the extracted data with partial_success flag

    SPEC Section 9.5 - Partial Success:
    - If deadlines not found but other items extracted = partial success
    - Caller should consume 0.5 credit for partial success
    - Full success = 1 credit

    The caller (Next.js API) is responsible for:
    - Authentication
    - Credit/quota checking (1 credit for full, 0.5 for partial)
    - Saving the extracted data
    """
    try:
        # Fetch page content
        html = await fetch_page_content(str(request.url))

        # Extract text
        text = extract_text_from_html(html)

        if not text or len(text) < 100:
            return FetchResponse(
                success=False,
                partial_success=False,
                data=None,
                source_url=str(request.url),
                extracted_at=datetime.utcnow().isoformat(),
                error="ページから十分な情報を抽出できませんでした",
                deadlines_found=False,
                other_items_found=False
            )

        # Extract info using LLM
        extracted = await extract_info_with_llm(text, str(request.url))

        # Determine success level per SPEC Section 9.5
        deadlines_found = len(extracted.deadlines) > 0
        other_items_found = (
            len(extracted.recruitment_types) > 0 or
            len(extracted.required_documents) > 0 or
            extracted.application_method is not None
        )

        # Success: at least one item extracted
        # Partial success: no deadlines but other items found
        success = deadlines_found or other_items_found
        partial_success = not deadlines_found and other_items_found

        error_message = None
        if not success:
            error_message = "ページから採用情報を抽出できませんでした"
        elif partial_success:
            error_message = "締切情報は取得できませんでしたが、他の情報を抽出しました"

        return FetchResponse(
            success=success,
            partial_success=partial_success,
            data=extracted if success else None,
            source_url=str(request.url),
            extracted_at=datetime.utcnow().isoformat(),
            error=error_message,
            deadlines_found=deadlines_found,
            other_items_found=other_items_found
        )

    except HTTPException:
        raise
    except Exception as e:
        return FetchResponse(
            success=False,
            partial_success=False,
            data=None,
            source_url=str(request.url),
            extracted_at=datetime.utcnow().isoformat(),
            error=f"情報の抽出に失敗しました: {str(e)}",
            deadlines_found=False,
            other_items_found=False
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
    # Structured data from previous extraction
    extracted_data: Optional[dict] = None


class BuildRagResponse(BaseModel):
    """Response from building RAG."""
    success: bool
    company_id: str
    chunks_stored: int
    error: Optional[str] = None


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

    The caller (Next.js API) is responsible for:
    - Authentication
    - Passing the company info
    """
    try:
        chunks = []

        # If raw content provided, fetch and extract
        if request.raw_content:
            # Split raw content into reasonable chunks
            text = request.raw_content
            # Simple chunking by paragraphs
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

            for idx, para in enumerate(paragraphs):
                if len(para) > 50:  # Skip very short paragraphs
                    chunks.append({
                        "text": para[:1000],  # Limit chunk size
                        "type": "general",
                        "metadata": {"chunk_index": idx}
                    })

        # If extracted data provided, convert to chunks
        if request.extracted_data:
            extracted_chunks = _extracted_data_to_chunks(
                request.extracted_data,
                request.source_url
            )
            chunks.extend(extracted_chunks)

        if not chunks:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                error="No content to store"
            )

        # Store in vector database
        success = await store_company_info(
            company_id=request.company_id,
            company_name=request.company_name,
            content_chunks=chunks,
            source_url=request.source_url
        )

        return BuildRagResponse(
            success=success,
            company_id=request.company_id,
            chunks_stored=len(chunks) if success else 0,
            error=None if success else "Failed to store embeddings"
        )

    except Exception as e:
        print(f"Error building RAG: {e}")
        return BuildRagResponse(
            success=False,
            company_id=request.company_id,
            chunks_stored=0,
            error=str(e)
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
        context = await get_company_context_for_review(
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
        print(f"Error getting RAG context: {e}")
        return RagContextResponse(
            success=False,
            company_id=request.company_id,
            context="",
            has_rag=False
        )


@router.get("/rag/status/{company_id}", response_model=RagStatusResponse)
async def get_rag_status(company_id: str):
    """
    Check if a company has RAG data.

    Returns whether the company has vector embeddings stored.
    """
    return RagStatusResponse(
        company_id=company_id,
        has_rag=has_company_rag(company_id)
    )


@router.delete("/rag/{company_id}")
async def delete_rag(company_id: str):
    """
    Delete RAG data for a company.

    Used when company info is updated or company is deleted.
    """
    success = delete_company_rag(company_id)
    return {"success": success, "company_id": company_id}
