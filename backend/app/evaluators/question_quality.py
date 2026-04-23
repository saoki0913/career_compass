"""Rule-based question quality evaluator for gakuchika deepdive."""

from __future__ import annotations

import re
from typing import Any

from app.utils.question_loop_detector import (
    _extract_char_ngrams,
    _jaccard_similarity,
)

_PROHIBITED_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("就活テンプレ表現", re.compile(r"(御社|貴社|志望動機|自己PR|ガクチカ|就職活動)")),
    ("抽象的な質問", re.compile(r"(具体的に|もう少し詳しく|もっと教えて).{0,6}(ください|聞かせて)")),
    ("誘導的表現", re.compile(r"(ですよね|ではないですか|だと思いますが)")),
    ("評価的表現", re.compile(r"(素晴らしい|すごい|立派|感動|尊敬)")),
    ("カウンセラー口調", re.compile(r"(お気持ち|どう感じ|気持ちを|心境)")),
    ("面接官口調", re.compile(r"(なぜ当社|志望理由|入社後|弊社|選考)")),
    ("長すぎる前置き", re.compile(r"^.{60,}(ですが|ですけど|ですけれども|けど).+\?")),
    ("複数質問", re.compile(r"[?？].+[?？]")),
    ("Yes/No誘導", re.compile(r"^[^どなに何いつ]{0,15}(ですか[?？]$|ましたか[?？]$)")),
    ("オウム返し", re.compile(r"つまり.+(ということですね|ということですか)")),
    ("メタ発言", re.compile(r"(次の質問|話を変え|別の話題|質問を変え)")),
    ("指示的表現", re.compile(r"(してください|しなさい|すべきです|しましょう)")),
    ("コード・JSON漏れ", re.compile(r'(\{.*".*":|\[.*\]|```|focus_key|phase_name)')),
    ("空・極短", re.compile(r"^.{0,9}$")),
]

_MIN_QUESTION_LENGTH = 10
_MAX_QUESTION_LENGTH = 120


def _check_prohibited_patterns(question: str) -> list[str]:
    violations: list[str] = []
    for category, pattern in _PROHIBITED_PATTERNS:
        if pattern.search(question):
            violations.append(category)
    return violations


def _check_question_diversity(
    candidate: str,
    recent_questions: list[str],
    *,
    threshold: float = 0.45,
) -> float:
    if not recent_questions:
        return 1.0
    candidate_ngrams = _extract_char_ngrams(candidate, n=2)
    max_sim = 0.0
    for recent in recent_questions:
        recent_ngrams = _extract_char_ngrams(recent, n=2)
        sim = _jaccard_similarity(candidate_ngrams, recent_ngrams)
        if sim > max_sim:
            max_sim = sim
    return round(1.0 - max_sim, 4)


def _evaluate_question_quality(
    candidate_question: str,
    recent_questions: list[str],
    focus_key: str,
    asked_focuses: list[str],
) -> dict[str, Any]:
    violations = _check_prohibited_patterns(candidate_question)
    diversity_score = _check_question_diversity(candidate_question, recent_questions)

    q_len = len(candidate_question.strip())
    if q_len < _MIN_QUESTION_LENGTH:
        if "空・極短" not in violations:
            violations.append("空・極短")
    elif q_len > _MAX_QUESTION_LENGTH:
        violations.append("長すぎる質問")

    quality_ok = len(violations) == 0 and diversity_score > 0.3

    if not quality_ok:
        critical = {"コード・JSON漏れ", "空・極短"}
        if critical & set(violations):
            action = "block_focus"
        else:
            action = "use_fallback"
    else:
        action = "accept"

    return {
        "quality_ok": quality_ok,
        "violations": violations,
        "diversity_score": diversity_score,
        "recommended_action": action,
    }
