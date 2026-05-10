"""Template definition for ES review: work_values."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
        "label": "働くうえで大切にしている価値観",
        "requires_company_rag": False,
        "grounding_level": "light",
        "description": "仕事に対する価値観や姿勢を述べる設問。",
        "purpose": "働くうえで大切にしている価値観を、経験とともに一貫して示す。",
        "required_elements": ["価値観の核", "根拠になる経験", "仕事での表れ方"],
        "anti_patterns": [
            "価値観の言葉だけで根拠がない",
            "抽象論が続き本人らしさが見えない",
            "企業接続を無理に入れて主題がぼける",
        ],
        "recommended_structure": {
            "short": "1文目で価値観の核、2文目で根拠経験、必要なら3文目で仕事との接点を置く",
            "three_sentence_close_on_short_band": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(大切にしている価値観|働くうえで大切にしていること)は",
            "head_sentence_window": 2,
            "head_focus_pattern": r"大切|重視|価値観|信念|軸|譲れない|譲りたくない|姿勢|こだわり|大事にしている|考え方|モットー|指針|プライド|根底|念頭|秉|大切にしたい|尊重",
            "answer_focus_message": "冒頭で大切にしている価値観や姿勢の核を短く示してください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、価値観から経験、仕事での表れ方へのつながりを補う",
            "answer_focus": "1文目で価値観の核を短く示す",
            "grounding": "価値観が仕事でどう表れるかの接点を1点示す",
            "quantify": "価値観の抽象説明だけで終えず、行動の対象・範囲・頻度を具体化し、元回答にある数値は保持する",
            "structure": "複数の実証エピソードは地の文でつなぎ、各々「場面→行動→変化」を完結させる",
        },
        "rewrite_closing_guidance": (
            "結びで価値観を志望先の事業特性に接続してよい。"
            "企業根拠カードにない固有施策・数値を新たに追加しない"
        ),
        "company_usage": "assistive",
        "fact_priority": "self",
        "evaluation_axes": [{'name': '価値観の核の明示',
          'pass_condition': '大切にする価値観が具体的な行動指針として示されている',
          'rewrite_instruction': '挑戦、チームワーク等の一語で終えず、行動レベルで定義する'},
         {'name': '経験による裏づけ', 'pass_condition': '価値観が形成・強化された経験がある', 'rewrite_instruction': '場面、葛藤、気づきが見える経験につなげる'},
         {'name': '仕事への投影', 'pass_condition': '仕事でどう体現するか具体的に示されている', 'rewrite_instruction': '大切にしたいで終えず、業務での行動に落とす'},
         {'name': '一貫性', 'pass_condition': '価値観が日常や複数場面でも現れていると読める', 'rewrite_instruction': '一回限りの主張でなく、判断基準として伝える'},
         {'name': 'トレードオフ認識', 'pass_condition': '価値観を貫く際の葛藤や兼ね合いがある', 'rewrite_instruction': '字数が許す範囲で困難や判断の深さを示す'}],
    }
