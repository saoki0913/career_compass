"""
ES Review Router

AI-powered ES (Entry Sheet) review and feedback using LLM.

Scoring axes (SPEC Section 16.2):
- 論理 (logic): 論理の一貫性
- 具体性 (specificity): 具体性（数字、エピソード）
- 熱意 (passion): 熱意・意欲の伝わり度
- 企業接続 (company_connection): 企業との接続度（RAG取得時のみ評価）
- 読みやすさ (readability): 文章の読みやすさ

Style options (SPEC Section 16.3):
- Free: バランス/堅め/個性強め (3 types)
- Paid: above + 短く/熱意強め/結論先出し/具体例強め/端的 (8 types)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

from app.utils.llm import call_llm_with_error
from app.utils.vector_store import (
    get_company_context_for_review,
    get_enhanced_context_for_review,
    get_enhanced_context_for_review_with_sources,
    has_company_rag,
    get_company_rag_status,
    get_dynamic_context_length
)
from app.utils.cache import get_es_review_cache, build_cache_key
from app.utils.telemetry import record_es_scores, record_parse_failure, record_rag_context
from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    build_template_prompt,
    validate_template_output,
)

router = APIRouter(prefix="/api/es", tags=["es-review"])

# Style options per plan
FREE_STYLES = ["バランス", "堅め", "個性強め"]
PAID_STYLES = FREE_STYLES + ["短く", "熱意強め", "結論先出し", "具体例強め", "端的"]


class SectionDataInput(BaseModel):
    """Section data with character limit for review"""
    title: str
    content: str
    char_limit: Optional[int] = None


# Template-based review types (must be defined before ReviewRequest)
class TemplateRequest(BaseModel):
    """Request for template-based ES review."""
    template_type: str  # Template ID from TEMPLATE_DEFS
    company_name: Optional[str] = None
    industry: Optional[str] = None
    question: str  # ES question text
    answer: str  # User's answer
    char_min: Optional[int] = None
    char_max: Optional[int] = None
    intern_name: Optional[str] = None  # Intern program name (for intern templates)
    role_name: Optional[str] = None  # Role/course name (for role_course_reason template)


class TemplateVariant(BaseModel):
    """A single variant in template review."""
    text: str
    char_count: int
    pros: list[str]
    cons: list[str]
    keywords_used: list[str]
    keyword_sources: list[str]


class TemplateSource(BaseModel):
    """Source reference for template keywords."""
    source_id: str
    source_url: str
    content_type: str
    excerpt: Optional[str] = None


class TemplateReview(BaseModel):
    """Template-based review result."""
    template_type: str
    variants: list[TemplateVariant]
    keyword_sources: list[TemplateSource]
    strengthen_points: Optional[list[str]] = None


class ReviewRequest(BaseModel):
    content: str
    section_id: Optional[str] = None
    style: str = "バランス"  # Rewrite style
    is_paid: bool = False  # Whether user is on paid plan
    has_company_rag: bool = False  # Whether company RAG data is available
    company_id: Optional[str] = None  # Company ID for RAG context lookup
    rewrite_count: int = 1  # Number of rewrites (Free: 1, Paid: 3)
    # H2 sections for 設問別指摘 (paid only)
    sections: Optional[list[str]] = None
    # Section data with character limits (paid only)
    section_data: Optional[list[SectionDataInput]] = None
    # Review mode: "full" for entire ES, "section" for single question
    review_mode: str = "full"  # "full" | "section"
    # Section-specific fields (used when review_mode="section")
    section_title: Optional[str] = None  # Question title for section review
    section_char_limit: Optional[int] = None  # Character limit for section
    # Template-based review (used when review_mode="section")
    template_request: Optional[TemplateRequest] = None


class Score(BaseModel):
    logic: int  # 1-5: 論理の一貫性
    specificity: int  # 1-5: 具体性（数字、エピソード）
    passion: int  # 1-5: 熱意・意欲の伝わり度
    company_connection: Optional[int] = None  # 1-5: 企業接続（RAG取得時のみ）
    readability: int  # 1-5: 読みやすさ


class Issue(BaseModel):
    category: str  # 評価カテゴリ
    issue: str  # 問題点の説明
    suggestion: str  # 改善提案
    difficulty: Optional[str] = None  # easy | medium | hard


class SectionFeedback(BaseModel):
    section_title: str  # H2 section title
    feedback: str  # 100-150 chars feedback
    rewrite: Optional[str] = None  # Section-specific rewrite respecting char limit


class ReviewResponse(BaseModel):
    scores: Score
    top3: list[Issue]
    rewrites: list[str]  # Multiple rewrites based on plan
    section_feedbacks: Optional[list[SectionFeedback]] = None  # Paid only
    template_review: Optional[TemplateReview] = None  # Template-based review result


def parse_validation_errors(
    variants: list[dict],
    char_min: Optional[int],
    char_max: Optional[int],
) -> list[dict]:
    """
    Parse validation results to extract specific character deltas for each variant.

    Args:
        variants: List of variant dicts from LLM response
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)

    Returns:
        List of error dicts with pattern, current, target, delta, direction
    """
    errors = []
    for i, variant in enumerate(variants, 1):
        text = variant.get("text", "")
        current = len(text)

        if char_max and current > char_max:
            errors.append({
                "pattern": i,
                "current": current,
                "target": char_max,
                "delta": current - char_max,
                "direction": "reduce",
            })
        elif char_min and current < char_min:
            errors.append({
                "pattern": i,
                "current": current,
                "target": char_min,
                "delta": char_min - current,
                "direction": "expand",
            })
    return errors


def build_char_adjustment_prompt(
    variant_errors: list[dict],
    char_min: Optional[int],
    char_max: Optional[int],
) -> str:
    """
    Build specific adjustment instructions for each failing variant.

    Args:
        variant_errors: List of error dicts from parse_validation_errors
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)

    Returns:
        Adjustment instructions string with specific deltas and guidance
    """
    if not variant_errors:
        return ""

    instructions = []
    for err in variant_errors:
        pattern_num = err["pattern"]
        current = err["current"]
        delta = err["delta"]
        direction = err["direction"]

        if direction == "reduce":
            instructions.append(
                f"パターン{pattern_num}: 現在{current}字 → {err['target']}字以下に{delta}字削減\n"
                f"  削減候補: 冗長な接続詞（「〜という」「〜のような」）、重複表現、過剰な修飾語"
            )
        else:  # expand
            instructions.append(
                f"パターン{pattern_num}: 現在{current}字 → {err['target']}字以上に{delta}字追加\n"
                f"  追加候補: 具体的数字（人数・期間・成果）、エピソードの詳細、結論の補強"
            )

    # Build constraint description
    if char_min and char_max:
        constraint = f"{char_min}〜{char_max}字"
    elif char_max:
        constraint = f"{char_max}字以内"
    else:
        constraint = f"{char_min}字以上"

    return f"""【文字数エラー - 以下の指示に従い修正】

