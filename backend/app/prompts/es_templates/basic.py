"""Template definition for ES review: basic."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
        "label": "汎用ES添削",
        "requires_company_rag": False,
        "grounding_level": "light",
        "description": "設問への適合性、企業理解、自己アピール、論理性を総合的に評価。",
        "purpose": "設問の主眼に正面から答え、経験や考えが読み手に伝わる本文に整える。",
        "required_elements": ["設問への結論", "根拠になる経験・考え", "必要に応じた仕事や企業との接点"],
        "anti_patterns": [
            "設問文の言い換えだけで始める",
            "具体性のない一般論だけで終わる",
            "箇条書きや断片文のまま終わる",
        ],
        "recommended_structure": {
            "short": "1文目で結論、2文目で根拠、必要なら3文目で仕事や企業との接点を置く",
        },
        "evaluation_checks": {
            "head_sentence_window": 2,
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、既にある経験や考えのつながりを補って不足字数を埋める",
            "answer_focus": "1文目で設問への答えの核を短く言い切る",
            "grounding": "企業理解との接点を自然な範囲で1点示す",
        },
        "company_usage": "assistive",
        "fact_priority": "mixed",
        "evaluation_axes": [{'name': '設問への直答性', 'pass_condition': '冒頭で設問に正面から答えている', 'rewrite_instruction': '背景説明から入らず、1文目で答えの核を言い切る'},
         {'name': '根拠の具体性', 'pass_condition': '結論を支える具体的な経験・事実がある', 'rewrite_instruction': '5W1Hや数字を使い、主観だけで終わらせない'},
         {'name': '論理の一貫性', 'pass_condition': '結論、根拠、帰結の流れに矛盾がない', 'rewrite_instruction': '接続語で因果を明示し、話題の飛躍をなくす'},
         {'name': '独自性', 'pass_condition': '書き手固有の経験や視点が含まれている', 'rewrite_instruction': '誰でも書ける一般論を避け、元回答にある固有の場面を残す'}],
    }
