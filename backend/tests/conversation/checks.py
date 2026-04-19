"""Deterministic quality checks for AI conversation live tests.

Ports buildForbiddenTokenChecks, buildRequiredQuestionGroupChecks,
buildDraftLengthChecks, buildFeedbackLengthChecks from
e2e/live-ai-conversations.spec.ts.

This module provides two complementary layers:

1. Public check functions (``check_*`` prefix) — higher-level, return plain
   dicts with a consistent ``{"passed": bool, ...}`` shape.  These are the
   primary entry points for pytest-based AI Live tests.

2. Internal build helpers (``build_*`` prefix) — lower-level, return
   ``(checks_list, fail_codes_list)`` tuples that mirror the TypeScript
   ``{ checks, failCodes }`` shape exactly.  Used by ``run_case_checks`` and
   any code that needs the granular check-entry format.

All public functions are pure (no I/O) so they are trivially testable with
unit assertions.
"""
from __future__ import annotations

import re
from typing import Any


# ---------------------------------------------------------------------------
# Token-hit counting
# ---------------------------------------------------------------------------


def count_token_hits(texts: list[str], tokens: list[str]) -> int:
    """Count how many tokens appear in *any* of the texts (case-insensitive substring match).

    Each token is counted at most once (hit/miss per token, not total
    occurrences).  Matching is case-insensitive substring, not word-boundary.

    Mirrors ``countTokenHits`` from ``e2e/live-ai-conversations.spec.ts``.
    """
    return sum(
        1 for token in tokens if any(token.lower() in text.lower() for text in texts)
    )


# ---------------------------------------------------------------------------
# Public check functions
# ---------------------------------------------------------------------------


def check_expected_question_tokens(
    questions: list[str],
    expected_tokens: list[str],
) -> dict[str, Any]:
    """Check if expected question tokens appear in generated questions.

    A token is considered found when it appears as a case-insensitive substring
    in any of the question texts.  The check passes when the hit ratio is at
    least 0.5 (i.e. at least half of the expected tokens are found).

    Parameters
    ----------
    questions:
        AI-generated question texts from the conversation (assistant turns).
    expected_tokens:
        Tokens that are expected to appear somewhere across the questions.

    Returns
    -------
    dict with keys:
        ``passed``   – bool, True when hits / total >= 0.5
        ``hits``     – int, number of tokens found
        ``total``    – int, total expected tokens
        ``missing``  – list[str], tokens that were not found
    """
    if not expected_tokens:
        return {"passed": True, "hits": 0, "total": 0, "missing": []}

    missing = [
        tok
        for tok in expected_tokens
        if not any(tok.lower() in q.lower() for q in questions)
    ]
    hits = len(expected_tokens) - len(missing)
    passed = hits / len(expected_tokens) >= 0.5

    return {
        "passed": passed,
        "hits": hits,
        "total": len(expected_tokens),
        "missing": missing,
    }


def check_expected_feedback_tokens(
    feedback_text: str,
    expected_tokens: list[str],
) -> dict[str, Any]:
    """Check if expected feedback tokens appear in feedback text.

    The check passes when the hit ratio is at least 0.5 (i.e. at least half
    of the expected tokens are found).  Matching is case-insensitive substring.

    Parameters
    ----------
    feedback_text:
        The full feedback / draft text to search within.
    expected_tokens:
        Tokens that are expected to appear in the feedback text.

    Returns
    -------
    dict with keys:
        ``passed``   – bool, True when hits / total >= 0.5
        ``hits``     – int, number of tokens found
        ``total``    – int, total expected tokens
        ``missing``  – list[str], tokens that were not found
    """
    if not expected_tokens:
        return {"passed": True, "hits": 0, "total": 0, "missing": []}

    lowered = feedback_text.lower()
    missing = [tok for tok in expected_tokens if tok.lower() not in lowered]
    hits = len(expected_tokens) - len(missing)
    passed = hits / len(expected_tokens) >= 0.5

    return {
        "passed": passed,
        "hits": hits,
        "total": len(expected_tokens),
        "missing": missing,
    }


