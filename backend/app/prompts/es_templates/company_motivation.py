"""Template definition for ES review: company_motivation."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
    "label": "企業志望理由",
    "rewrite_policy": {
        "description": "企業への志望理由を述べる設問。企業の特徴・事業・価値観との接点を示す。",
        "purpose": "なぜその企業なのかを、自分の経験や関心と企業理解につないで示す。",
        "required_elements": ["志望理由の核", "根拠になる経験", "企業理解との接点", "入社後の価値発揮"],
        "anti_patterns": [
            "どの企業にも当てはまる一般論",
            "企業説明だけで終わり自分との接続がない",
            "志望理由の言い換えだけで始める",
        ],
        "structure_short": "1文目で志望理由、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "dense_short_answer": True,
        "composition_ratio": "導入15% / 本論70% / 締め15%",
        "why_now_hint": "可能なら「なぜ今この会社か」が伝わる一節を含める",
        "rewrite_closing_guidance": (
            "結びで元回答の経験と企業根拠カードの方向性を接続した貢献像を述べてよい。"
            "企業根拠カードにない固有施策・数値を新たに追加しない"
        ),
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "{honorific}を志望する理由",
            "opening": "1文目で{honorific}を志望する理由の核を言い切る",
            "second": "2文目で元回答の経験を1点だけ出す",
            "third": "3文目で企業理解との接点を1点だけつなぐ。理由を複数出す場合は「第一に〜第二に〜」で順序を示す",
            "fourth": "4文目で入社後の貢献で締める",
            "example_good_1": "私が{honorific}を志望するのは、事業を通じて社会課題に向き合う姿勢に魅力を感じたからだ。",
            "example_good_2": "研究で仮説検証を重ねた経験を土台に、現場で事業理解を深め、価値創出につなげたい。",
            "example_bad": "私は{honorific}を志望する理由は、{honorific}の魅力に惹かれたからだ。",
        },
    },
    "validation_policy": {
        "requires_company_rag": True,
        "grounding_level": "deep",
        "evaluation_checks": {
            "repeated_opening_pattern": r"(志望する理由|志望理由)は",
            "head_sentence_window": 3,
            "anchor_type": "company",
            "head_focus_pattern": r"志望|惹|魅力|理由|価値|からだ|ためだ|関心|期待|共感|惹か",
            "answer_focus_message": "冒頭でなぜこの会社かを短く言い切ってください（企業名または貴社と志望の核を含む）。",
        },
        "evaluation_axes": [
            {"name": "志望理由の核", "pass_condition": "その企業を志望する理由の核が冒頭で明確", "rewrite_instruction": "業界説明や自己紹介から入らず、志望理由を結論として短く示す"},
            {"name": "経験との接続", "pass_condition": "自身の経験と志望理由が因果でつながっている", "rewrite_instruction": "この経験から、という接続で原体験と企業選択をつなぐ"},
            {"name": "企業固有性", "pass_condition": "その企業ならではの根拠が1点に絞られている", "rewrite_instruction": "企業特徴の羅列を避け、事業・価値観・制度のうち1軸に絞る"},
            {"name": "入社後の価値発揮", "pass_condition": "入社後に何をどう貢献するか具体的", "rewrite_instruction": "成長したい、貢献したいで終えず、行動計画に落とす"},
            {"name": "競合差別化の根拠", "pass_condition": "同業他社ではなくその企業を選ぶ理由が読み取れる", "rewrite_instruction": "他社名は出さず、この企業ならではの接点を自然に示す"},
        ],
    },
    "retry_policy": {
        "guidance_by_failure": {
            "under_min": "{target_hint} を狙い、既にある経験から企業接点と貢献への橋渡しを1文補う",
            "answer_focus": "1文目でなぜその企業を志望するのかを短く言い切る",
            "grounding": "企業理解との接点を1点だけ明確にする",
            "structure": "志望理由が複数あるときは「理由は二点ある。第一に〜第二に〜」で数を宣言し、各々「根拠→企業接点→貢献」を完結させる",
        },
    },
}
