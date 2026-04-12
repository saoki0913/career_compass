"""ES review issue parsing / normalization helpers.

Pure helpers that convert raw LLM output into canonicalized `Issue` dataclasses.
No side effects, no logging — safe to import from anywhere.
"""
from __future__ import annotations

import re
from typing import Optional

from app.prompts.es_templates import get_template_company_grounding_policy
from app.routers.es_review_grounding import _question_has_assistive_company_signal
from app.routers.es_review_models import Issue

DIFFICULTY_LEVELS = {"easy", "medium", "hard"}

REQUIRED_ACTIONS = {
    "結論明示",
    "職種接続",
    "企業接続",
    "具体例追加",
    "将来像明示",
    "論理接続",
    "深掘り準備",
}


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


def _normalize_required_action(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = value.strip()
    aliases = {
        "結論を明示": "結論明示",
        "職種適合": "職種接続",
        "職種接続": "職種接続",
        "企業理解": "企業接続",
        "企業接続": "企業接続",
        "具体化": "具体例追加",
        "具体例": "具体例追加",
        "将来像": "将来像明示",
        "論理性": "論理接続",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in REQUIRED_ACTIONS else None


def _normalize_issue_id(value: Optional[str], index: int) -> str:
    raw = (value or "").strip().upper()
    if re.fullmatch(r"ISSUE-\d+", raw):
        return raw
    return f"ISSUE-{index + 1}"


def _infer_required_action(
    *,
    item: dict,
    index: int,
    role_name: str | None,
    company_rag_available: bool,
) -> str:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("category", "issue", "suggestion", "required_action")
    )
    if re.search(r"結論|冒頭|言い切", text):
        return "結論明示"
    if role_name and (role_name in text or re.search(r"職種|コース|適性", text)):
        return "職種接続"
    if re.search(r"将来|入社後|活躍|キャリア", text):
        return "将来像明示"
    if company_rag_available and re.search(r"企業|事業|価値観|文化|方向性|貴社|志望度", text):
        return "企業接続"
    if re.search(r"論理|つなが|接続|一貫|理由が弱", text):
        return "論理接続"
    if re.search(r"具体|根拠|成果|経験|数値|エピソード", text):
        return "具体例追加"
    if re.search(r"深掘|面接", text):
        return "深掘り準備"

    if index == 0:
        return "結論明示"
    if role_name and index == 1:
        return "職種接続"
    if company_rag_available and index == 2:
        return "企業接続"
    return "具体例追加"


def _default_difficulty(required_action: str) -> str:
    if required_action == "結論明示":
        return "easy"
    if required_action in {"企業接続", "職種接続"}:
        return "medium"
    return "medium"


def _default_must_appear(required_action: str | None, role_name: str | None) -> str:
    mapping = {
        "結論明示": "結論を冒頭で言い切る",
        "職種接続": f"{role_name or '職種'}で活きる経験を示す",
        "企業接続": "企業との接点を一つ示す",
        "具体例追加": "役割か行動か成果を具体化する",
        "将来像明示": "入社後の価値発揮を述べる",
        "論理接続": "志望理由と経験をつなぐ",
        "深掘り準備": "根拠を補足できる状態にする",
    }
    return mapping.get(required_action or "", "不足点を本文で解消する")


def _parse_issues(
    items: list[dict],
    max_items: int,
    *,
    role_name: str | None,
    company_rag_available: bool,
) -> list[Issue]:
    issues: list[Issue] = []
    for index, item in enumerate(items[:max_items]):
        category = str(item.get("category") or "").strip()
        issue = str(item.get("issue") or "").strip()
        suggestion = str(item.get("suggestion") or "").strip()
        if not category or not issue or not suggestion:
            continue
        required_action = (
            _normalize_required_action(item.get("required_action"))
            or _infer_required_action(
                item=item,
                index=index,
                role_name=role_name,
                company_rag_available=company_rag_available,
            )
        )
        issues.append(
            Issue(
                category=category,
                issue=issue,
                suggestion=suggestion,
                issue_id=_normalize_issue_id(item.get("issue_id"), index),
                required_action=required_action,
                must_appear=(item.get("must_appear") or "").strip()
                or _default_must_appear(required_action, role_name),
                priority_rank=index + 1,
                why_now=(item.get("why_now") or "").strip() or None,
                difficulty=_normalize_difficulty(item.get("difficulty")) or _default_difficulty(required_action),
            )
        )
    return issues


def _merge_with_fallback_issues(
    primary: list[Issue],
    fallback: list[Issue],
    *,
    max_items: int = 3,
) -> list[Issue]:
    merged: list[Issue] = []
    seen: set[tuple[str, str]] = set()
    for issue in [*primary, *fallback]:
        key = (issue.category.strip(), issue.issue.strip())
        if not issue.category or not issue.issue or key in seen:
            continue
        seen.add(key)
        merged.append(issue)
        if len(merged) >= max_items:
            break
    return merged


def _fallback_improvement_points(
    question: str,
    original_answer: str,
    company_rag_available: bool,
    template_type: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
) -> list[Issue]:
    """Deterministic fallback issue list when the LLM cannot produce issues."""
    company_grounding = get_template_company_grounding_policy(template_type or "basic")
    assistive_company_signal = bool(template_type) and _question_has_assistive_company_signal(
        template_type=template_type,
        question=question,
    )
    effective_company_rag_available = company_rag_available
    issues: list[Issue] = [
        Issue(
            issue_id="ISSUE-1",
            category="結論の明確さ",
            issue="設問の冒頭で何を伝えるかが曖昧になりやすい。",
            suggestion="冒頭1文で設問への答えを言い切り、その後に根拠を続ける構成にする。",
            required_action="結論明示",
            must_appear="設問への答えを冒頭で言い切る",
            priority_rank=1,
            why_now="最初の一文が弱いと、その後の具体例が読まれにくくなるため。",
            difficulty="easy",
        )
    ]
    role_issue = (
        Issue(
            issue_id="ISSUE-ROLE",
            category="職種適合",
            issue=f"{role_name}を選ぶ理由が、経験や適性に結びついていない。",
            suggestion=f"{role_name}で活きる経験・関心・強みを1つに絞り、なぜその職種でなければならないかを明示する。",
            required_action="職種接続",
            must_appear=f"{role_name}で活きる経験か関心を示す",
            priority_rank=2,
            why_now="職種選択理由が曖昧だと、企業固有の志望度より前に適性で疑問を持たれやすいため。",
            difficulty="medium",
        )
        if role_name
        else None
    )
    company_issue = (
        Issue(
            issue_id="ISSUE-3",
            category="企業接続",
            issue=(
                "企業理解を示す要素が弱いと一般論に見えやすい。"
                if grounding_mode != "company_general"
                else "企業の方向性との接点が薄く、企業に合わせた理由が伝わりにくい。"
            ),
            suggestion=(
                "事業・職種・働き方のうち最も自分と接点のある要素を1つだけ明示して接続を強める。"
                if grounding_mode != "company_general"
                else "企業の方向性や価値観との接点を1点だけ示し、断定しすぎずに接続する。"
            ),
            required_action="企業接続",
            must_appear="企業の方向性との接点を一つ示す",
            priority_rank=3,
            why_now="企業に合わせた志望度を示せると通過率への影響が大きいため。",
            difficulty="medium",
        )
        if effective_company_rag_available
        and (
            company_grounding == "required"
            or (company_grounding == "assistive" and assistive_company_signal)
        )
        else None
    )
    specificity_issue = Issue(
        issue_id="ISSUE-2",
        category="具体性",
        issue="経験や志望理由の根拠が抽象的だと説得力が落ちる。",
        suggestion="役割、行動、成果、学びのうち不足している要素を1つ追加して具体化する。",
        required_action="具体例追加",
        must_appear="役割か行動か成果を一つ具体化する",
        priority_rank=2,
        why_now="改善案の説得力は具体例の密度で大きく変わるため。",
        difficulty="medium",
    )

    if role_issue:
        issues.append(role_issue)
    if company_issue:
        issues.append(company_issue)
    if len(issues) < 3:
        issues.append(specificity_issue)
    if len(issues) < 3:
        issues.append(
            Issue(
                issue_id="ISSUE-3",
                category="深掘り準備",
                issue="改善案としてはまとまっていても、面接で根拠を追加で聞かれる余地が残る。",
                suggestion="なぜその経験が今の志望や価値観につながるのかを口頭で補足できるよう整理しておく。",
                required_action="深掘り準備",
                must_appear="志望理由の根拠を補足できる状態にする",
                priority_rank=3,
                why_now="ES通過後の深掘りにそのまま備えられるため。",
                difficulty="easy",
            )
        )
    _ = (question, original_answer, template_type)
    return issues[:3]


__all__ = [
    "DIFFICULTY_LEVELS",
    "REQUIRED_ACTIONS",
    "_default_difficulty",
    "_default_must_appear",
    "_fallback_improvement_points",
    "_infer_required_action",
    "_merge_with_fallback_issues",
    "_normalize_difficulty",
    "_normalize_issue_id",
    "_normalize_required_action",
    "_parse_issues",
]