def check_forbidden_tokens(
    all_texts: list[str],
    forbidden_tokens: list[str],
) -> dict[str, Any]:
    """Check that forbidden tokens do NOT appear in any text.

    The check fails if ANY forbidden token is found anywhere across all texts.
    Matching is case-insensitive substring.

    Parameters
    ----------
    all_texts:
        All text bodies to search (transcript turns, draft text, etc.).
    forbidden_tokens:
        Tokens that must be absent from every text.

    Returns
    -------
    dict with keys:
        ``passed``  – bool, True when no forbidden token was found
        ``found``   – list[str], forbidden tokens that were actually found
    """
    haystack = "\n".join(all_texts).lower()
    found = [tok for tok in forbidden_tokens if tok.lower() in haystack]
    return {"passed": len(found) == 0, "found": found}


def check_required_question_groups(
    questions: list[str],
    required_groups: list[list[str]],
) -> dict[str, Any]:
    """Check required question token groups.

    Each group is a list of tokens where ANY token must appear across the
    questions for the group to be satisfied.  Every group must be satisfied
    for the overall check to pass.

    For example, ``[["志望", "理由"], ["経験", "活か"]]`` requires that the
    questions contain "志望" OR "理由" (in any question), AND "経験" OR "活か".

    This matches the TypeScript ``buildRequiredQuestionGroupChecks`` which
    uses OR within a group.

    Parameters
    ----------
    questions:
        AI-generated question texts (assistant turns only).
    required_groups:
        Each inner list is a group where ANY token must be found.

    Returns
    -------
    dict with keys:
        ``passed``        – bool, True when every group is satisfied
        ``failedGroups``  – list[list[str]], groups that had missing tokens
    """
    failed_groups: list[list[str]] = []
    for group in required_groups:
        group_satisfied = any(
            tok.lower() in q.lower() for tok in group for q in questions
        )
        if not group_satisfied:
            failed_groups.append(group)

    return {"passed": len(failed_groups) == 0, "failedGroups": failed_groups}


def check_min_feedback_char_count(
    feedback_text: str,
    min_count: int,
) -> dict[str, Any]:
    """Check that feedback text meets minimum character count.

    Parameters
    ----------
    feedback_text:
        The feedback or summary text to measure.
    min_count:
        Minimum required character count (inclusive).

    Returns
    -------
    dict with keys:
        ``passed``    – bool
        ``actual``    – int, actual character count
        ``required``  – int, the min_count threshold
    """
    actual = len(feedback_text)
    return {
        "passed": actual >= min_count,
        "actual": actual,
        "required": min_count,
    }