{chr(10).join(instructions)}

重要:
- 修正後の char_count には必ず len(text) の正確な値を記録
- 目標文字数: {constraint}
- JSON構造は維持したまま、variants[*].text のみ修正"""


def build_es_review_schema(
    require_company_connection: bool,
    include_template_review: bool,
    include_section_feedbacks: bool
) -> dict:
    """Build JSON schema for ES review output (OpenAI Structured Outputs)."""
    score_properties = {
        "logic": {"type": "integer", "minimum": 1, "maximum": 5},
        "specificity": {"type": "integer", "minimum": 1, "maximum": 5},
        "passion": {"type": "integer", "minimum": 1, "maximum": 5},
        "readability": {"type": "integer", "minimum": 1, "maximum": 5},
        "company_connection": {"type": "integer", "minimum": 1, "maximum": 5},
    }
    score_required = ["logic", "specificity", "passion", "readability"]
    if require_company_connection:
        score_required.append("company_connection")

    issue_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["category", "issue", "suggestion", "difficulty"],
        "properties": {
            "category": {"type": "string"},
            "issue": {"type": "string"},
            "suggestion": {"type": "string"},
            "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
        },
    }

    section_feedback_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["section_title", "feedback"],
        "properties": {
            "section_title": {"type": "string"},
            "feedback": {"type": "string"},
            "rewrite": {"type": "string"},
        },
    }

    variant_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["text", "char_count", "pros", "cons", "keywords_used", "keyword_sources"],
        "properties": {
            "text": {"type": "string"},
            "char_count": {"type": "integer"},
            "pros": {"type": "array", "items": {"type": "string"}},
            "cons": {"type": "array", "items": {"type": "string"}},
            "keywords_used": {"type": "array", "items": {"type": "string"}},
            "keyword_sources": {"type": "array", "items": {"type": "string"}},
        },
    }

    keyword_source_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["source_id", "source_url", "content_type"],
        "properties": {
            "source_id": {"type": "string"},
            "source_url": {"type": "string"},
            "content_type": {"type": "string"},
            "excerpt": {"type": "string"},
        },
    }

    template_review_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["template_type", "variants", "keyword_sources"],
        "properties": {
            "template_type": {"type": "string"},
            "variants": {
                "type": "array",
                "items": variant_schema,
                "minItems": 3,
                "maxItems": 3,
            },
            "keyword_sources": {
                "type": "array",
                "items": keyword_source_schema,
            },
            "strengthen_points": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
    }

    properties = {
        "scores": {
            "type": "object",
            "additionalProperties": False,
            "required": score_required,
            "properties": score_properties,
        },
        "top3": {
            "type": "array",
            "items": issue_schema,
            "minItems": 1,
            "maxItems": 3,
        },
        "rewrites": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 3,
        },
    }

    required = ["scores", "top3", "rewrites"]

    if include_section_feedbacks:
        properties["section_feedbacks"] = {
            "type": "array",
            "items": section_feedback_schema,
            "minItems": 1,
        }
        required.append("section_feedbacks")

    if include_template_review:
        properties["template_review"] = template_review_schema
        required.append("template_review")

    return {
        "name": "es_review_response",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": required,
            "properties": properties,
        },
    }


DIFFICULTY_LEVELS = {"easy", "medium", "hard"}


def _normalize_difficulty(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = value.strip().lower()
    mapping = {
        "easy": "easy",
        "medium": "medium",
        "hard": "hard",
        "簡単": "easy",
        "易しい": "easy",
        "中": "medium",
        "普通": "medium",
        "難しい": "hard",
        "難": "hard",
    }
    return mapping.get(normalized, normalized if normalized in DIFFICULTY_LEVELS else None)


def _parse_issues(items: list[dict], max_items: int) -> list[Issue]:
    issues: list[Issue] = []
    for item in items[:max_items]:
        issues.append(Issue(
            category=item.get("category", "その他"),
            issue=item.get("issue", ""),
            suggestion=item.get("suggestion", ""),
            difficulty=_normalize_difficulty(item.get("difficulty")) or "medium"
        ))
    return issues


def _build_review_cache_key(
    request: ReviewRequest,
    rag_status: Optional[dict],
    rewrite_count: int,
    context_length: Optional[int] = None
) -> str:
    template_payload = request.template_request.model_dump() if request.template_request else None
    section_data_payload = [s.model_dump() for s in request.section_data] if request.section_data else None
    parts = [
        "es_review_v2",
        request.review_mode,
        request.content,
        request.style,
        str(request.is_paid),
        str(rewrite_count),
        str(context_length or ""),
        request.section_id or "",
        request.section_title or "",
        str(request.section_char_limit or ""),
        ",".join(request.sections or []),
        json.dumps(section_data_payload, ensure_ascii=False) if section_data_payload else "",
        json.dumps(template_payload, ensure_ascii=False) if template_payload else "",
        request.company_id or "",
        str(request.has_company_rag),
    ]
    if rag_status:
        parts.append(str(rag_status.get("last_updated") or ""))
        parts.append(str(rag_status.get("total_chunks") or ""))
    return build_cache_key(*parts)


async def review_section_with_template(
    request: ReviewRequest,
    rag_context: str,
    rag_sources: list[dict],
    company_rag_available: bool,
) -> ReviewResponse:
    """
    Review a single ES section using template-based prompts.

    This provides template-specific feedback with:
    - 3 pattern variants with pros/cons
    - Company keyword extraction from RAG
    - Character limit enforcement
    - Optional strengthen points

    Uses a retry loop (max 3 attempts) to ensure output validation passes.
    """
    template_request = request.template_request
    if not template_request:
        raise ValueError("template_request is required")

    template_type = template_request.template_type
    if template_type not in TEMPLATE_DEFS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template type: {template_type}. Available: {list(TEMPLATE_DEFS.keys())}"
        )

    template_def = TEMPLATE_DEFS[template_type]
    keyword_count = template_def["keyword_count"]

    # Character limits
    char_min = template_request.char_min
    char_max = template_request.char_max

    # Check if template requires company RAG but none available
    if template_def["requires_company_rag"] and not company_rag_available:
        print(f"[ES添削/テンプレート] ⚠️ テンプレート {template_type} は RAG 必須だが利用不可 - キーワードなしで続行")
        # Set keyword_count to 0 if no RAG available
        keyword_count = 0

    # Build prompts
    system_prompt, user_prompt = build_template_prompt(
        template_type=template_type,
        company_name=template_request.company_name,
        industry=template_request.industry,
        question=template_request.question,
        answer=template_request.answer,
        char_min=char_min,
        char_max=char_max,
        rag_sources=rag_sources,
        rag_context=rag_context,
        keyword_count=keyword_count,
        has_rag=company_rag_available,
        intern_name=template_request.intern_name,
        role_name=template_request.role_name,
    )

    # Retry loop for validation
    # Reduced from 3 to 2 to minimize total request time
    # Each attempt can take up to 120s with new timeout settings
    max_retries = 2
    retry_reason = ""

    for attempt in range(max_retries):
        # Add retry reason if not first attempt
        current_user_prompt = user_prompt
        if retry_reason:
            current_user_prompt += f"\n\n【前回のエラー - 以下を修正してください】\n{retry_reason}"

        print(f"[ES添削/テンプレート] テンプレート {template_type} 試行 {attempt + 1}/{max_retries}")

        # Call LLM
        llm_result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=current_user_prompt,
            max_tokens=4500,  # Increased for 3 variants + metadata (prevents truncation)
            temperature=0.4,  # Slightly higher for variety
            feature="es_review",
            response_format="json_schema",
            json_schema=build_es_review_schema(
                require_company_connection=company_rag_available,
                include_template_review=True,
                include_section_feedbacks=False
            ),
            use_responses_api=True,
            retry_on_parse=True,
            parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
        )

        if not llm_result.success:
            error = llm_result.error
            raise HTTPException(
                status_code=503,
                detail={
                    "error": error.message if error else "AI処理中にエラーが発生しました",
                    "error_type": error.error_type if error else "unknown",
                    "provider": error.provider if error else "unknown",
                    "detail": error.detail if error else "",
                }
            )

        data = llm_result.data
        if data is None:
            retry_reason = "AIからの応答を解析できませんでした。有効なJSONで回答してください。"
            continue

        # Check for template_review in response
        template_review_data = data.get("template_review")
        if not template_review_data:
            retry_reason = "template_review フィールドが出力に含まれていません。"
            continue

        # Validate output
        is_valid, error_reason = validate_template_output(
            template_review_data,
            char_min=char_min,
            char_max=char_max,
            keyword_count=keyword_count,
        )

        # Attempt a single repair for char limit failures (both over and under limits)
        if (not is_valid) and error_reason and "文字" in error_reason:
            # Parse specific character errors for targeted feedback
            variants = template_review_data.get("variants", [])
            variant_errors = parse_validation_errors(variants, char_min, char_max)

            if variant_errors:
                # Build targeted adjustment prompt with specific deltas
                adjustment_instructions = build_char_adjustment_prompt(
                    variant_errors, char_min, char_max
                )
                repair_prompt = f"""{adjustment_instructions}

