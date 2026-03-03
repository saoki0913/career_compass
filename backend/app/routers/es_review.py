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

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
import json
import asyncio
import math

from app.config import settings
from app.utils.secure_logger import get_logger
from app.utils.llm import call_llm_with_error, call_llm_streaming_fields, sanitize_es_content
from app.utils.vector_store import (
    get_company_context_for_review,
    get_enhanced_context_for_review,
    get_enhanced_context_for_review_with_sources,
    has_company_rag,
    get_company_rag_status,
    get_dynamic_context_length,
)

logger = get_logger(__name__)
from app.utils.cache import get_es_review_cache, build_cache_key
from app.utils.telemetry import (
    record_es_scores,
    record_parse_failure,
    record_rag_context,
)
from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    build_template_prompt,
    validate_template_output,
)
from app.prompts.es_review_prompts import (
    build_section_review_prompt,
    build_full_review_prompt,
    build_full_review_prompt_streaming,
    build_review_user_message,
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
    role_name: Optional[str] = (
        None  # Role/course name (for role_course_reason template)
    )


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
    # Gakuchika context
    gakuchika_context: Optional[str] = None  # Context from gakuchika deep-dive (key_points, strengths)


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
    why_now: Optional[str] = None  # 今この改善を優先すべき理由
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
            errors.append(
                {
                    "pattern": i,
                    "current": current,
                    "target": char_max,
                    "delta": current - char_max,
                    "direction": "reduce",
                }
            )
        elif char_min and current < char_min:
            errors.append(
                {
                    "pattern": i,
                    "current": current,
                    "target": char_min,
                    "delta": char_min - current,
                    "direction": "expand",
                }
            )
    return errors


def build_char_adjustment_prompt(
    variant_errors: list[dict],
    char_min: Optional[int],
    char_max: Optional[int],
) -> str:
    """
    Build specific adjustment instructions for each failing variant.

    Enhanced with:
    - Structural compression strategies for Japanese text
    - Safety margin approach (aim for 5% below limit)
    - Detailed compression/expansion techniques

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
        target = err["target"]
        delta = err["delta"]
        direction = err["direction"]

        # Calculate safety margin (aim for 10% below/above limit)
        if direction == "reduce":
            safety_target = int(target * 0.90)
            safety_delta = current - safety_target
            instructions.append(
                f"パターン{pattern_num}: 現在{current}字 → 目標{safety_target}字以下（余裕を持って{safety_delta}字削減）\n"
                f"  【削減手順】\n"
                f"  1. 冗長な接続表現を削除\n"
                f"     - 「〜ということ」→「〜こと」\n"
                f"     - 「〜させていただく」→「〜する」\n"
                f"     - 「〜することができる」→「〜できる」\n"
                f"  2. 重複する修飾語を統合\n"
                f"     - 「非常に大きな」→「大きな」\n"
                f"  3. 数値・固有名詞は残し、抽象的な形容詞を削減"
            )
        else:  # expand
            safety_target = int(target * 1.05)
            safety_delta = safety_target - current
            instructions.append(
                f"パターン{pattern_num}: 現在{current}字 → 目標{safety_target}字以上（余裕を持って{safety_delta}字追加）\n"
                f"  【追加手順】\n"
                f"  1. 具体的な数値を追加（期間、人数、成果の数字）\n"
                f"  2. 状況説明を追加（「〜の状況下で」「〜という課題に直面し」）\n"
                f"  3. 学びの補強（「この経験から〜を学んだ」）"
            )

    # Build constraint description
    if char_min and char_max:
        constraint = f"{char_min}〜{char_max}字"
    elif char_max:
        constraint = f"{char_max}字以内"
    else:
        constraint = f"{char_min}字以上"

    return f"""【文字数調整 - 以下の手順で段階的に修正】

{chr(10).join(instructions)}

【重要ルール】
1. 修正後に必ず len(text) で文字数を計算
2. char_count には実際の文字数を正確に記録
3. 目標: {constraint}
4. JSON構造は変更せず、variants[*].text のみ修正
5. 意味を大きく変えずに調整（具体性は維持）"""


def validate_and_repair_section_rewrite(
    rewrite: Optional[str],
    char_limit: Optional[int],
) -> Optional[str]:
    """
    Validate section rewrite against character limit and repair if needed.

    This ensures that section rewrites respect the specified character limit,
    making them directly usable by the user without further editing.

    Args:
        rewrite: The rewrite text to validate
        char_limit: Maximum character count (optional)

    Returns:
        Validated rewrite, truncated at natural boundary if over limit
    """
    if rewrite is None or char_limit is None:
        return rewrite

    current_len = len(rewrite)
    if current_len <= char_limit:
        return rewrite

    # Over limit - attempt smart truncation at natural break points
    # Japanese sentence endings: 。、）」
    target_pos = char_limit - 5  # Leave margin for clean ending

    # Look for natural break point (sentence end) near target
    for i in range(target_pos, max(0, target_pos - 50), -1):
        if i < len(rewrite) and rewrite[i] in ("。", "、", "）", "」"):
            return rewrite[: i + 1]

    # No natural break found - truncate with ellipsis indicator
    return rewrite[: char_limit - 3] + "..."


def deterministic_truncate_variant(variant: dict, char_max: int) -> dict:
    """
    Deterministic truncation at natural Japanese sentence boundaries.

    Fallback order: 。 → 、/）/」 → hard cut.
    Search window: last 15% of char_max.
    """
    text = variant.get("text", "")
    if len(text) <= char_max:
        return variant

    target_pos = char_max - 1
    search_start = max(0, target_pos - int(char_max * 0.15))

    # Priority 1: sentence end (。)
    best_break = -1
    for i in range(target_pos, search_start, -1):
        if i < len(text) and text[i] == "。":
            best_break = i
            break

    if best_break > 0:
        truncated = text[: best_break + 1]
    else:
        # Priority 2: clause break (、）」)
        for i in range(target_pos, search_start, -1):
            if i < len(text) and text[i] in ("、", "）", "」"):
                best_break = i
                break
        if best_break > 0:
            truncated = text[: best_break + 1]
        else:
            # Priority 3: hard cut
            truncated = text[:char_max]

    result = dict(variant)
    result["text"] = truncated
    result["char_count"] = len(truncated)
    return result


def apply_deterministic_fallback(
    template_review_data: dict,
    char_min: Optional[int],
    char_max: Optional[int],
    rewrite_count: int,
) -> tuple[dict, list[str]]:
    """
    Apply deterministic fixes to make template_review_data pass validation.

    Handles:
    - Variant count mismatch (duplicate first variant)
    - Character limit overflow (smart truncation)
    - char_count field correction

    Returns:
        Tuple of (fixed template_review_data, list of warning messages)
    """
    warnings = []
    variants = template_review_data.get("variants", [])

    # Fix variant count: duplicate first variant if insufficient
    if 0 < len(variants) < rewrite_count:
        while len(variants) < rewrite_count:
            variants.append(dict(variants[0]))
        warnings.append("パターン数不足のため補完")
        template_review_data["variants"] = variants

    # Fix char limits and char_count
    for i, variant in enumerate(variants):
        variant["char_count"] = len(variant.get("text", ""))
        if char_max and len(variant.get("text", "")) > char_max:
            original_len = len(variant["text"])
            variants[i] = deterministic_truncate_variant(variant, char_max)
            warnings.append(
                f"パターン{i + 1}: {original_len}字→{len(variants[i]['text'])}字に自動調整"
            )

    template_review_data["variants"] = variants
    return template_review_data, warnings


def should_attempt_conditional_retry(
    template_review_data: dict,
    char_min: Optional[int],
    char_max: Optional[int],
    rewrite_count: int = 3,
) -> tuple[bool, list[int]]:
    """
    Determine if a conditional retry is worthwhile based on partial success.

    For multiple variants: returns True if at least 2 pass character validation.
    For single variant: not applicable (main retry loop handles it).

    Args:
        template_review_data: The template_review dict from LLM response
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)
        rewrite_count: Expected number of variants

    Returns:
        Tuple of (should_retry, failing_variant_indices)
    """
    variants = template_review_data.get("variants", [])
    if len(variants) != rewrite_count:
        return False, []

    # Single variant: retry if it fails char limits
    if rewrite_count == 1:
        if len(variants) == 1:
            text = variants[0].get("text", "")
            char_count = len(text)
            if (char_max and char_count > char_max) or (char_min and char_count < char_min):
                return True, [0]
        return False, []

    failing_indices = []

    for i, variant in enumerate(variants):
        text = variant.get("text", "")
        char_count = len(text)

        # Check if this variant fails character limits
        if char_max and char_count > char_max:
            failing_indices.append(i)
        elif char_min and char_count < char_min:
            failing_indices.append(i)

    # Worth retrying if at least 2 variants pass (only minority fail)
    passing_count = len(variants) - len(failing_indices)
    should_retry = passing_count >= 2 and len(failing_indices) > 0

    return should_retry, failing_indices


def build_targeted_variant_repair_prompt(
    template_review_data: dict,
    failing_indices: list[int],
    char_min: Optional[int],
    char_max: Optional[int],
) -> str:
    """
    Build a repair prompt targeting only the failing variants.

    This allows more focused repair with lower token usage.

    Args:
        template_review_data: The template_review dict from LLM response
        failing_indices: List of variant indices that need repair
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)

    Returns:
        Repair prompt string
    """
    variants = template_review_data.get("variants", [])
    repairs_needed = []

    for idx in failing_indices:
        if idx >= len(variants):
            continue
        variant = variants[idx]
        current_len = len(variant.get("text", ""))

        if char_max and current_len > char_max:
            excess = current_len - char_max
            repairs_needed.append(
                f"variants[{idx}]: {current_len}字 → {char_max}字以下に{excess}字削減"
            )
        elif char_min and current_len < char_min:
            shortage = char_min - current_len
            repairs_needed.append(
                f"variants[{idx}]: {current_len}字 → {char_min}字以上に{shortage}字追加"
            )

    return f"""以下のJSONのうち、指定されたvariantsの文字数のみ修正してください。

