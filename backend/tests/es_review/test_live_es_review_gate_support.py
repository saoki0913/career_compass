from __future__ import annotations

from types import SimpleNamespace

from app.testing.es_review_live_gate import (
    ALL_STANDARD_MODELS,
    DEFAULT_LIVE_PROVIDERS_EXTENDED,
    _live_gate_allows_soft_min_shortfall,
    _matches_all_anchor_groups,
    _matches_anchor_groups,
    evaluate_live_case,
    get_live_cases,
    get_selected_models,
)


def _review_meta(**overrides: object) -> SimpleNamespace:
    payload = {
        "llm_provider": "openai",
        "llm_model": "gpt-5.4-mini",
        "company_grounding_policy": "required",
        "grounding_mode": "company_general",
        "company_evidence_count": 2,
        "evidence_coverage_level": "strong",
        "weak_evidence_notice": False,
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def test_get_live_cases_smoke_covers_multiple_dimensions() -> None:
    cases = get_live_cases("smoke")

    assert len(cases) >= 8
    assert {"short", "medium", "long"} <= {case.char_band for case in cases}
    assert {"companyless", "assistive_selected", "strong_same_company", "role_grounded"} <= {
        case.company_context for case in cases
    }


def test_get_selected_models_defaults_follow_case_set() -> None:
    assert get_selected_models("smoke", raw="") == ["gpt-5.4-mini"]
    assert get_selected_models("extended", raw="") == list(DEFAULT_LIVE_PROVIDERS_EXTENDED)
    assert get_selected_models("canary", raw="") == ["claude-sonnet", "gemini-3.1-pro-preview"]
    assert get_selected_models("extended", raw="all_standard") == ALL_STANDARD_MODELS


def test_get_live_cases_extended_includes_hard_input_patterns() -> None:
    cases = get_live_cases("extended")
    case_ids = {case.case_id for case in cases}

    assert len(cases) == 30
    assert {
        "basic_companyless_selected_company_guard_short",
        "gakuchika_bullet_memo_reconstruction_medium",
        "self_pr_numeric_retention_short",
        "role_course_reason_near_role_disambiguation_medium",
        "intern_reason_three_part_coverage_medium",
        "company_motivation_noisy_rag_medium",
        "basic_mixed_style_normalization_short",
        "self_pr_negative_phrase_reframing_medium",
    } <= case_ids


def test_evaluate_live_case_returns_fail_reasons_for_length_and_policy() -> None:
    case = get_live_cases("smoke")[0]
    failures = evaluate_live_case(
        case,
        rewrite="短い。",
        review_meta=_review_meta(company_grounding_policy="assistive"),
        provider="openai",
        model_id="gpt-5.4-mini",
    )

    assert any(reason.startswith("char_count:") for reason in failures)
    assert "company_grounding_policy:assistive!=required" in failures


def test_live_gate_soft_min_shortfall_matches_router_floor_ratio() -> None:
    from app.routers.es_review import FINAL_SOFT_MIN_FLOOR_RATIO
    from app.testing.es_review_live_gate import LIVE_GATE_SOFT_MIN_FLOOR_RATIO

    assert LIVE_GATE_SOFT_MIN_FLOOR_RATIO == FINAL_SOFT_MIN_FLOOR_RATIO


def test_live_gate_soft_min_allows_when_only_length_fix_result_flags_soft() -> None:
    """length_policy が strict のまま length_fix_result だけ soft のときも短答帯は許容する。"""
    rewrite = "あ" * 125 + "。"
    meta = SimpleNamespace(length_policy="strict", length_fix_result="soft_recovered")
    assert _live_gate_allows_soft_min_shortfall(
        rewrite=rewrite, char_min=100, char_max=140, review_meta=meta
    )
    meta_both = SimpleNamespace(length_policy="soft_ok", length_fix_result="soft_recovered")
    assert _live_gate_allows_soft_min_shortfall(
        rewrite=rewrite, char_min=100, char_max=140, review_meta=meta_both
    )


def test_live_gate_soft_min_allows_long_band_only_at_final_floor() -> None:
    rewrite = "あ" * 359 + "。"
    meta = SimpleNamespace(length_policy="soft_ok", length_fix_result="soft_recovered")
    assert _live_gate_allows_soft_min_shortfall(
        rewrite=rewrite,
        char_min=390,
        char_max=400,
        review_meta=meta,
    )


def test_evaluate_live_case_accepts_companyless_assistive_case() -> None:
    case = next(target for target in get_live_cases("smoke") if target.company_context == "companyless")
    rewrite = (
        "研究室で進捗共有の型を見直し、情報滞留を防いだ経験に最も力を入れた。"
        "論点整理と共有頻度の見直しを主導し、役割分担も整えながら、チーム全体の前進を支えた。"
        "会議前の準備を定着させ、意思決定までの流れも滑らかにした。"
    )
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(
            company_grounding_policy="assistive",
            grounding_mode="none",
            company_evidence_count=0,
            evidence_coverage_level="none",
        ),
        provider="openai",
        model_id="gpt-5.4-mini",
    )

    assert failures == []


def test_matches_anchor_groups_accepts_synonym_hit() -> None:
    assert _matches_anchor_groups(
        "Business Intelligence Internshipでは、分析を意思決定へつなぐ視点を実務で磨きたい。",
        (("学びたい", "得たい", "磨きたい"), ("実務", "課題")),
    )