対象JSON:
{json.dumps(data, ensure_ascii=False)}

JSON以外は出力しないでください。"""
            else:
                # Fallback to generic repair if no specific errors parsed
                repair_prompt = f"""以下のJSONの形式は維持したまま、variants[*].text を指定文字数内に修正してください。
- 文字数制約: {char_min or 0}〜{char_max or '無制限'} 文字
- 他のフィールド構造は一切変更しない
- JSON以外は出力しない

対象JSON:
{json.dumps(data, ensure_ascii=False)}
"""

            repair_result = await call_llm_with_error(
                system_prompt="あなたはJSON修復の専門家です。必ずJSONのみ出力してください。",
                user_message=repair_prompt,
                max_tokens=2500,  # Slightly increased for longer texts
                temperature=0.2,
                feature="es_review"
            )

            if repair_result.success and repair_result.data:
                data = repair_result.data
                template_review_data = data.get("template_review") or template_review_data
                is_valid, error_reason = validate_template_output(
                    template_review_data,
                    char_min=char_min,
                    char_max=char_max,
                    keyword_count=keyword_count,
                )

        if is_valid:
            # Build response
            try:
                # Parse scores
                scores_data = data.get("scores", {})
                scores = Score(
                    logic=max(1, min(5, scores_data.get("logic", 3))),
                    specificity=max(1, min(5, scores_data.get("specificity", 3))),
                    passion=max(1, min(5, scores_data.get("passion", 3))),
                    company_connection=max(1, min(5, scores_data.get("company_connection", 3))) if company_rag_available else None,
                    readability=max(1, min(5, scores_data.get("readability", 3))),
                )

                # Parse top3 (1-2 issues for section)
                top3_data = data.get("top3", [])
                top3 = _parse_issues(top3_data, 2)
                if not top3:
                    top3 = [Issue(
                        category="その他",
                        issue="改善点を特定できませんでした",
                        suggestion="全体的な見直しを行ってみてください",
                        difficulty="medium"
                    )]

                # Get rewrites from data or template variants
                rewrites_data = data.get("rewrites", [])
                if isinstance(rewrites_data, str):
                    rewrites_data = [rewrites_data]
                if not rewrites_data:
                    # Use template variants as rewrites
                    rewrites_data = [v.get("text", "") for v in template_review_data.get("variants", [])]
                rewrites = rewrites_data[:3]

                # Parse template review
                variants_data = template_review_data.get("variants", [])
                variants = [
                    TemplateVariant(
                        text=v.get("text", ""),
                        char_count=len(v.get("text", "")),
                        pros=v.get("pros", []),
                        cons=v.get("cons", []),
                        keywords_used=v.get("keywords_used", []),
                        keyword_sources=v.get("keyword_sources", []),
                    )
                    for v in variants_data
                ]

                # Parse keyword sources
                keyword_sources_data = template_review_data.get("keyword_sources", [])
                keyword_sources = [
                    TemplateSource(
                        source_id=src.get("source_id", ""),
                        source_url=src.get("source_url", ""),
                        content_type=src.get("content_type", ""),
                        excerpt=src.get("excerpt"),
                    )
                    for src in keyword_sources_data
                ]

                # Merge RAG sources if keyword_sources is empty
                if not keyword_sources and rag_sources:
                    keyword_sources = [
                        TemplateSource(
                            source_id=src.get("source_id", ""),
                            source_url=src.get("source_url", ""),
                            content_type=src.get("content_type", ""),
                            excerpt=src.get("excerpt"),
                        )
                        for src in rag_sources
                    ]

                # Get strengthen points if required
                strengthen_points = None
                if template_def.get("require_strengthen_points"):
                    strengthen_points = template_review_data.get("strengthen_points", [])

                template_review = TemplateReview(
                    template_type=template_type,
                    variants=variants,
                    keyword_sources=keyword_sources,
                    strengthen_points=strengthen_points,
                )

                print(f"[ES添削/テンプレート] ✅ 試行 {attempt + 1} で成功")
                return ReviewResponse(
                    scores=scores,
                    top3=top3,
                    rewrites=rewrites,
                    section_feedbacks=None,
                    template_review=template_review,
                )

            except Exception as e:
                print(f"[ES添削/テンプレート] ❌ 試行 {attempt + 1} 解析エラー: {e}")
                retry_reason = f"レスポンスの解析に失敗しました: {str(e)}"
                continue
        else:
            print(f"[ES添削/テンプレート] ⚠️ 試行 {attempt + 1} 検証失敗: {error_reason}")
            # If character limit error, add specific adjustment instructions
            if "文字" in error_reason:
                variants = template_review_data.get("variants", [])
                variant_errors = parse_validation_errors(variants, char_min, char_max)
                if variant_errors:
                    adjustment_prompt = build_char_adjustment_prompt(
                        variant_errors, char_min, char_max
                    )
                    retry_reason = adjustment_prompt
                else:
                    retry_reason = error_reason
            else:
                retry_reason = error_reason

    # All retries exhausted
    record_parse_failure("es_review_template", retry_reason)
    raise HTTPException(
        status_code=422,
        detail={
            "error": "テンプレート出力の検証に失敗しました。条件を満たす出力を生成できませんでした。",
            "error_type": "validation",
            "provider": "template_review",
            "detail": retry_reason,
        }
    )


async def review_section(
    request: ReviewRequest,
    company_context: str,
    company_rag_available: bool
) -> ReviewResponse:
    """
    Review a single ES section (question).

    This provides focused feedback on one specific question/section.
    """
    # Build scoring criteria (same as full review)
    score_criteria = """1. scores (各1-5点):
   - logic: 論理の一貫性（主張と根拠の整合性、因果関係の明確さ）
   - specificity: 具体性（数字、エピソード、固有名詞の使用）
   - passion: 熱意・意欲の伝わり度（モチベーションの説得力）"""

    if company_rag_available:
        score_criteria += """
   - company_connection: 企業接続（企業情報に基づいて評価）
     * 企業の具体的な事業内容・取り組みへの言及があるか
     * 企業の価値観・文化と自身の経験・価値観の接点を示しているか"""

    score_criteria += """
   - readability: 読みやすさ（文章の明瞭さ、構成の分かりやすさ）"""

    # Build rewrite instruction
    style_instructions = {
        "バランス": "バランスの取れた、読みやすい文章に",
        "堅め": "フォーマルで堅実な印象の文章に",
        "個性強め": "個性と独自性が際立つ文章に",
        "短く": "簡潔でコンパクトな文章に",
        "熱意強め": "熱意と意欲が強く伝わる文章に",
        "結論先出し": "結論を先に述べ、根拠を後から示す構成に",
        "具体例強め": "具体的なエピソードや数値を増やした文章に",
        "端的": "端的で要点を押さえた文章に",
    }
    rewrite_instruction = style_instructions.get(request.style, "バランスの取れた文章に")

    # Character limit instruction
    char_limit_instruction = ""
    if request.section_char_limit:
        char_limit_instruction = f"   - 文字数制限: {request.section_char_limit}文字以内に収めてください"

    system_prompt = f"""あなたはES（エントリーシート）添削の専門家です。
