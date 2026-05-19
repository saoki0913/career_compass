"""Template definition for ES review: self_pr."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
    "label": "自己PR",
    "rewrite_policy": {
        "description": "強み、その根拠となる経験、企業や職種での活かし方を述べる設問。",
        "purpose": "自分の強みと、その再現性を裏づける経験を一貫して示す。",
        "required_elements": ["強みの核", "根拠になる経験", "仕事や役割での活かし方"],
        "anti_patterns": [
            "強みの名前だけで根拠がない",
            "経験が説明で終わり再現性が見えない",
            "自己否定語をそのまま残す",
            "強みを裏付ける経験で「整理した」「取り組んだ」「向き合った」だけで済ませる",
            "最終文で「この強みを活かして貢献したい」と定型的に締める",
            "強みの名前を冒頭と末尾で繰り返し、新情報なしで終わる",
        ],
        "structure_short": "1文目で強みの核、2文目で根拠経験、必要なら3文目で仕事や企業との接点を置く",
        "three_sentence_close_on_short_band": True,
        "negative_reframe_guidance": [
            "「経験不足」「自信がない」などの自己否定語をそのまま残さない",
            "元の事実は保ちつつ、準備・責任感・学習姿勢・確認力などの前向きな表現に言い換える",
            "弱さの告白で締めず、仕事で再現できる行動特性で締める",
        ],
        "rewrite_closing_guidance": (
            "結びで自分の強みを志望先の業務文脈に接続してよい。"
            "元回答にない具体的な業務名・技術名は追加しない"
        ),
        "company_usage": "assistive",
        "fact_priority": "self",
    },
    "validation_policy": {
        "requires_company_rag": False,
        "grounding_level": "light",
        "evaluation_checks": {
            "repeated_opening_pattern": r"(自己PR|自己ＰＲ)(?:として|で|は)|私の強みは|アピールしたいことは|自己紹介としては",
            "head_sentence_window": 2,
            "head_focus_pattern": r"強み|長所|得意|アピール|特徴|資質|性格|スキル|信念|指針|軸|他者と(?:の)?違い|差別化|強みとして|スキルとして|自分(?:自身)?(?:の)?|私(?:自身)?(?:の)?|一つ(?:の)?|まず|最も",
            "answer_focus_message": "冒頭で自分の強みやアピールの核を短く示してください。",
            "negative_self_eval_patterns": ["経験不足", "自信がない", "自信はない"],
        },
        "evaluation_axes": [
            {"name": "強みの核の明示", "pass_condition": "冒頭で強みが具体的に定義されている", "rewrite_instruction": "強み名だけでなく、どの場面でどう発揮する力かを書く"},
            {"name": "経験による裏づけ", "pass_condition": "強みを発揮した具体エピソードがある", "rewrite_instruction": "場面、行動、結果が見える1つの経験に絞る"},
            {"name": "成果の可視化", "pass_condition": "成果が数字または具体的な変化として示されている", "rewrite_instruction": "うまくいった、好評だったを客観的な変化に直す"},
            {"name": "仕事での活かし方", "pass_condition": "入社後に強みをどう活かすか具体的", "rewrite_instruction": "活かしたいだけで終えず、業務場面や価値発揮につなげる"},
            {"name": "再現性の提示", "pass_condition": "一回限りでなく再現可能な力として伝わる", "rewrite_instruction": "行動プロセスを汎用スキルとして読める形にする"},
        ],
    },
    "retry_policy": {
        "guidance_by_failure": {
            "under_min": "{target_hint} を狙い、強みから経験、再現性へのつながりを補う",
            "answer_focus": "1文目で強みの核を短く言い切る",
            "grounding": "強みと企業との接点を自然な範囲で1点示す",
            "quantify": "抽象的な強みの説明だけで終えず、行動の対象・範囲・頻度を具体化し、元回答にある数値は保持する",
            "structure": "複数のエピソードは地の文でつなぎ、各々「場面→行動→変化」を完結させる",
        },
    },
}