def check_draft_length(
    draft_text: str,
    char_limit_type: str,
) -> dict[str, Any]:
    """Check that draft text is within reasonable length for the char limit type.

    The draft is considered acceptable when its length falls in the range
    ``[floor(limit * 0.5), floor(limit * 1.2)]`` inclusive.  This mirrors the
    intent of the TypeScript length checks while encoding the 50%–120% window
    as a single call that derives both bounds from the limit.

    Parameters
    ----------
    draft_text:
        The generated ES draft text to measure.
    char_limit_type:
        A string like ``"400"``, ``"500"``, or ``"300"`` representing the
        maximum character limit for the ES field.

    Returns
    -------
    dict with keys:
        ``passed``  – bool
        ``actual``  – int, actual character count
        ``min``     – int, minimum acceptable length (50% of limit)
        ``max``     – int, maximum acceptable length (120% of limit)
    """
    limit = int(char_limit_type)
    min_len = int(limit * 0.5)
    max_len = int(limit * 1.2)
    actual = len(draft_text)
    return {
        "passed": min_len <= actual <= max_len,
        "actual": actual,
        "min": min_len,
        "max": max_len,
    }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_case_checks(
    case_config: dict[str, Any],
    questions: list[str],
    feedback_text: str,
    draft_text: str | None = None,
) -> tuple[list[str], dict[str, Any]]:
    """Run all applicable deterministic checks for a test case.

    Reads the following optional keys from ``case_config``:

    ``expectedQuestionTokens``
        list[str] – tokens expected to appear in AI-generated questions.
    ``expectedFeedbackTokens`` / ``expectedDraftTokens`` / ``expectedSummaryTokens``
        list[str] – tokens expected to appear in the feedback or draft text.
        These three keys are checked in order and the first one present is used.
    ``expectedForbiddenTokens``
        list[str] – tokens that must NOT appear in any text.
    ``requiredQuestionTokenGroups``
        list[list[str]] – groups where every token in the group must appear.
    ``minFeedbackCharCount``
        int – minimum feedback character count.
    ``charLimitType`` / ``draftCharLimit``
        str or int – char-limit type for draft length check.  Checked only when
        ``draft_text`` is provided.  ``draftCharLimit`` is also checked as a
        fallback int value.

    Parameters
    ----------
    case_config:
        The test case dict from JSON (GakuchikaCase, MotivationCase, etc.).
    questions:
        AI-generated questions from the conversation (assistant turns).
    feedback_text:
        AI-generated feedback text or draft summary.
    draft_text:
        Generated ES draft text.  When provided, ``check_draft_length`` is run
        if the case config has a char limit type.

    Returns
    -------
    tuple[list[str], dict[str, Any]]
        ``(fail_reasons, checks_dict)`` where ``fail_reasons`` is a list of
        machine-readable failure codes and ``checks_dict`` maps check names to
        their individual result dicts.
    """
    fail_reasons: list[str] = []
    checks_dict: dict[str, Any] = {}

    # --- Expected question tokens ---
    expected_q_tokens: list[str] = case_config.get("expectedQuestionTokens") or []
    if expected_q_tokens:
        result = check_expected_question_tokens(questions, expected_q_tokens)
        checks_dict["expected_question_tokens"] = result
        if not result["passed"]:
            fail_reasons.append(
                f"question_token_miss:{','.join(result['missing'][:5])}"
            )

    # --- Expected feedback/draft/summary tokens ---
    expected_fb_tokens: list[str] = (
        case_config.get("expectedFeedbackTokens")
        or case_config.get("expectedDraftTokens")
        or case_config.get("expectedSummaryTokens")
        or []
    )
    if expected_fb_tokens:
        result = check_expected_feedback_tokens(feedback_text, expected_fb_tokens)
        checks_dict["expected_feedback_tokens"] = result
        if not result["passed"]:
            fail_reasons.append(
                f"feedback_token_miss:{','.join(result['missing'][:5])}"
            )

    # --- Forbidden tokens ---
    forbidden: list[str] = case_config.get("expectedForbiddenTokens") or []
    if forbidden:
        all_texts = list(questions) + [feedback_text]
        if draft_text is not None:
            all_texts.append(draft_text)
        result = check_forbidden_tokens(all_texts, forbidden)
        checks_dict["forbidden_tokens"] = result
        if not result["passed"]:
            for tok in result["found"]:
                fail_reasons.append(f"forbidden_token:{tok}")

    # --- Required question groups ---
    required_groups: list[list[str]] = (
        case_config.get("requiredQuestionTokenGroups") or []
    )
    if required_groups:
        result = check_required_question_groups(questions, required_groups)
        checks_dict["required_question_groups"] = result
        if not result["passed"]:
            fail_reasons.append("required_question_group_miss")

    # --- Minimum feedback char count ---
    min_fb_chars: int | None = case_config.get("minFeedbackCharCount")
    if min_fb_chars is not None:
        result = check_min_feedback_char_count(feedback_text, min_fb_chars)
        checks_dict["min_feedback_char_count"] = result
        if not result["passed"]:
            actual = result["actual"]
            fail_reasons.append(f"feedback_too_short:{actual}<{min_fb_chars}")

    # --- Draft length ---
    char_limit_type: str | None = None
    raw_char_limit = case_config.get("charLimitType") or case_config.get("draftCharLimit")
    if raw_char_limit is not None:
        char_limit_type = str(raw_char_limit)

    if draft_text is not None and char_limit_type is not None:
        result = check_draft_length(draft_text, char_limit_type)
        checks_dict["draft_length"] = result
        if not result["passed"]:
            actual = result["actual"]
            if actual < result["min"]:
                fail_reasons.append(f"draft_too_short:{actual}<{result['min']}")
            else:
                fail_reasons.append(f"draft_too_long:{actual}>{result['max']}")

    return fail_reasons, checks_dict


