"""Template definition for ES review: post_join_goals."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
    "label": "入社後やりたいこと",
    "rewrite_policy": {
        "description": "入社後のキャリアビジョンや挑戦したいことを述べる設問。",
        "purpose": "入社後にやりたいことを、自分の経験と企業の方向性につなげて示す。",
        "required_elements": ["やりたいことの核", "根拠になる経験や原体験", "企業や事業との接点", "価値発揮の方向性"],
        "anti_patterns": [
            "やりたいことが抽象的で広すぎる",
            "企業や事業との接点がない",
            "意気込みだけで具体的な価値発揮が見えない",
        ],
        "structure_short": "1文目でやりたいこと、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "dense_short_answer": True,
        "rewrite_closing_guidance": (
            "結びで短期目標から中長期のキャリア像に自然に接続してよい。"
            "ただし元回答の経験・志望動機から論理的に導ける範囲に留め、具体的な部署名・プロジェクト名を新たに追加しない"
        ),
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "入社後に挑戦したいこと",
            "opening": "1文目で入社後の挑戦の核を言い切る",
            "second": "2文目で元回答の経験や原体験を1点だけ出す",
            "third": "3文目で企業や事業との接点を1点だけつなぐ。短期・中長期を並べる場合は本文内で順序を示す",
            "fourth": "4文目で中長期の価値発揮で締める",
            "example_good_1": "入社後は、現場で事業理解を深めながら論点整理を担い、価値創出につなげたい。",
            "example_good_2": "研究で論点を整理した経験を土台に、関係者を巻き込みながら事業を前進させたい。",
            "example_bad": "入社後に挑戦したいことは、入社後に頑張っていきたいということである。",
        },
    },
    "validation_policy": {
        "requires_company_rag": True,
        "grounding_level": "standard",
        "evaluation_checks": {
            "head_sentence_window": 3,
            "head_focus_pattern": r"入社後|将来|キャリア|仕事|業務|職場|携わりたい|挑戦したい|担いたい|実現したい|貢献したい|目標|手掛け|ビジネス|投資|事業機会|価値創出|獲得したい|極めたい|従事|取り組みたい|身を置き|発揮したい|成し遂げ|やりたい|務めたい",
            "answer_focus_message": "冒頭で入社後にやりたいことや手掛けたいことを短く言い切ってください。",
        },
        "evaluation_axes": [
            {"name": "目標の核の明示", "pass_condition": "入社後に実現したいことが具体的に示されている", "rewrite_instruction": "成長したい、活躍したいを避け、実現したい対象を書く"},
            {"name": "原体験・経験の接続", "pass_condition": "目標が自身の経験から自然に導かれている", "rewrite_instruction": "経験、気づき、実現したいことの因果をつなぐ"},
            {"name": "企業・事業との接点", "pass_condition": "企業の事業や方向性と目標が結びついている", "rewrite_instruction": "企業特徴の羅列ではなく、目標実現の根拠に絞る"},
            {"name": "価値発揮の方向性", "pass_condition": "何にどう貢献するかが示されている", "rewrite_instruction": "貢献したいで終えず、対象と方法を具体化する"},
            {"name": "事業理解の深さ", "pass_condition": "企業の注力領域や課題への理解が表面的でない", "rewrite_instruction": "HPコピー調を避け、自分の目標との関係で示す"},
        ],
    },
    "retry_policy": {
        "guidance_by_failure": {
            "under_min": "{target_hint} を狙い、やりたいことから経験、価値発揮への橋渡しを補う",
            "answer_focus": "1文目で入社後にやりたいことの核を短く言い切る",
            "grounding": "企業や事業との接点を1点だけ明確にする",
            "structure": "入社後の目標が複数あるときは「やりたいことは2つある。1つ目は〜2つ目は〜」で数を宣言し、各々に経験と企業接続を完結させる",
        },
    },
}