就活生のESの**特定の設問**を添削し、具体的で実用的なフィードバックを提供してください。

設問タイトル: 「{request.section_title or '（タイトルなし）'}」
{f'文字数制限: {request.section_char_limit}文字' if request.section_char_limit else ''}

以下の観点で評価し、必ずJSON形式で回答してください：

{score_criteria}

2. top3: 改善すべき点（1〜2点）
   - category: 評価軸の名前（論理、具体性、熱意、{"企業接続、" if company_rag_available else ""}読みやすさ）
   - issue: 具体的な問題点（文章のどこが、なぜ問題か）
   - suggestion: 実践的な改善案（具体的に何をどう変えるか）
   - difficulty: 難易度（easy/medium/hard）
   {"※企業接続の指摘では、提供された企業情報を参照して具体的な改善点を示してください" if company_rag_available else ""}

3. rewrites: 改善例（1パターン）
   - スタイル「{request.style}」に沿って{rewrite_instruction}リライト
   - 元の文章の良い部分は活かしつつ、問題点を改善した文章
{char_limit_instruction}
   {"- 企業情報に基づいて、企業の事業内容や価値観と結びつく表現を追加" if company_rag_available else ""}

スコアは厳しめに付けてください（平均3点程度）。
この設問に特化した具体的なフィードバックを提供してください。

