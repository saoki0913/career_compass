"""Template definition for ES review: role_course_reason."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
        "label": "職種・コース選択理由",
        "requires_company_rag": True,
        "grounding_level": "deep",
        "description": "特定の職種やコースを選んだ理由を述べる設問。",
        "extra_fields": ["role_name"],
        "purpose": "なぜその職種・コースを選ぶのかを、経験・適性・企業文脈につないで示す。",
        "required_elements": ["職種・コース志望の核", "根拠になる経験や適性", "役割や事業との接点", "その役割で出したい価値"],
        "anti_patterns": [
            "職種名への興味だけで終わる",
            "経験や適性との結びつきがない",
            "企業文脈がなく他社にも言える",
        ],
        "recommended_structure": {
            "short": "1文目で職種志望、2文目で根拠経験、必要なら3文目で企業接点を置く",
            "mid": "1文目で職種・コース志望、2文目で根拠経験、3文目で企業や事業との接点、4文目でその役割で出したい価値を置く。理由を複数出す場合は「第一に〜第二に〜」で順序を示す",
            "dense_short_answer": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(選んだ理由|選択した理由|志望理由)は",
            "head_sentence_window": 2,
            "anchor_type": "role",
            "anchor_pattern": r"職種|コース|業務|役割|ポジション|ジョブ",
            "head_focus_pattern": r"志望|選ぶ|理由|関心|担いたい|携わりたい|適性|適合|惹か|魅力|期待|共感",
            "answer_focus_message": "冒頭でなぜその職種・コースかを短く言い切ってください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、経験から役割理解、価値発揮への橋渡しを補う",
            "answer_focus": "1文目でなぜその職種・コースを志望するのかを短く言い切る",
            "grounding": "役割や事業との接点を1点だけ明確にする",
            "structure": "選択理由が複数あるときは「理由は二つある。第一に〜第二に〜」で数を宣言し、各々に適性根拠を完結させる",
        },
        "rewrite_closing_guidance": (
            "結びで元回答の経験・強みから導ける貢献像を述べてよい。"
            "具体的な業務名・技術名は元回答にあるものだけを使う"
        ),
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "{role_name}を志望する理由",
            "opening": "1文目でその職種・コースを志望する理由の核を言い切る（志望・魅力・担いたいのいずれかを含める）",
            "second": "2文目で元回答の経験や適性を1点だけ出す",
            "third": "3文目でその役割や事業との接点を1点だけつなぐ。複数理由なら「第一に〜第二に〜」で順序を示す",
            "fourth": "4文目でその役割で出したい価値で締める",
            "example_good_1": "私が{role_name}を志望するのは、事業と技術をつなぐ役割に魅力を感じるからだ。",
            "example_good_2": "研究で論点を整理しながら前に進めた経験を土台に、その役割で価値を出したい。",
            "example_bad": "私は{role_name}を選んだ理由は、{role_name}に興味があるからだ。",
        },
        "evaluation_axes": [{'name': '職種志望の核の明示', 'pass_condition': 'その職種を選ぶ理由の核が冒頭で明確', 'rewrite_instruction': '興味があるだけでなく、職種の本質的な魅力を書く'},
         {'name': '適性の裏づけ', 'pass_condition': '職種に適性がある経験やスキルが示されている', 'rewrite_instruction': '性格特性だけでなく、具体的な経験・行動で裏づける'},
         {'name': '役割理解', 'pass_condition': '職種の業務内容や責任範囲への理解がある', 'rewrite_instruction': 'ステレオタイプではなく、実際に担う価値を示す'},
         {'name': '貢献計画', 'pass_condition': 'その職種でどう価値を出すか具体的', 'rewrite_instruction': '活躍したいで終えず、経験と職種要求を結びつける'},
         {'name': '他職種との差別化', 'pass_condition': '他職種ではなくこの職種を選ぶ必然性がある', 'rewrite_instruction': '他職種を否定せず、この職種との親和性を示す'}],
    }