# ---------------------------------------------------------------------------
# Failure classification
# ---------------------------------------------------------------------------


def classify_failure(
    status_code: int | None,
    cleanup_ok: bool,
    fail_reasons: list[str],
    judge: dict[str, Any] | None,
) -> str:
    """Classify the failure kind for reporting.

    Decision tree:

    1. ``"pass"``              — no fail_reasons AND (no judge OR judge passed)
    2. ``"degraded"``          — no deterministic fail_reasons BUT judge failed
                                 (non-blocking quality signal only)
    3. ``"deterministic_fail"`` — has fail_reasons from deterministic checks
    4. ``"judge_fail"``        — judge was blocking and failed (reserved; judge
                                 is currently always non-blocking)
    5. ``"cleanup_fail"``      — cleanup_ok is False
    6. ``"api_error"``         — status_code is not None and not 200
    7. ``"crash"``             — none of the above apply but there are
                                 fail_reasons (catch-all for unexpected states)

    Parameters
    ----------
    status_code:
        HTTP status code from the API call, or ``None`` when the request was
        not made (e.g. pre-request validation failure).
    cleanup_ok:
        Whether test-resource cleanup completed without errors.
    fail_reasons:
        Machine-readable failure codes from ``run_case_checks`` or elsewhere.
    judge:
        Judge result dict with at least ``"overallPass": bool`` and
        ``"blocking": bool``, or ``None`` when no judge was run.

    Returns
    -------
    str
        One of: ``"pass"``, ``"degraded"``, ``"deterministic_fail"``,
        ``"judge_fail"``, ``"cleanup_fail"``, ``"api_error"``, ``"crash"``.
    """
    judge_passed = judge is None or bool(judge.get("overallPass", True))
    judge_blocking = judge is not None and bool(judge.get("blocking", False))

    # No failures at all
    if not fail_reasons and judge_passed:
        return "pass"

    # Judge failed but no deterministic failures (non-blocking quality signal)
    if not fail_reasons and not judge_passed and not judge_blocking:
        return "degraded"

    # Blocking judge failure (reserved for future use; currently non-blocking)
    if not fail_reasons and not judge_passed and judge_blocking:
        return "judge_fail"

    # Deterministic check failures take precedence over infrastructure issues
    # when we have explicit coded reasons from the checks.
    deterministic_reasons = [
        r for r in fail_reasons
        if not r.startswith("cleanup") and r != "cleanup_failed"
    ]
    if deterministic_reasons:
        return "deterministic_fail"

    # Cleanup failure
    if not cleanup_ok or any(
        r.startswith("cleanup") or r == "cleanup_failed" for r in fail_reasons
    ):
        return "cleanup_fail"

    # API-level error
    if status_code is not None and status_code != 200:
        return "api_error"

    # Catch-all — there are fail_reasons but none matched a specific category
    if fail_reasons:
        return "crash"

    # Should not reach here given the first branch, but be explicit
    return "pass"


# ---------------------------------------------------------------------------
# Internal build helpers (TypeScript-faithful, used by run_case_checks and
# test runners that need the granular check-entry format)
# ---------------------------------------------------------------------------