出力形式（必ず有効なJSONで回答）:
{{
  "scores": {{"logic": 3, "specificity": 3, "passion": 3, "readability": 3{', "company_connection": 3' if company_rag_available else ''}}},
  "top3": [
    {{"category": "...", "issue": "...", "suggestion": "...", "difficulty": "easy"}}
  ],
  "rewrites": ["リライト案"]
}}"""

    # Build user message
    user_message = f"""以下の設問への回答を添削してください：

**設問**: {request.section_title or '（タイトルなし）'}
{f'**文字数制限**: {request.section_char_limit}文字' if request.section_char_limit else ''}

**回答内容**:
{request.content}"""

    if company_context:
        user_message = f"""以下の設問への回答を添削してください。

**企業情報（RAGから取得）:**
{company_context}

**設問**: {request.section_title or '（タイトルなし）'}
{f'**文字数制限**: {request.section_char_limit}文字' if request.section_char_limit else ''}

**回答内容**:
{request.content}"""

    # Call LLM
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=2000,  # Less tokens needed for single section
        temperature=0.3,
        feature="es_review",
        response_format="json_schema",
        json_schema=build_es_review_schema(
            require_company_connection=company_rag_available,
            include_template_review=False,
            include_section_feedbacks=False
        ),
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
    )

    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "AI処理中にエラーが発生しました",
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
                "error": "AIからの応答を解析できませんでした。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM"
            }
        )

    try:
        # Parse response
        scores_data = data.get("scores", {})
        scores = Score(
            logic=max(1, min(5, scores_data.get("logic", 3))),
            specificity=max(1, min(5, scores_data.get("specificity", 3))),
            passion=max(1, min(5, scores_data.get("passion", 3))),
            company_connection=max(1, min(5, scores_data.get("company_connection", 3))) if company_rag_available else None,
            readability=max(1, min(5, scores_data.get("readability", 3))),
        )

        # Get 1-2 issues for section review
        top3_data = data.get("top3", [])
        top3 = _parse_issues(top3_data, 2)

        # Ensure we have at least 1 issue
        if not top3:
            top3 = [Issue(
                category="その他",
                issue="改善点を特定できませんでした",
                suggestion="全体的な見直しを行ってみてください",
                difficulty="medium"
            )]

        # Get single rewrite
        rewrites_data = data.get("rewrites", [])
        if isinstance(rewrites_data, str):
            rewrites_data = [rewrites_data]
        rewrites = rewrites_data[:1] if rewrites_data else [request.content]

        return ReviewResponse(
            scores=scores,
            top3=top3,
            rewrites=rewrites,
            section_feedbacks=None  # Not used in section mode
        )

    except Exception as e:
        print(f"[ES添削/セクション] ❌ LLM応答解析失敗: {e}")
        record_parse_failure("es_review_section", str(e))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": str(e)
            }
        )


@router.post("/review", response_model=ReviewResponse)
async def review_es(request: ReviewRequest):
    """
    Review ES content and provide scores, improvement suggestions, and rewrites.

    This endpoint supports two modes:
    - review_mode="full": Review entire ES (default)
    - review_mode="section": Review a single question/section

    Scoring axes (SPEC Section 16.2):
    - 論理 (logic): 論理の一貫性
    - 具体性 (specificity): 具体性（数字、エピソード）
    - 熱意 (passion): 熱意・意欲の伝わり度
    - 企業接続 (company_connection): 企業との接続度（RAG取得時のみ）
    - 読みやすさ (readability): 文章の読みやすさ

    The caller (Next.js API) is responsible for:
    - Authentication
    - Credit checking and consumption
    - Rate limiting
    """
    if not request.content or len(request.content.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="ESの内容が短すぎます。もう少し詳しく書いてから添削をリクエストしてください。"
        )

    # Validate review_mode
    if request.review_mode not in ("full", "section"):
        raise HTTPException(
            status_code=400,
            detail="review_modeは 'full' または 'section' を指定してください"
        )

    # Validate style based on plan
    available_styles = PAID_STYLES if request.is_paid else FREE_STYLES
    if request.style not in available_styles:
        raise HTTPException(
            status_code=400,
            detail=f"利用可能なスタイル: {', '.join(available_styles)}"
        )

    # Cap rewrite count based on plan
    rewrite_count = min(request.rewrite_count, 3 if request.is_paid else 1)

    # Check and fetch company RAG context if company_id is provided
    company_context = ""
    company_rag_available = request.has_company_rag
    rag_status = None
    context_length = get_dynamic_context_length(request.content)

    if request.company_id and not company_rag_available:
        # Check if company has RAG data
        company_rag_available = has_company_rag(request.company_id)

    if request.company_id and company_rag_available:
        # Check RAG status for richer logging
        rag_status = get_company_rag_status(request.company_id)

    # Cache lookup (after rag status is known)
    cache = get_es_review_cache()
    cache_key = _build_review_cache_key(request, rag_status, rewrite_count, context_length)
    if cache:
        cached = await cache.get_review(cache_key)
        if isinstance(cached, dict):
            return cached

    if request.company_id and company_rag_available:
        # Use enhanced context fetching with hybrid search
        # This provides better results by combining semantic and keyword search
        company_context = await get_enhanced_context_for_review(
            company_id=request.company_id,
            es_content=request.content,
            max_context_length=context_length
        )
        if company_context:
            print(f"[ES添削] ✅ RAGコンテキスト取得完了 ({len(company_context)}文字)")
            print(f"[ES添削] RAG状況: 全{rag_status.get('total_chunks', 0)}チャンク "
                  f"(採用: {rag_status.get('recruitment_chunks', 0)}, "
                  f"IR: {rag_status.get('corporate_ir_chunks', 0)}, "
                  f"事業: {rag_status.get('corporate_business_chunks', 0)}, "
                  f"企業: {rag_status.get('corporate_general_chunks', 0)}, "
                  f"構造化: {rag_status.get('structured_chunks', 0)})")
            if len(company_context) < 200:
                company_context = ""
                company_rag_available = False
        else:
            company_rag_available = False

        record_rag_context(
            company_id=request.company_id,
            context_length=len(company_context),
            source_count=0
        )

    # Branch based on review_mode
    if request.review_mode == "section":
        print(f"[ES添削/セクション] 設問「{request.section_title or '(無題)'}」を添削中 "
              f"({len(request.content)}文字)")

        # Check if template-based review is requested
        if request.template_request:
            print(f"[ES添削/テンプレート] テンプレート添削開始: {request.template_request.template_type}")

            # Fetch RAG context with sources for template review
            rag_context = ""
            rag_sources = []
            if request.company_id and company_rag_available:
                rag_context, rag_sources = await get_enhanced_context_for_review_with_sources(
                    company_id=request.company_id,
                    es_content=request.content,
                    max_context_length=context_length
                )
                print(f"[ES添削/テンプレート] ✅ RAGコンテキスト取得完了 ({len(rag_sources)}ソース)")
                if len(rag_context) < 200 or not rag_sources:
                    rag_context = ""
                    rag_sources = []
                    company_rag_available = False
                record_rag_context(
                    company_id=request.company_id,
                    context_length=len(rag_context),
                    source_count=len(rag_sources)
                )

            result = await review_section_with_template(
                request=request,
                rag_context=rag_context,
                rag_sources=rag_sources,
                company_rag_available=company_rag_available,
            )
            record_es_scores(result.scores.model_dump())
            if cache:
                await cache.set_review(cache_key, result.model_dump())
            return result

        # Standard section review (no template)
        result = await review_section(
            request=request,
            company_context=company_context,
            company_rag_available=company_rag_available
        )
        record_es_scores(result.scores.model_dump())
        if cache:
            await cache.set_review(cache_key, result.model_dump())
        return result

    # Full ES review mode (default)
    print(f"[ES添削] ES全体を添削中 ({len(request.content)}文字)")

    # Build scoring criteria based on RAG availability
    score_criteria = """1. scores (各1-5点):
   - logic: 論理の一貫性（主張と根拠の整合性、因果関係の明確さ）
   - specificity: 具体性（数字、エピソード、固有名詞の使用）
   - passion: 熱意・意欲の伝わり度（モチベーションの説得力）"""

    if company_rag_available:
        score_criteria += """
   - company_connection: 企業接続（企業情報に基づいて評価）
     * 企業の具体的な事業内容・取り組みへの言及があるか
     * 企業の価値観・文化と自身の経験・価値観の接点を示しているか
     * 志望動機が企業の実態に即しているか（表面的な情報ではなく深い理解）
     * 「なぜこの企業なのか」が明確に伝わるか"""

    score_criteria += """
   - readability: 読みやすさ（文章の明瞭さ、構成の分かりやすさ）"""

    # Build rewrite instruction based on style
    style_instructions = {
        "バランス": "バランスの取れた、読みやすい文章に",
        "堅め": "フォーマルで堅実な印象の文章に",
        "個性強め": "個性と独自性が際立つ文章に",
        "短く": "簡潔でコンパクトな文章に",
        "熱意強め": "熱意と意欲が強く伝わる文章に",
        "結論先出し": "結論を先に述べ、根拠を後から示す構成に",
        "具体例強め": "具体的なエピソードや数値を増やした文章に",
        "端的": "端的で要点を押さえた文章に",
    }

    rewrite_instruction = style_instructions.get(request.style, "バランスの取れた文章に")

    # Section feedback instruction (paid only)
    section_feedback_instruction = ""
    if request.is_paid and request.section_data:
        # Use section_data with char limits
        section_items = []
        for s in request.section_data:
            limit_note = f"（文字数制限: {s.char_limit}文字）" if s.char_limit else ""
            section_items.append(f"   - {s.title}{limit_note}")
        section_list = "\n".join(section_items)
        section_feedback_instruction = f"""