def test_matches_all_anchor_groups_requires_every_group() -> None:
    assert _matches_all_anchor_groups(
        "参加理由として実務で学びたい点があり、研究で培った分析経験を持ち込み、判断材料の整理を持ち帰りたい。",
        (("参加理由", "参加"), ("研究", "分析"), ("持ち帰りたい", "学びたい")),
    )
    assert not _matches_all_anchor_groups(
        "参加理由として実務で試したい点があり、研究で培った分析経験を持ち込みたい。",
        (("参加理由", "参加"), ("研究", "分析"), ("持ち帰りたい", "学びたい")),
    )


def test_evaluate_live_case_accepts_role_course_iruka_without_shibou_token() -> None:
    """ルータと同様、志望の言い換え（惹か）でライブゲートを通す。"""
    case = next(c for c in get_live_cases("smoke") if c.case_id == "role_course_reason_required_medium")
    rewrite = (
        "事業課題と技術を接続し、構想を実装まで前に進める役割に強く惹かれているからだ。"
        "研究では課題を構造化し、仮説検証を通じて関係者と認識をそろえながら前に進めてきた。"
    )
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(),
        provider="openai",
        model_id="gpt-5.4",
    )
    assert "focus_tokens:missing" not in failures


def test_evaluate_live_case_accepts_intern_reason_with_taikan_tokens() -> None:
    case = next(c for c in get_live_cases("extended") if c.case_id == "intern_reason_required_medium")
    rewrite = (
        "研究で仮説検証を繰り返してきたが、実務の制約下で優先順位をつけ、分析を意思決定へつなげる経験はまだ足りない。"
        "貴社のインターンは実務に近い課題を扱う場であり、問いの立て方から意思決定への橋渡しまでを体感できると考えた。"
        "この機会で分析力を実践的に鍛え、事業判断に直結する思考を自分のものにする。"
    )
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(
            company_grounding_policy="required",
            grounding_mode="role_grounded",
            company_evidence_count=1,
            evidence_coverage_level="partial",
        ),
        provider="anthropic",
        model_id="claude-sonnet",
    )
    assert "focus_tokens:missing" not in failures


def test_evaluate_live_case_requires_all_focus_groups_for_multipart_prompt() -> None:
    case = next(c for c in get_live_cases("extended") if c.case_id == "intern_reason_three_part_coverage_medium")
    rewrite = (
        "実務に近い課題に触れられる点に魅力を感じ、このインターンに参加したい。"
        "研究では需要データを分析し、仮説を比較しながら論点整理を進めてきた。"
    )
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(
            company_grounding_policy="required",
            grounding_mode="role_grounded",
            company_evidence_count=1,
            evidence_coverage_level="partial",
        ),
        provider="openai",
        model_id="gpt-5.4-mini",
    )

    assert "focus_tokens:missing" in failures
    assert "focus_group_missing:3" in failures


def test_evaluate_live_case_rejects_forbidden_anywhere_tokens() -> None:
    case = next(
        c for c in get_live_cases("extended") if c.case_id == "role_course_reason_near_role_disambiguation_medium"
    )
    rewrite = (
        "事業課題を捉え、技術活用の構想を実装まで前に進める役割に魅力を感じている。"
        "研究では仮説を比較して論点を整理してきたが、将来は営業やトレーディングの現場も理解したい。"
    )
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(
            company_grounding_policy="required",
            grounding_mode="role_grounded",
            company_evidence_count=2,
            evidence_coverage_level="strong",
        ),
        provider="openai",
        model_id="gpt-5.4",
    )

    assert "forbidden_token:営業" in failures
    assert "forbidden_token:トレーディング" in failures


def test_evaluate_live_case_rejects_company_name_in_companyless_case() -> None:
    case = next(
        c for c in get_live_cases("extended") if c.case_id == "basic_companyless_selected_company_guard_short"
    )
    rewrite = (
        "需要予測の研究で誤差要因を整理してきた経験は、三菱商事のように多様な事業でデータの信頼性を高める仕事でも生かせる。"
    )
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(
            company_grounding_policy="assistive",
            grounding_mode="none",
            company_evidence_count=0,
            evidence_coverage_level="none",
        ),
        provider="openai",
        model_id="gpt-5.4-mini",
    )

    assert "companyless:company_name_present" in failures


def test_evaluate_live_case_adds_length_shortfall_bucket_for_under_min_failure() -> None:
    case = next(c for c in get_live_cases("extended") if c.case_id == "self_pr_numeric_retention_short")
    failures = evaluate_live_case(
        case,
        rewrite="短い。",
        review_meta=_review_meta(
            company_grounding_policy="assistive",
            grounding_mode="none",
            company_evidence_count=0,
            evidence_coverage_level="none",
        ),
        provider="openai",
        model_id="gpt-5.4-mini",
    )

    assert any(reason.startswith("length_shortfall_bucket:") for reason in failures)


def test_evaluate_live_case_detects_unfinished_tail() -> None:
    case = next(c for c in get_live_cases("extended") if c.case_id == "basic_mixed_style_normalization_short")
    rewrite = "研究で需要予測の外れ値処理を見直し、比較条件をそろえて精度改善を進めた経験が強みだ"
    failures = evaluate_live_case(
        case,
        rewrite=rewrite,
        review_meta=_review_meta(
            company_grounding_policy="assistive",
            grounding_mode="none",
            company_evidence_count=0,
            evidence_coverage_level="none",
        ),
        provider="openai",
        model_id="gpt-5.4",
    )

    assert "unfinished_tail:detected" in failures
