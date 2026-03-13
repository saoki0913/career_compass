from __future__ import annotations

import asyncio
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.es_review_qwen.scripts.build_teacher_dataset import _build_case_records
from ml.es_review_qwen.scripts.generate_holdout_predictions import _build_prompt_index
from ml.es_review_qwen.scripts.generate_seed_cases import _build_case


def test_generate_seed_case_preserves_teacher_reference() -> None:
    reference = {
        "id": "ref-001",
        "question_type": "company_motivation",
        "company_name": "テスト株式会社",
        "text": "私は大学でのデータ分析経験を活かし、顧客起点で事業を伸ばす貴社で価値を出したいと考える。ゼミでは購買データを分析して提案を改善し、来店率向上に貢献した。この経験を活かし、入社後は事業理解を深めながら顧客課題の解決に挑戦したい。",
    }

    case = _build_case(reference, 1, ("remove_company_anchor", "genericize_terms"))

    assert case is not None
    assert case["id"] == "ref-001::v01"
    assert case["teacher_rewrite"] == reference["text"]
    assert case["company_name"] == "テスト株式会社"
    assert len(case["teacher_top3"]) == 3
    assert case["char_max"] >= len(reference["text"])
    assert "志望する理由" in case["question"]


def test_build_case_records_existing_mode_keeps_eval_metadata() -> None:
    case = {
        "id": "gakuchika-001",
        "template_type": "gakuchika",
        "question": "学生時代に力を入れたことを教えてください。",
        "answer": "塾講師のアルバイトを頑張った。",
        "char_min": 40,
        "char_max": 140,
        "grounding_mode": "none",
        "allowed_user_facts": [{"source": "current_answer", "text": "塾講師のアルバイトを頑張った。"}],
        "company_evidence_cards": [],
        "teacher_top3": [
            {"category": "結論", "issue": "何を頑張ったかが曖昧。", "suggestion": "冒頭で取り組みを言い切る。"},
            {"category": "具体性", "issue": "行動が抽象的。", "suggestion": "工夫を一つ具体化する。"},
            {"category": "成果", "issue": "結果が見えない。", "suggestion": "成果や変化を一つ入れる。"},
        ],
        "teacher_rewrite": "私は塾講師のアルバイトで生徒ごとの課題を整理し、面談と学習計画の見直しを続けた。結果として担当生徒の継続率向上に貢献し、相手に合わせて改善する力を培った。",
    }

    records, teacher_record = asyncio.run(
        _build_case_records(
            case,
            teacher_source="existing",
            rewrite_attempts=1,
            skip_reference_overlap_check=True,
        )
    )

    assert len(records) == 2
    assert teacher_record["id"] == "gakuchika-001"
    assert teacher_record["split"] in {"train", "valid", "test"}
    assert teacher_record["allowed_user_facts"] == case["allowed_user_facts"]
    assert teacher_record["company_evidence_cards"] == []
    assert teacher_record["teacher_rewrite"] == case["teacher_rewrite"]


def test_build_prompt_index_groups_holdout_prompts_by_case_id() -> None:
    prompt_index = _build_prompt_index(
        [
            {
                "task": "improvement_top3",
                "messages": [
                    {"role": "system", "content": "system-1"},
                    {"role": "user", "content": "user-1"},
                ],
                "metadata": {"source_case_id": "case-1", "split": "test"},
            },
            {
                "task": "rewrite_text",
                "messages": [
                    {"role": "system", "content": "system-2"},
                    {"role": "user", "content": "user-2"},
                ],
                "metadata": {"source_case_id": "case-1", "split": "test"},
            },
            {
                "task": "rewrite_text",
                "messages": [
                    {"role": "system", "content": "skip-system"},
                    {"role": "user", "content": "skip-user"},
                ],
                "metadata": {"source_case_id": "case-2", "split": "train"},
            },
        ],
        split="test",
    )

    assert prompt_index == {
        "case-1": {
            "improvement_top3": ("system-1", "user-1"),
            "rewrite_text": ("system-2", "user-2"),
        }
    }