def build_checks(raw_checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalise check dicts to ``{name, passed, evidence}`` format.

    Mirrors ``buildChecks`` from the TypeScript source.  Input dicts must
    already have ``name``, ``passed``, and ``evidence`` keys; this function
    strips any extra keys so downstream consumers see a stable shape.
    """
    return [
        {
            "name": check["name"],
            "passed": bool(check["passed"]),
            "evidence": list(check.get("evidence") or []),
        }
        for check in raw_checks
    ]


def build_forbidden_token_checks(
    label: str,
    texts: list[str],
    forbidden: list[str] | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Verify that none of the forbidden tokens appear in any of the texts.

    Each token produces one check entry.  The check passes when the token is
    *absent* from the concatenated text.

    Parameters
    ----------
    label:
        Short prefix used in check names (e.g. ``"gakuchika"``).
    texts:
        All text bodies to search (transcript turns + draft, etc.).
    forbidden:
        Tokens that must not appear.  ``None`` or empty list means no checks.

    Returns
    -------
    tuple[list[dict], list[str]]
        ``(checks_list, fail_codes_list)`` — mirrors the TypeScript return
        shape ``{ checks, failCodes }``.
    """
    checks: list[dict[str, Any]] = []
    fail_codes: list[str] = []
    if not forbidden:
        return checks, fail_codes

    haystack = "\n".join(texts)
    for tok in forbidden:
        hit = tok in haystack
        checks.append(
            {
                "name": f"{label}-forbidden-absent:{tok[:24]}",
                "passed": not hit,
                "evidence": [f"found:{tok[:40]}"] if hit else ["ok"],
            }
        )
        if hit:
            fail_codes.append(f"forbidden_token:{tok}")

    return checks, fail_codes


def build_required_question_group_checks(
    question_texts: list[str],
    groups: list[list[str]] | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Verify that every group has at least one token hit in the questions.

    Each ``group`` is an OR-list: the group is satisfied when *any* token from
    the group appears in *any* of the assistant question texts.  All groups
    must be satisfied for the check to pass.

    Mirrors ``buildRequiredQuestionGroupChecks`` from the TypeScript source.

    Returns
    -------
    tuple[list[dict], list[str]]
        ``(checks_list, fail_codes_list)``
    """
    checks: list[dict[str, Any]] = []
    fail_codes: list[str] = []
    if not groups:
        return checks, fail_codes

    satisfied = 0
    for group in groups:
        if any(tok in q for tok in group for q in question_texts):
            satisfied += 1

    ok = satisfied == len(groups)
    checks.append(
        {
            "name": "required-question-token-groups",
            "passed": ok,
            "evidence": [f"satisfied_groups={satisfied}/{len(groups)}"],
        }
    )
    if not ok:
        fail_codes.append("required_question_group_miss")

    return checks, fail_codes


def build_draft_length_checks(
    final_text: str,
    min_chars: int | None,
    max_chars: int | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Verify that ``final_text`` falls within the expected character bounds.

    Either bound may be ``None`` to skip that direction.  Mirrors
    ``buildDraftLengthChecks`` from the TypeScript source.

    Returns
    -------
    tuple[list[dict], list[str]]
        ``(checks_list, fail_codes_list)``
    """
    checks: list[dict[str, Any]] = []
    fail_codes: list[str] = []
    length = len(final_text)

    if min_chars is not None:
        ok = length >= min_chars
        checks.append(
            {
                "name": "min-draft-chars",
                "passed": ok,
                "evidence": [f"len={length} min={min_chars}"],
            }
        )
        if not ok:
            fail_codes.append(f"draft_too_short:{length}<{min_chars}")

    if max_chars is not None:
        ok = length <= max_chars
        checks.append(
            {
                "name": "max-draft-chars",
                "passed": ok,
                "evidence": [f"len={length} max={max_chars}"],
            }
        )
        if not ok:
            fail_codes.append(f"draft_too_long:{length}>{max_chars}")

    return checks, fail_codes


def build_feedback_length_checks(
    feedback_text: str,
    min_chars: int | None,
    max_chars: int | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Verify that ``feedback_text`` falls within the expected character bounds.

    Mirrors ``buildFeedbackLengthChecks`` from the TypeScript source.

    Returns
    -------
    tuple[list[dict], list[str]]
        ``(checks_list, fail_codes_list)``
    """
    checks: list[dict[str, Any]] = []
    fail_codes: list[str] = []
    length = len(feedback_text)

    if min_chars is not None:
        ok = length >= min_chars
        checks.append(
            {
                "name": "min-feedback-chars",
                "passed": ok,
                "evidence": [f"len={length} min={min_chars}"],
            }
        )
        if not ok:
            fail_codes.append(f"feedback_too_short:{length}<{min_chars}")

    if max_chars is not None:
        ok = length <= max_chars
        checks.append(
            {
                "name": "max-feedback-chars",
                "passed": ok,
                "evidence": [f"len={length} max={max_chars}"],
            }
        )
        if not ok:
            fail_codes.append(f"feedback_too_long:{length}>{max_chars}")

    return checks, fail_codes


def merge_extended_checks(
    parts: list[tuple[list[dict[str, Any]], list[str]]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Merge multiple ``(checks, fail_codes)`` tuples into one.

    Mirrors ``mergeExtendedDeterministic`` from the TypeScript source.
    """
    all_checks: list[dict[str, Any]] = []
    all_fail_codes: list[str] = []
    for part_checks, part_fail_codes in parts:
        all_checks.extend(part_checks)
        all_fail_codes.extend(part_fail_codes)
    return all_checks, all_fail_codes


def classify_failure_v1(
    status: str,
    cleanup_ok: bool,
    deterministic_fail_reasons: list[str],
    judge: dict[str, Any] | None,
) -> str:
    """Classify the failure kind for a conversation run (TypeScript-faithful).

    This is the internal version that mirrors ``classifyLiveAiConversationFailure``
    in ``src/lib/testing/live-ai-conversation-report.ts`` exactly.  It is used
    by the existing conversation runner infrastructure.

    Returns one of: ``"none"``, ``"auth"``, ``"cleanup"``, ``"timeout"``,
    ``"infra"``, ``"quality"``, ``"state"``, or ``"unknown"``.

    For the simpler public API used by pytest cases see :func:`classify_failure`.
    """
    if status == "passed":
        if judge is not None and not judge.get("overallPass", True):
            return "quality"
        return "none"

    haystack = [r.lower() for r in deterministic_fail_reasons]

    def _includes(pattern: str | re.Pattern[str]) -> bool:
        if isinstance(pattern, str):
            return any(pattern in r for r in haystack)
        return any(pattern.search(r) is not None for r in haystack)

    if not cleanup_ok or _includes("cleanup"):
        return "cleanup"

    if _includes("timeout") or _includes("timed out"):
        return "timeout"

    if (
        _includes("auth")
        or _includes("unauthor")
        or _includes("forbidden")
        or _includes("permission denied")
        or _includes("access denied")
        or _includes("401")
        or _includes("403")
    ):
        return "auth"

    if (
        _includes("state")
        or _includes("conflict")
        or _includes("already started")
        or _includes("already exists")
        or _includes("did not complete")
        or _includes("did not reach")
        or _includes("not ready")
        or _includes("invalid session")
        or _includes("missing_report")
        or _includes("conversation")
    ):
        return "state"

    if (
        _includes("infra")
        or _includes("network")
        or _includes("connection")
        or _includes("fetch")
        or _includes("upstream")
        or _includes("gateway")
        or _includes("internal server error")
        or _includes("service unavailable")
        or _includes("socket")
        or _includes("dns")
        or _includes("unexpected response")
        or _includes("503")
        or _includes("500")
    ):
        return "infra"

    if judge is not None and not judge.get("overallPass", True):
        return "quality"

    return "unknown"


# ---------------------------------------------------------------------------
# Transcript helpers
# ---------------------------------------------------------------------------


def assistant_question_texts(transcript: list[dict[str, Any]]) -> list[str]:
    """Return the ``content`` of every assistant turn in ``transcript``.

    Mirrors ``assistantQuestionTexts`` from the TypeScript source.
    """
    return [t["content"] for t in transcript if t.get("role") == "assistant"]
