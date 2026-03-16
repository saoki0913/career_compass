from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

import pytest

from app.config import settings
from app.routers.es_review import ReviewRequest, TemplateRequest, review_section_with_template


MODEL_MATRIX = {
    "claude-sonnet": {"provider": "claude", "api_key_attr": "anthropic_api_key"},
    "gpt-5.1": {"provider": "openai", "api_key_attr": "openai_api_key"},
    "gemini-3.1-pro-preview": {"provider": "google", "api_key_attr": "google_api_key"},
    "command-a-03-2025": {"provider": "cohere", "api_key_attr": "cohere_api_key"},
}

LIVE_CASES = [
    {
        "case_id": "company_motivation_required_short",
        "template_type": "company_motivation",
        "question": "三菱商事を志望する理由を150字以内で教えてください。",
        "answer": "研究で仮説を立てて検証を回し、論点を整理しながら価値に結びつけてきた。この経験を、事業の解像度を高めながら社会に届く価値へ変える仕事で生かしたい。",
        "company_name": "三菱商事",
        "role_name": "総合職",
        "char_min": 120,
        "char_max": 150,
        "grounding_mode": "company_general",
        "expected_policy": "required",
        "expected_min_company_evidence": 2,
        "rag_sources": [
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手に挑戦機会を与え、事業理解を深めながら価値創出へつなげる。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
            {
                "content_type": "corporate_site",
                "title": "事業戦略",
                "excerpt": "成長領域への投資を進め、社会課題に向き合う。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で学びながら事業を動かす手応えを得る。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
        ],
    },
    {
        "case_id": "intern_reason_required_short",
        "template_type": "intern_reason",
        "question": "Business Intelligence Internshipの参加理由を120字以内で教えてください。",
        "answer": "研究で磨いた分析力を、実務に近い課題で試しながら意思決定へつなげる視点を学びたい。",
        "company_name": "三井物産",
        "role_name": "Business Intelligence",
        "intern_name": "Business Intelligence Internship",
        "char_min": 105,
        "char_max": 120,
        "grounding_mode": "role_grounded",
        "expected_policy": "required",
        "expected_min_company_evidence": 1,
        "rag_sources": [
            {
                "content_type": "new_grad_recruitment",
                "title": "Business Intelligence Internship",
                "excerpt": "実務に近いテーマを扱い、分析を価値へつなげる。",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/internship/business-intelligence/",
            },
        ],
    },
    {
        "case_id": "gakuchika_assistive_short",
        "template_type": "gakuchika",
        "question": "学生時代に力を入れたことを140字以内で教えてください。",
        "answer": "研究室で進捗共有の型を見直し、情報の滞留を減らした。論点を整理し、役割分担と共有頻度を調整して、チーム全体の前進を支えた。",
        "company_name": "三菱商事",
        "char_min": 120,
        "char_max": 140,
        "grounding_mode": "company_general",
        "expected_policy": "assistive",
        "expected_min_company_evidence": 1,
        "rag_sources": [
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "周囲を巻き込みながら前進させる姿勢を重視する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
    },
]


def _dearu_style(text: str) -> bool:
    return text.endswith(("。", "！", "？")) and not any(token in text for token in ("です", "ます", "でした", "ました"))


def _first_sentence(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped:
        return ""
    for delimiter in ("。", "！", "？", "!", "?"):
        if delimiter in stripped:
            return stripped.split(delimiter, 1)[0] + delimiter
    return stripped


def _assert_first_sentence_focus(case: dict[str, object], rewrite: str) -> None:
    first_sentence = _first_sentence(rewrite)
    assert first_sentence

    template_type = str(case["template_type"])
    company_name = str(case["company_name"])
    role_name = str(case.get("role_name") or "")
    intern_name = str(case.get("intern_name") or "")

    if template_type == "company_motivation":
        assert company_name[:2] in first_sentence or "貴" in first_sentence
        assert any(token in first_sentence for token in ("志望", "惹", "魅力", "理由", "価値", "からだ", "ためだ", "考えた"))
    elif template_type == "intern_reason":
        assert any(token in rewrite for token in ("参加", "応募", "挑戦", "学びたい", "身につけたい", "得たい", "試したい"))
        assert intern_name.split()[0] in rewrite or "インターン" in rewrite
    elif template_type == "gakuchika":
        assert any(
            token in first_sentence
            for token in ("力を入れた", "注力した", "取り組んだ", "担った", "見直し", "改善", "主導", "整備", "研究室", "ゼミ", "サークル", "アルバイト")
        )

    assert "理由を" not in first_sentence
    assert "教えて" not in first_sentence
    if role_name:
        assert template_type != "role_course_reason" or role_name[:3] in rewrite


def _selected_models() -> list[str]:
    raw = os.getenv("LIVE_ES_REVIEW_PROVIDERS", "").strip()
    if not raw:
        return list(MODEL_MATRIX.keys())
    return [model.strip() for model in raw.split(",") if model.strip()]


def _output_dir() -> Path:
    return Path(os.getenv("LIVE_ES_REVIEW_OUTPUT_DIR", "backend/tests/output").strip())


def _write_report(rows: list[dict[str, object]]) -> tuple[Path, Path]:
    output_dir = _output_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    json_path = output_dir / f"live_es_review_{timestamp}.json"
    md_path = output_dir / f"live_es_review_{timestamp}.md"

    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    md_lines = [
        "# Live ES Review Provider Report",
        "",
        "| model | case | status | chars | duration_ms | note |",
        "|---|---|---:|---:|---:|---|",
    ]
    for row in rows:
        md_lines.append(
            f"| {row['model']} | {row['case_id']} | {row['status']} | {row.get('char_count', '')} | {row['duration_ms']} | {row.get('note', '')} |"
        )
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    return json_path, md_path


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_es_review_provider_report(monkeypatch: pytest.MonkeyPatch) -> None:
    if os.getenv("RUN_LIVE_ES_REVIEW") != "1":
        pytest.skip("Set RUN_LIVE_ES_REVIEW=1 to enable live ES review provider gate.")

    fail_on_missing_keys = os.getenv("LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS", "0") == "1"
    selected_models = _selected_models()
    missing_models = [
        model_id
        for model_id in selected_models
        if not getattr(settings, MODEL_MATRIX[model_id]["api_key_attr"], "")
    ]
    if missing_models and fail_on_missing_keys:
        pytest.fail(f"Missing API keys for live ES review providers: {', '.join(missing_models)}")
    if len(missing_models) == len(selected_models):
        pytest.skip("No live ES review provider API keys are configured.")

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    rows: list[dict[str, object]] = []
    failures: list[str] = []

    for model_id in selected_models:
        if model_id in missing_models:
            rows.append({"model": model_id, "case_id": "*", "status": "skipped", "duration_ms": 0, "note": "missing_api_key"})
            continue

        provider = MODEL_MATRIX[model_id]["provider"]
        for case in LIVE_CASES:
            started = perf_counter()
            try:
                result = await review_section_with_template(
                    request=ReviewRequest(
                        content=case["answer"],
                        section_title=case["question"],
                        template_request=TemplateRequest(
                            template_type=case["template_type"],
                            company_name=case["company_name"],
                            question=case["question"],
                            answer=case["answer"],
                            char_min=case["char_min"],
                            char_max=case["char_max"],
                            intern_name=case.get("intern_name"),
                            role_name=case.get("role_name"),
                        ),
                    ),
                    rag_sources=case["rag_sources"],
                    company_rag_available=True,
                    llm_provider=provider,
                    llm_model=model_id,
                    grounding_mode=case["grounding_mode"],
                    progress_queue=None,
                )
                rewrite = result.rewrites[0]
                review_meta = result.review_meta
                assert case["char_min"] <= len(rewrite) <= case["char_max"]
                assert _dearu_style(rewrite)
                assert 1 <= len(result.top3) <= 3
                assert review_meta is not None
                assert review_meta.llm_provider == provider
                assert review_meta.llm_model == model_id
                assert review_meta.company_grounding_policy == case["expected_policy"]
                expected_min_company_evidence = int(case.get("expected_min_company_evidence", 1))
                assert review_meta.company_evidence_count >= expected_min_company_evidence
                if case["expected_policy"] == "required":
                    assert review_meta.evidence_coverage_level in {"partial", "strong"}
                _assert_first_sentence_focus(case, rewrite)

                rows.append(
                    {
                        "model": model_id,
                        "case_id": case["case_id"],
                        "status": "passed",
                        "char_count": len(rewrite),
                        "duration_ms": int((perf_counter() - started) * 1000),
                        "note": rewrite[:80].replace("\n", " "),
                    }
                )
            except Exception as exc:  # pragma: no cover
                rows.append(
                    {
                        "model": model_id,
                        "case_id": case["case_id"],
                        "status": "failed",
                        "duration_ms": int((perf_counter() - started) * 1000),
                        "note": str(exc),
                    }
                )
                failures.append(f"{model_id}::{case['case_id']} failed: {exc}")

    json_path, md_path = _write_report(rows)
    assert json_path.exists()
    assert md_path.exists()
    if failures:
        pytest.fail("\n".join(failures))