4. section_feedbacks: 設問別の指摘と改善例
   以下の各設問について、具体的な改善点と改善例を提供してください:
{section_list}
   - section_title: 設問タイトル
   - feedback: その設問に特化した改善点（100-150字）
   - rewrite: 改善例（文字数制限がある場合はその文字数以内で）"""
    elif request.is_paid and request.sections:
        section_list = "\n".join([f"   - {s}" for s in request.sections])
        section_feedback_instruction = f"""
4. section_feedbacks: 設問別の指摘（100-150字/設問）
   以下の各設問について、具体的な改善点を指摘してください:
{section_list}
   - section_title: 設問タイトル
   - feedback: その設問に特化した改善点（100-150字）"""

    system_prompt = f"""あなたはES（エントリーシート）添削の専門家です。
就活生のESを添削し、具体的で実用的なフィードバックを提供してください。

以下の観点で評価し、必ずJSON形式で回答してください：

{score_criteria}

2. top3: 改善すべき上位3点
   - category: 評価軸の名前（論理、具体性、熱意、{"企業接続、" if company_rag_available else ""}読みやすさ）
   - issue: 具体的な問題点（文章のどこが、なぜ問題か）
   - suggestion: 実践的な改善案（具体的に何をどう変えるか）
   - difficulty: 難易度（easy/medium/hard）
   {"※企業接続の指摘では、提供された企業情報を参照し、『〇〇事業への言及がない』『△△という企業理念との接点が不明確』など、具体的な改善点を示してください" if company_rag_available else ""}