【修正対象】
{chr(10).join(repairs_needed)}

【修正ルール】
1. 指定されたパターンのtextのみ修正
2. 他のパターン・フィールドは一切変更しない
3. char_countには修正後のlen(text)を記録
4. JSON以外は出力しない

【修正テクニック】
- 削減: 「〜ということ」→「〜こと」「〜させていただく」→「〜する」
- 追加: 具体的な数値、状況説明、学びの補強

対象JSON:
{json.dumps(template_review_data, ensure_ascii=False)}"""


def build_es_review_schema(
    require_company_connection: bool,
    include_template_review: bool,
    include_section_feedbacks: bool,
    include_rewrites: bool = True,
    top3_max_items: int = 3,
    keyword_source_excerpt_required: bool = True,
    variant_count: int = 3,
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
        "required": ["category", "issue", "suggestion", "why_now", "difficulty"],
        "properties": {
            "category": {"type": "string"},
            "issue": {"type": "string"},
            "suggestion": {"type": "string"},
            "why_now": {"type": "string"},
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
        "required": [
            "text",
            "char_count",
            "pros",
            "cons",
            "keywords_used",
            "keyword_sources",
        ],
        "properties": {
            "text": {"type": "string"},
            "char_count": {"type": "integer"},
            "pros": {"type": "array", "items": {"type": "string"}},
            "cons": {"type": "array", "items": {"type": "string"}},
            "keywords_used": {"type": "array", "items": {"type": "string"}},
            "keyword_sources": {"type": "array", "items": {"type": "string"}},
        },
    }

    keyword_source_required = ["source_id", "source_url", "content_type"]
    if keyword_source_excerpt_required:
        keyword_source_required.append("excerpt")

    keyword_source_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": keyword_source_required,
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
        "required": [
            "template_type",
            "variants",
            "keyword_sources",
            "strengthen_points",
        ],
        "properties": {
            "template_type": {"type": "string"},
            "variants": {
                "type": "array",
                "items": variant_schema,
                "minItems": variant_count,
                "maxItems": variant_count,
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
            "maxItems": top3_max_items,
        },
        "streaming_rewrite": {"type": "string"},
    }

    required = ["scores", "top3"]
    if include_rewrites:
        properties["rewrites"] = {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": settings.es_rewrite_count,
        }
        required.append("rewrites")

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
    return mapping.get(
        normalized, normalized if normalized in DIFFICULTY_LEVELS else None
    )


def _parse_issues(items: list[dict], max_items: int) -> list[Issue]:
    issues: list[Issue] = []
    for item in items[:max_items]:
        issues.append(
            Issue(
                category=item.get("category", "その他"),
                issue=item.get("issue", ""),
                suggestion=item.get("suggestion", ""),
                why_now=item.get("why_now", ""),
                difficulty=_normalize_difficulty(item.get("difficulty")) or "medium",
            )
        )
    return issues


def _build_review_cache_key(
    request: ReviewRequest,
    rag_status: Optional[dict],
    rewrite_count: int,
    context_length: Optional[int] = None,
) -> str:
    template_payload = (
        request.template_request.model_dump() if request.template_request else None
    )
    section_data_payload = (
        [s.model_dump() for s in request.section_data] if request.section_data else None
    )
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
        (
            json.dumps(section_data_payload, ensure_ascii=False)
            if section_data_payload
            else ""
        ),
        json.dumps(template_payload, ensure_ascii=False) if template_payload else "",
        request.company_id or "",
        str(request.has_company_rag),
    ]
    if rag_status:
        parts.append(str(rag_status.get("last_updated") or ""))
        parts.append(str(rag_status.get("total_chunks") or ""))
    return build_cache_key(*parts)


def _evaluate_template_rag_availability(
    rag_context: str, rag_sources: list[dict], min_context_length: int
) -> tuple[bool, str]:
    """
    Evaluate template RAG availability.

    Returns:
        tuple[available, reason]
        reason: "ok" | "context_short" | "sources_missing_but_continue"
    """
    context_len = len(rag_context) if rag_context else 0
    if context_len < max(0, min_context_length):
        return False, "context_short"
    if not rag_sources:
        return True, "sources_missing_but_continue"
    return True, "ok"


def _resolve_template_keyword_count(
    template_type: str,
    requires_company_rag: bool,
    default_keyword_count: int,
    company_rag_available: bool,
    rag_sources: list[dict],
) -> tuple[int, Optional[str]]:
    """
    Resolve effective keyword_count for template review.

    Returns:
        tuple[keyword_count, fallback_reason]
        fallback_reason: None | "rag_unavailable" | "sources_missing"
    """
    _ = template_type
    if requires_company_rag and not company_rag_available:
        return 0, "rag_unavailable"
    if company_rag_available and default_keyword_count > 0 and not rag_sources:
        return 0, "sources_missing"
    return default_keyword_count, None


async def review_section_with_template(
    request: ReviewRequest,
    rag_context: str,
    rag_sources: list[dict],
    company_rag_available: bool,
    progress_queue: "asyncio.Queue | None" = None,
) -> ReviewResponse:
    """
    Review a single ES section using template-based prompts.

    This provides template-specific feedback with:
    - Pattern variants with pros/cons
    - Company keyword extraction from RAG
    - Character limit enforcement
    - Optional strengthen points

    Uses a retry loop to ensure output validation passes.
    When progress_queue is provided, streams LLM progress on the first attempt.
    """
    template_request = request.template_request
    if not template_request:
        raise ValueError("template_request is required")

    template_type = template_request.template_type
    if template_type not in TEMPLATE_DEFS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template type: {template_type}. Available: {list(TEMPLATE_DEFS.keys())}",
        )

    template_def = TEMPLATE_DEFS[template_type]
    keyword_count, keyword_fallback_reason = _resolve_template_keyword_count(
        template_type=template_type,
        requires_company_rag=template_def["requires_company_rag"],
        default_keyword_count=template_def["keyword_count"],
        company_rag_available=company_rag_available,
        rag_sources=rag_sources,
    )

    # Character limits
    char_min = template_request.char_min
    char_max = template_request.char_max

    # Check if template requires company RAG but none available
    if keyword_fallback_reason == "rag_unavailable":
        logger.warning(
            f"[ES添削/テンプレート] ⚠️ テンプレート {template_type} は RAG 必須だが利用不可 - キーワードなしで続行"
        )
    elif keyword_fallback_reason == "sources_missing":
        logger.warning(
            f"[ES添削/テンプレート] ⚠️ テンプレート {template_type} は RAG本文ありだが出典不足 - キーワード抽出なしで続行"
        )

    # Template-based section review always returns a single complete draft.
    rewrite_count = 1

    # Build prompts (apply safety margin to reduce overflow risk)
    prompt_char_min = char_min
    prompt_char_max = char_max
    if char_max:
        safe_max = int(char_max * 0.90)
        if char_min:
            safe_max = max(char_min, safe_max)
        if safe_max > 0:
            prompt_char_max = min(char_max, safe_max)

    system_prompt, user_prompt = build_template_prompt(
        template_type=template_type,
        company_name=template_request.company_name,
        industry=template_request.industry,
        question=template_request.question,
        answer=template_request.answer,
        char_min=prompt_char_min,
        char_max=prompt_char_max,
        rag_sources=rag_sources,
        rag_context=rag_context,
        keyword_count=keyword_count,
        has_rag=company_rag_available,
        intern_name=template_request.intern_name,
        role_name=template_request.role_name,
        rewrite_count=rewrite_count,
    )

    # Retry loop for validation
    # Optimize retries and tokens based on rewrite_count
    if rewrite_count == 1:
        max_retries = settings.es_template_max_retries  # Same as multi-variant
        template_max_tokens = 2500  # 1 variant: ~400-800 chars + JSON structure
    else:
        max_retries = settings.es_template_max_retries
        template_max_tokens = 6000  # 3 variants: ~1200-2400 chars total + JSON
    retry_reason = ""
    last_template_review_data = None  # Track for conditional retry

    # Estimated max output chars for progress calculation
    estimated_max_chars = template_max_tokens * 3  # rough chars-per-token estimate

    for attempt in range(max_retries):
        # Add retry reason if not first attempt
        current_user_prompt = user_prompt
        if retry_reason:
            current_user_prompt += (
                f"\n\n【前回のエラー - 以下を修正してください】\n{retry_reason}"
            )

        logger.warning(
            f"[ES添削/テンプレート] テンプレート {template_type} 試行 {attempt + 1}/{max_retries}"
        )

        # First attempt: use field streaming for real-time progress and draft preview
        if attempt == 0 and progress_queue is not None:
            llm_result = None
            accumulated_len = 0
            async for event in call_llm_streaming_fields(
                system_prompt=system_prompt,
                user_message=current_user_prompt,
                max_tokens=template_max_tokens,
                temperature=0.4,
                feature="es_review",
                schema_hints={
                    "scores": "object",
                    "top3": "array",
                    "rewrites": "array",
                    "streaming_rewrite": "string",
                    "template_review": "object",
                },
                stream_string_fields=["streaming_rewrite"],
            ):
                if event.type == "chunk":
                    accumulated_len += len(event.text)
                    progress = 35 + int(50 * min(accumulated_len / estimated_max_chars, 1.0))
                    try:
                        progress_queue.put_nowait(("progress", {
                            "step": "rewrite",
                            "progress": progress,
                            "label": "改善案を作成中...",
                            "subLabel": "設問に合う表現へ整えています",
                        }))
                    except asyncio.QueueFull:
                        pass
                elif event.type == "string_chunk":
                    try:
                        progress_queue.put_nowait(("string_chunk", {
                            "path": event.path,
                            "text": event.text,
                        }))
                    except asyncio.QueueFull:
                        pass
                elif event.type == "complete":
                    llm_result = event.result
                elif event.type == "error":
                    llm_result = event.result
                    break
        else:
            # Retries: use blocking call (faster, no streaming needed)
            llm_result = await call_llm_with_error(
                system_prompt=system_prompt,
                user_message=current_user_prompt,
                max_tokens=template_max_tokens,
                temperature=0.4,  # Slightly higher for variety
                feature="es_review",
                response_format="json_schema",
                json_schema=build_es_review_schema(
                    require_company_connection=company_rag_available,
                    include_template_review=True,
                    include_section_feedbacks=False,
                    include_rewrites=True,
                    top3_max_items=2,
                    keyword_source_excerpt_required=False,
                    variant_count=rewrite_count,
                ),
                use_responses_api=True,
                retry_on_parse=True,
                parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。",
                disable_fallback=True,
            )

        if not llm_result.success:
            error = llm_result.error
            raise HTTPException(
                status_code=503,
                detail={
                    "error": (
                        error.message if error else "AI処理中にエラーが発生しました"
                    ),
                    "error_type": error.error_type if error else "unknown",
                    "provider": error.provider if error else "unknown",
                    "detail": error.detail if error else "",
                },
            )

        data = llm_result.data
        if data is None:
            retry_reason = (
                "AIからの応答を解析できませんでした。有効なJSONで回答してください。"
            )
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
            rewrite_count=rewrite_count,
        )

        # Attempt text-only repair for char limit failures (both over and under limits)
        if (not is_valid) and error_reason and "文字" in error_reason:
            variants = template_review_data.get("variants", [])
            variant_errors = parse_validation_errors(variants, char_min, char_max)

            if variant_errors:
                repaired_any = False
                for err in variant_errors:
                    idx = err["pattern"] - 1  # 1-indexed → 0-indexed
                    if idx >= len(variants):
                        continue
                    variant = variants[idx]
                    original_text = variant.get("text", "")
                    target = err["target"]
                    direction = err["direction"]

                    if direction == "reduce":
                        safety_target = max(1, int(target * 0.97))
                        repair_prompt = f"""以下の文章を{safety_target}字以内に短縮してください。
