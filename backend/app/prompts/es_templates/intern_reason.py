"""Template definition for ES review: intern_reason."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
    "label": "インターン志望理由",
    "rewrite_policy": {
        "description": "インターンへの参加理由を述べる設問。参加目的と自己成長の接点を示す。",
        "extra_fields": ["intern_name"],
        "purpose": "なぜそのインターンに参加したいかを、経験と得たい学びにつないで示す。",
        "required_elements": ["参加理由の核", "活かせる経験や課題意識", "プログラムとの接点", "得たい学び"],
        "anti_patterns": [
            "参加してみたいだけの一般論",
            "学びたいことが抽象的すぎる",
            "経験とインターンの接続がない",
        ],
        "structure_short": "1文目で参加理由、2文目で根拠経験、必要なら3文目でこのインターンで得たいことを置く",
        "dense_short_answer": True,
        "rewrite_closing_guidance": (
            "結びでインターン経験を将来のキャリア像に接続してよい。"
            "元回答にない具体的な職種名・企業施策は追加しない"
        ),
        "company_usage": "required",
        "fact_priority": "mixed",
        "question_focus_rules": [
            {
                "contains_all": ["活か"],
                "contains_any": ["持ち帰", "得たい", "学びたい"],
                "title": "この設問で落としてはいけない3要素",
                "items": [
                    "参加したい理由を1文で明示する",
                    "活かせる経験・事実を1文で置く",
                    "持ち帰りたい学び・視点を最後に1文で言い切る",
                    "3要素のどれも省略しない",
                ],
            }
        ],
        "playbook": {
            "subject": "{intern_name}への参加理由",
            "opening": "1文目で参加理由の核を言い切る",
            "second": "2文目で元回答の経験や課題感を1点だけ出す",
            "third": "3文目でそのインターンの価値との接点を1点だけつなぐ。複数理由なら本文内で第一に・第二にと順序を示す",
            "fourth": "4文目でインターン後の成長イメージで締める",
            "example_good_1": "私が{intern_name}に参加したいのは、実務に近い課題で分析力を試し、学びを得たいからだ。",
            "example_good_2": "研究で磨いた仮説検証力を土台に、実務の制約下で優先順位を考える力を伸ばしたい。",
            "example_bad": "私は{intern_name}に参加したい理由は、参加してみたいからだ。",
        },
    },
    "validation_policy": {
        "requires_company_rag": True,
        "grounding_level": "standard",
        "evaluation_checks": {
            "repeated_opening_pattern": r"(参加理由|志望理由)は",
            "head_sentence_window": 2,
            "anchor_type": "intern",
            "anchor_pattern": r"インターン|プログラム|インターンシップ",
            "practice_context_pattern": r"実務|現場|課題|就業|体験",
            "head_focus_pattern": r"参加|志望|理由|惹|魅力|学びたい|学びたく|身につけたい|得たい|挑戦したい|試したい|試し(?:ながら|て)|実践したい|実践的|期待|関心|魅力を感|惹か|ふさわしい|最適|身を置きたい|触れたい|体感|機会|鍛え",
            "answer_focus_message": "冒頭でなぜそのインターンに参加したいかを短く言い切ってください。",
        },
        "evaluation_axes": [
            {"name": "学びたいことの核", "pass_condition": "参加目的が冒頭で1点に絞られている", "rewrite_instruction": "学びたい、検証したい対象を具体動詞で示す"},
            {"name": "根拠になる経験や問題意識", "pass_condition": "なぜ学びたいのかを支える経験がある", "rewrite_instruction": "経験、気づき、必要性、参加目的の因果をつなぐ"},
            {"name": "プログラムとの接点", "pass_condition": "インターン内容と自分の目的が結びついている", "rewrite_instruction": "企業魅力の羅列ではなく、プログラム内容と目標の接点に絞る"},
            {"name": "主体的姿勢", "pass_condition": "試したい、検証したい等の能動表現がある", "rewrite_instruction": "教えていただきたい、触れてみたい等の受け身表現を避ける"},
        ],
    },
    "retry_policy": {
        "guidance_by_failure": {
            "under_min": "{target_hint} を狙い、参加理由から経験、得たい学びへの橋渡しを補う",
            "answer_focus": "1文目で参加したい理由の核を短く言い切る",
            "grounding": "インターンの価値との接点を1点だけ明確にする",
            "structure": "参加理由が複数あるときは「理由は二つある。第一に〜第二に〜」で数を宣言し、各々に経験根拠と学び目標を完結させる",
        },
    },
}