3. rewrites: 改善例（{rewrite_count}パターン）
   - スタイル「{request.style}」に沿って{rewrite_instruction}リライト
   - 元の文章の良い部分は活かしつつ、問題点を改善した文章
   - 元の文章と同程度の長さで
   {"- 企業情報に基づいて、企業の事業内容や価値観と結びつく表現を追加" if company_rag_available else ""}
{section_feedback_instruction}

スコアは厳しめに付けてください（平均3点程度）。
改善案は具体的で、すぐに実践できるものにしてください。

出力形式（必ず有効なJSONで回答）:
{{
  "scores": {{"logic": 3, "specificity": 3, "passion": 3, "readability": 3{', "company_connection": 3' if company_rag_available else ''}}},
  "top3": [
    {{"category": "...", "issue": "...", "suggestion": "...", "difficulty": "easy"}}
  ],
  "rewrites": ["リライト1", "リライト2", ...],
  "section_feedbacks": [{{"section_title": "...", "feedback": "...", "rewrite": "..."}}]
}}"""

    # Build user message with company context if available
    user_message = f"以下のESを添削してください：\n\n{request.content}"
    if company_context:
        user_message = f"""以下のESを添削してください。

**企業情報（RAGから取得）:**
以下は企業の採用ページ、IR情報、事業紹介から抽出した情報です。ESの「企業接続」評価において、これらの情報を参照して具体的なフィードバックを行ってください。