意味を保ち、具体的な数値やエピソードは残してください。
だ・である調を維持してください。
未完の文で終えず、設問への答え・根拠・企業や経験との接点を残してください。
短縮後のテキストのみ出力し、それ以外は一切出力しないでください。

---
{original_text}
---"""
                    else:  # expand
                        safety_target = int(target * 1.03)
                        repair_prompt = f"""以下の文章を{safety_target}字以上に拡充してください。
不足している根拠、具体的な状況説明、学びのみを補ってください。
だ・である調を維持してください。
冗長に膨らませず、完成した回答文として自然に終えてください。
拡充後のテキストのみ出力し、それ以外は一切出力しないでください。

---
{original_text}
---"""

                    repair_result = await call_llm_with_error(
                        system_prompt="あなたは日本語の文章編集の専門家です。指示通りに文章を修正し、修正後のテキストのみ出力してください。",
                        user_message=repair_prompt,
                        max_tokens=2000,
                        temperature=0.2,
                        feature="es_review",
                        disable_fallback=True,
                    )

                    # Extract raw text from response (plain text, not JSON)
                    repaired_text = None
                    if repair_result.raw_text:
                        repaired_text = repair_result.raw_text.strip()
                    elif repair_result.success and repair_result.data:
                        # LLM returned JSON - try to extract text
                        d = repair_result.data
                        repaired_text = (
                            d.get("text")
                            or d.get("variants", [{}])[0].get("text")
                            if isinstance(d, dict) else str(d)
                        )

                    if repaired_text:
                        # Clean markdown code blocks
                        if repaired_text.startswith("```"):
                            lines = repaired_text.split("\n")
                            repaired_text = "\n".join(
                                l for l in lines if not l.strip().startswith("```")
                            ).strip()
                        # Remove surrounding quotes
                        if repaired_text.startswith('"') and repaired_text.endswith('"'):
                            repaired_text = repaired_text[1:-1]

                        variant["text"] = repaired_text
                        variant["char_count"] = len(repaired_text)
                        repaired_any = True
                        logger.warning(
                            f"[ES添削/テンプレート] パターン{idx+1}修復: "
                            f"{len(original_text)}字→{len(repaired_text)}字"
                        )

                if repaired_any:
                    is_valid, error_reason = validate_template_output(
                        template_review_data,
                        char_min=char_min,
                        char_max=char_max,
                        rewrite_count=rewrite_count,
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
                    company_connection=(
                        max(1, min(5, scores_data.get("company_connection", 3)))
                        if company_rag_available
                        else None
                    ),
                    readability=max(1, min(5, scores_data.get("readability", 3))),
                )

                # Parse top3 (1-2 issues for section)
                top3_data = data.get("top3", [])
                top3 = _parse_issues(top3_data, 2)
                if not top3:
                    top3 = [
                        Issue(
                            category="その他",
                            issue="改善点を特定できませんでした",
                            suggestion="全体的な見直しを行ってみてください",
                            why_now="優先改善点が不明なため、全体の論旨を先に整えると品質が安定するため",
                            difficulty="medium",
                        )
                    ]

                # Get rewrites from data or template variants
                rewrites_data = data.get("rewrites", [])
                if isinstance(rewrites_data, str):
                    rewrites_data = [rewrites_data]
                if not rewrites_data:
                    # Use template variants as rewrites
                    rewrites_data = [
                        v.get("text", "")
                        for v in template_review_data.get("variants", [])
                    ]
                rewrites = rewrites_data[:rewrite_count]

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
                    strengthen_points = template_review_data.get(
                        "strengthen_points", []
                    )

                template_review = TemplateReview(
                    template_type=template_type,
                    variants=variants,
                    keyword_sources=keyword_sources,
                    strengthen_points=strengthen_points,
                )

                logger.info(f"[ES添削/テンプレート] ✅ 試行 {attempt + 1} で成功")
                return ReviewResponse(
                    scores=scores,
                    top3=top3,
                    rewrites=rewrites,
                    section_feedbacks=None,
                    template_review=template_review,
                )

            except Exception as e:
                logger.error(f"[ES添削/テンプレート] ❌ 試行 {attempt + 1} 解析エラー: {e}")
                retry_reason = f"レスポンスの解析に失敗しました: {str(e)}"
                continue
        else:
            logger.warning(
                f"[ES添削/テンプレート] ⚠️ 試行 {attempt + 1} 検証失敗: {error_reason}"
            )
            # Track for potential conditional retry
            last_template_review_data = template_review_data

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

    # Main retries exhausted - attempt conditional retry if enabled and worthwhile
    if (
        settings.es_enable_conditional_retry
        and last_template_review_data
        and "文字" in retry_reason
    ):
        should_retry, failing_indices = should_attempt_conditional_retry(
            last_template_review_data, char_min, char_max, rewrite_count=rewrite_count
        )

        if should_retry:
            logger.warning(
                f"[ES添削/テンプレート] 🔄 条件付きリトライ: {len(failing_indices)}/{rewrite_count} パターンのみ修正"
            )

            # Build targeted repair prompt
            repair_prompt = build_targeted_variant_repair_prompt(
                last_template_review_data, failing_indices, char_min, char_max
            )

            repair_result = await call_llm_with_error(
                system_prompt="あなたはJSON修復の専門家です。指定されたパターンの文字数のみ修正してください。",
                user_message=repair_prompt,
                max_tokens=2000,  # Reduced - only fixing specific variants
                temperature=0.2,
                feature="es_review",
                disable_fallback=True,
            )

            if repair_result.success and repair_result.data:
                repaired_data = repair_result.data
                repaired_template = (
                    repaired_data.get("template_review") or repaired_data
                )

                # Validate the repaired output
                is_valid, repair_error = validate_template_output(
                    repaired_template,
                    char_min=char_min,
                    char_max=char_max,
                    rewrite_count=rewrite_count,
                )

                if is_valid:
                    logger.info("[ES添削/テンプレート] ✅ 条件付きリトライ成功")

                    # Build and return successful response
                    scores_data = data.get("scores", {}) if data else {}
                    scores = Score(
                        logic=max(1, min(5, scores_data.get("logic", 3))),
                        specificity=max(1, min(5, scores_data.get("specificity", 3))),
                        passion=max(1, min(5, scores_data.get("passion", 3))),
                        company_connection=(
                            max(1, min(5, scores_data.get("company_connection", 3)))
                            if company_rag_available
                            else None
                        ),
                        readability=max(1, min(5, scores_data.get("readability", 3))),
                    )

                    top3_data = data.get("top3", []) if data else []
                    top3 = _parse_issues(top3_data, 2)
                    if not top3:
                        top3 = [
                            Issue(
                                category="その他",
                                issue="改善点を特定できませんでした",
                                suggestion="全体的な見直しを行ってみてください",
                                why_now="優先改善点が不明なため、全体の論旨を先に整えると品質が安定するため",
                                difficulty="medium",
                            )
                        ]

                    variants_data = repaired_template.get("variants", [])
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

                    keyword_sources_data = repaired_template.get("keyword_sources", [])
                    keyword_sources = [
                        TemplateSource(
                            source_id=src.get("source_id", ""),
                            source_url=src.get("source_url", ""),
                            content_type=src.get("content_type", ""),
                            excerpt=src.get("excerpt"),
                        )
                        for src in keyword_sources_data
                    ]

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

                    strengthen_points = None
                    if template_def.get("require_strengthen_points"):
                        strengthen_points = repaired_template.get(
                            "strengthen_points", []
                        )

                    template_review = TemplateReview(
                        template_type=template_type,
                        variants=variants,
                        keyword_sources=keyword_sources,
                        strengthen_points=strengthen_points,
                    )

                    rewrites = [v.get("text", "") for v in variants_data]

                    return ReviewResponse(
                        scores=scores,
                        top3=top3,
                        rewrites=rewrites,
                        section_feedbacks=None,
                        template_review=template_review,
                    )
                else:
                    logger.warning(
                        f"[ES添削/テンプレート] ⚠️ 条件付きリトライも失敗: {repair_error}"
                    )

    # All retries exhausted - fail explicitly rather than returning truncated output.
    record_parse_failure("es_review_template", retry_reason)

    if last_template_review_data is None:
        # No usable data at all - truly unrecoverable
        raise HTTPException(
            status_code=422,
            detail={
                "error": "テンプレート出力の検証に失敗しました。条件を満たす出力を生成できませんでした。",
                "error_type": "validation",
                "provider": "template_review",
                "detail": retry_reason,
            },
        )

    raise HTTPException(
        status_code=422,
        detail={
            "error": "文字数制約に収まる完成稿を生成できませんでした。条件を調整して再実行してください。",
            "error_type": "validation",
            "provider": "template_review",
            "detail": retry_reason,
        },
    )


async def review_section(
    request: ReviewRequest, company_context: str, company_rag_available: bool
) -> ReviewResponse:
    """
    Review a single ES section (question).

    This provides focused feedback on one specific question/section.
    """
    # Sanitize ES content to prevent prompt injection
    request.content = sanitize_es_content(request.content, max_length=5000)

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
    rewrite_instruction = style_instructions.get(
        request.style, "バランスの取れた文章に"
    )

    # Character limit instruction
    char_limit_instruction = ""
    if request.section_char_limit:
        char_limit_instruction = (
            f"   - 文字数制限: {request.section_char_limit}文字以内に収めてください"
        )

    system_prompt = build_section_review_prompt(
        section_title=request.section_title or "（タイトルなし）",
        section_char_limit=request.section_char_limit,
        score_criteria=score_criteria,
        company_rag_available=company_rag_available,
        rewrite_instruction=rewrite_instruction,
        style=request.style,
        char_limit_instruction=char_limit_instruction,
    )

    # Build user message
    user_message = build_review_user_message(
        content=request.content,
        company_context=company_context,
        gakuchika_context=request.gakuchika_context,
        section_title=request.section_title or "（タイトルなし）",
        section_char_limit=request.section_char_limit,
    )

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
            include_section_feedbacks=False,
        ),
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。",
        disable_fallback=True,
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
            },
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM",
            },
        )

    try:
        # Parse response
        scores_data = data.get("scores", {})
        scores = Score(
            logic=max(1, min(5, scores_data.get("logic", 3))),
            specificity=max(1, min(5, scores_data.get("specificity", 3))),
            passion=max(1, min(5, scores_data.get("passion", 3))),
            company_connection=(
                max(1, min(5, scores_data.get("company_connection", 3)))
                if company_rag_available
                else None
            ),
            readability=max(1, min(5, scores_data.get("readability", 3))),
        )

        # Get 1-2 issues for section review
        top3_data = data.get("top3", [])
        top3 = _parse_issues(top3_data, 2)

        # Ensure we have at least 1 issue
        if not top3:
            top3 = [
                Issue(
                    category="その他",
                    issue="改善点を特定できませんでした",
                    suggestion="全体的な見直しを行ってみてください",
                    why_now="優先改善点が不明なため、全体の論旨を先に整えると品質が安定するため",
                    difficulty="medium",
                )
            ]

        # Get single rewrite
        rewrites_data = data.get("rewrites", [])
        if isinstance(rewrites_data, str):
            rewrites_data = [rewrites_data]
        rewrites = rewrites_data[:1] if rewrites_data else [request.content]

        return ReviewResponse(
            scores=scores,
            top3=top3,
            rewrites=rewrites,
            section_feedbacks=None,  # Not used in section mode
        )

    except Exception as e:
        logger.error(f"[ES添削/セクション] ❌ LLM応答解析失敗: {e}")
        record_parse_failure("es_review_section", str(e))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": str(e),
            },
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
            detail="ESの内容が短すぎます。もう少し詳しく書いてから添削をリクエストしてください。",
        )

    # Validate review_mode
    if request.review_mode not in ("full", "section"):
        raise HTTPException(
            status_code=400,
            detail="review_modeは 'full' または 'section' を指定してください",
        )

    # Validate style based on plan
    available_styles = PAID_STYLES if request.is_paid else FREE_STYLES
    if request.style not in available_styles:
        raise HTTPException(
            status_code=400, detail=f"利用可能なスタイル: {', '.join(available_styles)}"
        )

    # Cap rewrite count based on plan
    rewrite_count = min(request.rewrite_count, settings.es_rewrite_count if request.is_paid else 1)

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
    cache_key = _build_review_cache_key(
        request, rag_status, rewrite_count, context_length
    )
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
            max_context_length=context_length,
        )

        # Validate context before logging success (Bug #7 fix)
        min_context_length = max(0, settings.rag_min_context_chars)
        if company_context and len(company_context) >= min_context_length:
            logger.info(f"[ES添削] ✅ RAGコンテキスト取得完了 ({len(company_context)}文字)")
            logger.warning(
                f"[ES添削] RAG状況: 全{rag_status.get('total_chunks', 0)}チャンク "
                f"(新卒: {rag_status.get('new_grad_recruitment_chunks', 0)}, "
                f"中途: {rag_status.get('midcareer_recruitment_chunks', 0)}, "
                f"企業HP: {rag_status.get('corporate_site_chunks', 0)}, "
                f"IR: {rag_status.get('ir_materials_chunks', 0)}, "
                f"社長: {rag_status.get('ceo_message_chunks', 0)}, "
                f"社員INT: {rag_status.get('employee_interviews_chunks', 0)}, "
                f"PR: {rag_status.get('press_release_chunks', 0)}, "
                f"CSR: {rag_status.get('csr_sustainability_chunks', 0)}, "
                f"中計: {rag_status.get('midterm_plan_chunks', 0)})"
            )
        else:
            context_len = len(company_context) if company_context else 0
            logger.warning(
                f"[ES添削] ⚠️ RAGコンテキスト不足 ({context_len}文字 < {min_context_length}文字の閾値)"
            )
            company_context = ""
            company_rag_available = False

        record_rag_context(
            company_id=request.company_id,
            context_length=len(company_context),
            source_count=(
                rag_status.get("total_chunks", 0) if company_rag_available else 0
            ),
        )

    # Branch based on review_mode
    if request.review_mode == "section":
        logger.warning(
            f"[ES添削/セクション] 設問「{request.section_title or '(無題)'}」を添削中 "
            f"({len(request.content)}文字)"
        )

        # Check if template-based review is requested
        if request.template_request:
            logger.warning(
                f"[ES添削/テンプレート] テンプレート添削開始: {request.template_request.template_type}"
            )

            # Fetch RAG context with sources for template review
            rag_context = ""
            rag_sources = []
            if request.company_id and company_rag_available:
                rag_context, rag_sources = (
                    await get_enhanced_context_for_review_with_sources(
                        company_id=request.company_id,
                        es_content=request.content,
                        max_context_length=context_length,
                    )
                )
                logger.warning(
                    f"[ES添削/テンプレート] ✅ RAGコンテキスト取得完了 ({len(rag_sources)}ソース)"
                )
                min_context_length = max(0, settings.rag_min_context_chars)
                is_rag_available, rag_reason = _evaluate_template_rag_availability(
                    rag_context=rag_context,
                    rag_sources=rag_sources,
                    min_context_length=min_context_length,
                )
                logger.warning(
                    f"[ES添削/テンプレート] RAG判定: context_len={len(rag_context)} "
                    f"source_count={len(rag_sources)} min_context={min_context_length} "
                    f"result={rag_reason}"
                )
                if not is_rag_available:
                    rag_context = ""
                    rag_sources = []
                    company_rag_available = False
                elif not rag_sources:
                    logger.warning(
                        "[ES添削/テンプレート] ⚠️ RAG本文は利用可だが出典情報不足 - "
                        "企業接続評価は継続しキーワード抽出はフォールバック"
                    )
                record_rag_context(
                    company_id=request.company_id,
                    context_length=len(rag_context),
                    source_count=len(rag_sources),
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
            company_rag_available=company_rag_available,
        )
        record_es_scores(result.scores.model_dump())
        if cache:
            await cache.set_review(cache_key, result.model_dump())
        return result

    # Full ES review mode (default)
    logger.info(f"[ES添削] ES全体を添削中 ({len(request.content)}文字)")

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

    rewrite_instruction = style_instructions.get(
        request.style, "バランスの取れた文章に"
    )

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

    system_prompt = build_full_review_prompt(
        score_criteria=score_criteria,
        company_rag_available=company_rag_available,
        rewrite_count=rewrite_count,
        rewrite_instruction=rewrite_instruction,
        style=request.style,
        section_feedback_instruction=section_feedback_instruction,
    )

    # Build user message with company context if available
    user_message = build_review_user_message(
        content=request.content,
        company_context=company_context,
        gakuchika_context=request.gakuchika_context,
    )

    include_section_feedbacks = bool(
        request.is_paid and (request.section_data or request.sections)
    )

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
            include_section_feedbacks=include_section_feedbacks,
        ),
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。",
        disable_fallback=True,
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
        raise HTTPException(status_code=503, detail=error_detail)

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM",
            },
        )

    try:
        # Validate and construct response
        scores_data = data.get("scores", {})
        scores = Score(
            logic=max(1, min(5, scores_data.get("logic", 3))),
            specificity=max(1, min(5, scores_data.get("specificity", 3))),
            passion=max(1, min(5, scores_data.get("passion", 3))),
            company_connection=(
                max(1, min(5, scores_data.get("company_connection", 3)))
                if company_rag_available
                else None
            ),
            readability=max(1, min(5, scores_data.get("readability", 3))),
        )

        top3_data = data.get("top3", [])
        top3 = _parse_issues(top3_data, 3)

        # Ensure we have 3 issues
        while len(top3) < 3:
            top3.append(
                Issue(
                    category="その他",
                    issue="追加の改善点を特定できませんでした",
                    suggestion="全体的な見直しを行ってみてください",
                    why_now="他の指摘を優先しつつ、全体見直しで再発防止効果が高いため",
                    difficulty="medium",
                )
            )

        # Get rewrites (handle both array and single string)
        rewrites_data = data.get("rewrites", [])
        if isinstance(rewrites_data, str):
            rewrites_data = [rewrites_data]
        rewrites = rewrites_data[:rewrite_count] if rewrites_data else [request.content]

        # Get section feedbacks (paid only)
        # With character limit validation for rewrites
        section_feedbacks = None
        if request.is_paid and (request.section_data or request.sections):
            sf_data = data.get("section_feedbacks", [])
            if sf_data:
                # Build a lookup for section char limits
                section_char_limits: dict[str, Optional[int]] = {}
                if request.section_data:
                    for sd in request.section_data:
                        section_char_limits[sd.title] = sd.char_limit

                section_feedbacks = []
                for item in sf_data:
                    section_title = item.get("section_title", "")
                    raw_rewrite = item.get("rewrite")

                    # Find char limit for this section and validate rewrite
                    char_limit = section_char_limits.get(section_title)
                    validated_rewrite = validate_and_repair_section_rewrite(
                        raw_rewrite, char_limit
                    )

                    section_feedbacks.append(
                        SectionFeedback(
                            section_title=section_title,
                            feedback=item.get("feedback", "")[:150],
                            rewrite=validated_rewrite,
                        )
                    )

        result = ReviewResponse(
            scores=scores,
            top3=top3,
            rewrites=rewrites,
            section_feedbacks=section_feedbacks,
        )
        record_es_scores(result.scores.model_dump())
        if cache:
            await cache.set_review(cache_key, result.model_dump())
        return result

    except Exception as e:
        logger.error(f"[ES添削] ❌ LLM応答解析失敗: {e}")
        record_parse_failure("es_review_full", str(e))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": str(e),
            },
        )


# ============================================================================
# SSE Streaming Endpoint for Real-time Progress
# ============================================================================

# Progress step definitions for SSE events
PROGRESS_STEPS = [
    {
        "id": "validation",
        "label": "入力を検証中...",
        "subLabel": "内容の確認",
    },
    {
        "id": "rag_fetch",
        "label": "企業情報を取得中...",
        "subLabel": "RAGコンテキスト検索",
    },
    {
        "id": "analysis",
        "label": "設問を分析中...",
        "subLabel": "論点と改善余地を整理",
    },
    {
        "id": "rewrite",
        "label": "改善案を作成中...",
        "subLabel": "設問に合う表現へ整えています",
    },
    {
        "id": "finalize",
        "label": "表示を整えています...",
        "subLabel": "結果をまとめています",
    },
]


def _sse_event(event_type: str, data: dict) -> str:
    """Format SSE event data."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _generate_review_progress(
    request: ReviewRequest,
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for ES review progress.
    Yields progress updates as the review is processed.
    """
    try:
        # Sanitize ES content to prevent prompt injection
        request.content = sanitize_es_content(request.content, max_length=5000)

        # Step 1: Validation
        yield _sse_event(
            "progress",
            {"step": "validation", "progress": 5, "label": "入力を検証中..."},
        )
        await asyncio.sleep(0.1)  # Small delay to ensure event is sent

        if not request.content or len(request.content.strip()) < 10:
            yield _sse_event(
                "error",
                {
                    "message": "ESの内容が短すぎます。もう少し詳しく書いてから添削をリクエストしてください。"
                },
            )
            return

        # Validate review_mode
        if request.review_mode not in ("full", "section"):
            yield _sse_event(
                "error",
                {"message": "review_modeは 'full' または 'section' を指定してください"},
            )
            return

        # Validate style
        available_styles = PAID_STYLES if request.is_paid else FREE_STYLES
        if request.style not in available_styles:
            yield _sse_event(
                "error",
                {"message": f"利用可能なスタイル: {', '.join(available_styles)}"},
            )
            return

        yield _sse_event(
            "progress",
            {"step": "validation", "progress": 10, "label": "検証完了"},
        )

        # Step 2: RAG fetch (if company_id)
        rewrite_count = min(request.rewrite_count, settings.es_rewrite_count if request.is_paid else 1)
        company_context = ""
        rag_context = ""
        rag_sources: list[dict] = []
        company_rag_available = request.has_company_rag
        rag_status = None
        context_length = get_dynamic_context_length(request.content)

        if request.company_id:
            yield _sse_event(
                "progress",
                {
                    "step": "rag_fetch",
                    "progress": 15,
                    "label": "企業情報を取得中...",
                },
            )

            if not company_rag_available:
                company_rag_available = has_company_rag(request.company_id)

            if company_rag_available:
                rag_status = get_company_rag_status(request.company_id)
                min_context_length = max(0, settings.rag_min_context_chars)

                if request.review_mode == "section":
                    rag_context, rag_sources = (
                        await get_enhanced_context_for_review_with_sources(
                            company_id=request.company_id,
                            es_content=request.content,
                            max_context_length=context_length,
                        )
                    )
                    is_rag_available, rag_reason = _evaluate_template_rag_availability(
                        rag_context=rag_context,
                        rag_sources=rag_sources,
                        min_context_length=min_context_length,
                    )
                    logger.warning(
                        f"[ES添削/SSE/テンプレート] RAG判定: context_len={len(rag_context)} "
                        f"source_count={len(rag_sources)} min_context={min_context_length} "
                        f"result={rag_reason}"
                    )
                    if not is_rag_available:
                        rag_context = ""
                        rag_sources = []
                        company_rag_available = False
                    elif not rag_sources:
                        logger.warning(
                            "[ES添削/SSE/テンプレート] ⚠️ RAG本文は利用可だが出典情報不足 - "
                            "企業接続評価は継続しキーワード抽出はフォールバック"
                        )
                else:
                    company_context = await get_enhanced_context_for_review(
                        company_id=request.company_id,
                        es_content=request.content,
                        max_context_length=context_length,
                    )
                    if (
                        not company_context
                        or len(company_context) < min_context_length
                    ):
                        company_context = ""
                        company_rag_available = False

                record_rag_context(
                    company_id=request.company_id,
                    context_length=len(rag_context or company_context),
                    source_count=(
                        len(rag_sources)
                        if rag_sources
                        else (rag_status.get("total_chunks", 0) if rag_status else 0)
                    ),
                )

            yield _sse_event(
                "progress",
                {
                    "step": "rag_fetch",
                    "progress": 30,
                    "label": "企業情報取得完了"
                    if company_rag_available
                    else "企業情報なし",
                },
            )
        else:
            yield _sse_event(
                "progress",
                {"step": "rag_fetch", "progress": 30, "label": "スキップ"},
            )

        # Step 3: LLM Review
        yield _sse_event(
            "progress",
            {"step": "analysis", "progress": 35, "label": "設問を分析中..."},
        )

        # Section mode (always template-based) handled here for SSE
        if request.review_mode == "section":
            try:
                template_request = request.template_request
                if not template_request:
                    char_max = request.section_char_limit
                    char_min = (
                        char_max - max(20, math.floor(char_max * 0.10))
                        if char_max
                        else None
                    )
                    template_request = TemplateRequest(
                        template_type="basic",
                        company_name=None,
                        industry=None,
                        question=request.section_title or "",
                        answer=request.content,
                        char_min=char_min,
                        char_max=char_max,
                    )

                template_request_request = (
                    request
                    if request.template_request
                    else request.model_copy(
                        update={"template_request": template_request}
                    )
                )

                # Use asyncio.Queue to stream progress during LLM call
                progress_queue: asyncio.Queue = asyncio.Queue(maxsize=100)

                async def _run_template_review():
                    return await review_section_with_template(
                        request=template_request_request,
                        rag_context=rag_context,
                        rag_sources=rag_sources,
                        company_rag_available=company_rag_available,
                        progress_queue=progress_queue,
                    )

                # Launch review as a task so we can yield progress events concurrently
                review_task = asyncio.create_task(_run_template_review())

                # Consume progress events from queue while task runs
                while not review_task.done():
                    try:
                        event_type, event_data = await asyncio.wait_for(
                            progress_queue.get(), timeout=0.5
                        )
                        if event_type == "progress":
                            yield _sse_event("progress", event_data)
                        elif event_type == "string_chunk":
                            yield _sse_event("string_chunk", event_data)
                    except asyncio.TimeoutError:
                        # No event in queue, check if task is done
                        continue

                # Drain remaining events from queue
                while not progress_queue.empty():
                    try:
                        event_type, event_data = progress_queue.get_nowait()
                        if event_type == "progress":
                            yield _sse_event("progress", event_data)
                        elif event_type == "string_chunk":
                            yield _sse_event("string_chunk", event_data)
                    except asyncio.QueueEmpty:
                        break

                # Get the result (may raise exception)
                result = await review_task

            except HTTPException as e:
                detail = e.detail
                if isinstance(detail, dict):
                    message = (
                        detail.get("error")
                        or detail.get("message")
                        or detail.get("detail")
                        or "AI処理中にエラーが発生しました"
                    )
                else:
                    message = str(detail)
                yield _sse_event("error", {"message": message})
                return
            except Exception as e:
                yield _sse_event("error", {"message": str(e)})
                return

            yield _sse_event(
                "progress",
                {
                    "step": "finalize",
                    "progress": 92,
                    "label": "表示を整えています...",
                },
            )
            yield _sse_event(
                "progress",
                {"step": "finalize", "progress": 100, "label": "完了"},
            )
            yield _sse_event("complete", {"result": result.model_dump()})
            return

        # Build scoring criteria
        score_criteria = """1. scores (各1-5点):
   - logic: 論理の一貫性（主張と根拠の整合性、因果関係の明確さ）
   - specificity: 具体性（数字、エピソード、固有名詞の使用）
   - passion: 熱意・意欲の伝わり度（モチベーションの説得力）"""

        if company_rag_available:
            score_criteria += """
   - company_connection: 企業接続（企業情報に基づいて評価）"""

        score_criteria += """
   - readability: 読みやすさ（文章の明瞭さ、構成の分かりやすさ）"""

        # Build style instructions
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
        rewrite_instruction = style_instructions.get(
            request.style, "バランスの取れた文章に"
        )

        # Section feedback instruction (paid only)
        section_feedback_instruction = ""
        if request.is_paid and request.section_data:
            section_items = []
            for s in request.section_data:
                limit_note = (
                    f"（文字数制限: {s.char_limit}文字）" if s.char_limit else ""
                )
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

        system_prompt = build_full_review_prompt_streaming(
            score_criteria=score_criteria,
            company_rag_available=company_rag_available,
            rewrite_count=rewrite_count,
            rewrite_instruction=rewrite_instruction,
            style=request.style,
            section_feedback_instruction=section_feedback_instruction,
        )

        user_message = build_review_user_message(
            content=request.content,
            company_context=company_context,
            gakuchika_context=request.gakuchika_context,
        )

        yield _sse_event(
            "progress",
            {"step": "analysis", "progress": 50, "label": "設問を分析中..."},
        )

        include_section_feedbacks = bool(
            request.is_paid and (request.section_data or request.sections)
        )

        # Stream LLM response with field-level events
        llm_result = None
        async for event in call_llm_streaming_fields(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=3000,
            temperature=0.3,
            feature="es_review",
            schema_hints={
                "scores": "object",
                "top3": "array",
                "rewrites": "array",
                "streaming_rewrite": "string",
            },
            stream_string_fields=["streaming_rewrite"],
        ):
            if event.type == "chunk":
                yield _sse_event("chunk", {"text": event.text})
            elif event.type == "string_chunk":
                yield _sse_event("string_chunk", {"path": event.path, "text": event.text})
            elif event.type == "field_complete":
                yield _sse_event("field_complete", {"path": event.path, "value": event.value})
            elif event.type == "array_item_complete":
                yield _sse_event("array_item_complete", {"path": event.path, "value": event.value})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event(
                    "error",
                    {
                        "message": error.message
                        if error
                        else "AI処理中にエラーが発生しました"
                    },
                )
                return
            elif event.type == "complete":
                llm_result = event.result

        yield _sse_event(
            "progress",
            {"step": "finalize", "progress": 80, "label": "表示を整えています..."},
        )

        if llm_result is None or not llm_result.success:
            error = llm_result.error if llm_result else None
            yield _sse_event(
                "error",
                {
                    "message": error.message
                    if error
                    else "AI処理中にエラーが発生しました"
                },
            )
            return

        data = llm_result.data
        if data is None:
            yield _sse_event(
                "error",
                {"message": "AIからの応答を解析できませんでした。"},
            )
            return

        # Step 4: Rewrite generation (parsing results)
        yield _sse_event(
            "progress",
            {
                "step": "rewrite",
                "progress": 90,
                "label": "改善案を作成中...",
            },
        )

        # Parse and validate response
        scores_data = data.get("scores", {})
        scores = {
            "logic": max(1, min(5, scores_data.get("logic", 3))),
            "specificity": max(1, min(5, scores_data.get("specificity", 3))),
            "passion": max(1, min(5, scores_data.get("passion", 3))),
            "readability": max(1, min(5, scores_data.get("readability", 3))),
        }
        if company_rag_available:
            scores["company_connection"] = max(
                1, min(5, scores_data.get("company_connection", 3))
            )

        top3_data = data.get("top3", [])
        top3 = []
        for item in top3_data[:3]:
            difficulty = _normalize_difficulty(item.get("difficulty")) or "medium"
            top3.append(
                {
                    "category": item.get("category", "その他"),
                    "issue": item.get("issue", ""),
                    "suggestion": item.get("suggestion", ""),
                    "why_now": item.get("why_now", ""),
                    "difficulty": difficulty,
                }
            )

        while len(top3) < 3:
            top3.append(
                {
                    "category": "その他",
                    "issue": "追加の改善点を特定できませんでした",
                    "suggestion": "全体的な見直しを行ってみてください",
                    "why_now": "他の指摘を優先しつつ、全体見直しで再発防止効果が高いため",
                    "difficulty": "medium",
                }
            )

        rewrites_data = data.get("rewrites", [])
        if isinstance(rewrites_data, str):
            rewrites_data = [rewrites_data]
        rewrites = (
            rewrites_data[:rewrite_count] if rewrites_data else [request.content]
        )

        section_feedbacks = None
        if request.is_paid and (request.section_data or request.sections):
            sf_data = data.get("section_feedbacks", [])
            if sf_data:
                section_char_limits: dict[str, Optional[int]] = {}
                if request.section_data:
                    for sd in request.section_data:
                        section_char_limits[sd.title] = sd.char_limit

                section_feedbacks = []
                for item in sf_data:
                    section_title = item.get("section_title", "")
                    raw_rewrite = item.get("rewrite")
                    char_limit = section_char_limits.get(section_title)
                    validated_rewrite = validate_and_repair_section_rewrite(
                        raw_rewrite, char_limit
                    )
                    section_feedbacks.append(
                        {
                            "section_title": section_title,
                            "feedback": item.get("feedback", "")[:150],
                            "rewrite": validated_rewrite,
                        }
                    )

        yield _sse_event(
            "progress",
            {"step": "rewrite", "progress": 100, "label": "完了"},
        )

        # Final complete event with result
        result = {
            "scores": scores,
            "top3": top3,
            "rewrites": rewrites,
            "section_feedbacks": section_feedbacks,
        }

        yield _sse_event("complete", {"result": result})

    except Exception as e:
        logger.error(f"[ES添削/SSE] ❌ エラー: {e}")
        yield _sse_event("error", {"message": str(e)})


@router.post("/review/stream")
async def review_es_stream(request: ReviewRequest):
    """
    Stream ES review progress via Server-Sent Events (SSE).

    This endpoint provides real-time progress updates during ES review,
    allowing the frontend to show accurate progress to users.

    Events:
    - progress: {"type": "progress", "step": "...", "progress": 0-100, "label": "..."}
    - complete: {"type": "complete", "result": {...}}
    - error: {"type": "error", "message": "..."}
    """
    return StreamingResponse(
        _generate_review_progress(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