{company_context}

**ES内容:**
{request.content}

**評価のポイント:**
- 企業情報に記載されている事業内容、価値観、求める人材像とESの内容が結びついているか
- 企業の具体的な取り組みや特徴に言及しているか
- 志望動機が企業の実態に即しているか"""

    include_section_feedbacks = bool(request.is_paid and (request.section_data or request.sections))

    # feature="es_review" → automatically selects Claude Sonnet
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=3000,
        temperature=0.3,
        feature="es_review",
        response_format="json_schema",
        json_schema=build_es_review_schema(
            require_company_connection=company_rag_available,
            include_template_review=False,
            include_section_feedbacks=include_section_feedbacks
        ),
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
    )

    if not llm_result.success:
        # Return detailed error to client
        error = llm_result.error
        error_detail = {
            "error": error.message if error else "AI処理中にエラーが発生しました",
            "error_type": error.error_type if error else "unknown",
            "provider": error.provider if error else "unknown",
            "detail": error.detail if error else "",
        }
        raise HTTPException(
            status_code=503,
            detail=error_detail
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM"
            }
        )

    try:
        # Validate and construct response
        scores_data = data.get("scores", {})
        scores = Score(
            logic=max(1, min(5, scores_data.get("logic", 3))),
            specificity=max(1, min(5, scores_data.get("specificity", 3))),
            passion=max(1, min(5, scores_data.get("passion", 3))),
            company_connection=max(1, min(5, scores_data.get("company_connection", 3))) if company_rag_available else None,
            readability=max(1, min(5, scores_data.get("readability", 3))),
        )

        top3_data = data.get("top3", [])
        top3 = _parse_issues(top3_data, 3)

        # Ensure we have 3 issues
        while len(top3) < 3:
            top3.append(Issue(
                category="その他",
                issue="追加の改善点を特定できませんでした",
                suggestion="全体的な見直しを行ってみてください",
                difficulty="medium"
            ))

        # Get rewrites (handle both array and single string)
        rewrites_data = data.get("rewrites", [])
        if isinstance(rewrites_data, str):
            rewrites_data = [rewrites_data]
        rewrites = rewrites_data[:rewrite_count] if rewrites_data else [request.content]

        # Get section feedbacks (paid only)
        section_feedbacks = None
        if request.is_paid and (request.section_data or request.sections):
            sf_data = data.get("section_feedbacks", [])
            if sf_data:
                section_feedbacks = [
                    SectionFeedback(
                        section_title=item.get("section_title", ""),
                        feedback=item.get("feedback", "")[:150],
                        rewrite=item.get("rewrite")  # Include section-specific rewrite
                    )
                    for item in sf_data
                ]

        result = ReviewResponse(
            scores=scores,
            top3=top3,
            rewrites=rewrites,
            section_feedbacks=section_feedbacks
        )
        record_es_scores(result.scores.model_dump())
        if cache:
            await cache.set_review(cache_key, result.model_dump())
        return result

    except Exception as e:
        print(f"[ES添削] ❌ LLM応答解析失敗: {e}")
        record_parse_failure("es_review_full", str(e))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": str(e)
            }
        )
