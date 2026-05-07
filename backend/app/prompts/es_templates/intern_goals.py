"""Template definition for ES review: intern_goals."""

from __future__ import annotations

from ._types import TemplateDef


TEMPLATE_DEF: TemplateDef = {
        "label": "インターンでやりたいこと・学びたいこと",
        "requires_company_rag": True,
        "grounding_level": "standard",
        "description": "インターンで達成したい目標や学びたいことを述べる設問。",
        "extra_fields": ["intern_name"],
        "purpose": "インターンで何を学びたいか、なぜそれを得たいかを経験とともに示す。",
        "required_elements": ["学びたいことの核", "根拠になる経験や問題意識", "プログラムとの接点", "成長イメージ"],
        "anti_patterns": [
            "学びたいことが曖昧で広すぎる",
            "インターンの文脈が見えない",
            "経験や問題意識との接続がない",
        ],
        "recommended_structure": {
            "short": "1文目で学びたいこと、2文目で根拠経験、必要なら3文目でインターン接点を置く",
            "mid": "1文目で学びたいこと、2文目で根拠経験、3文目でプログラム接点、4文目で成長イメージを置く。学びたいことを複数出す場合は「1つ目は〜2つ目は〜」で順序を示す",
            "dense_short_answer": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(学びたいこと|やりたいこと)は",
            "head_sentence_window": 3,
            "anchor_type": "intern",
            "anchor_pattern": r"インターン|プログラム|インターンシップ",
            "practice_context_pattern": r"実務|現場|分析|学び|意思決定|優先|仮説|課題|顧客|価値",
            "head_focus_pattern": r"学びたい|身につけたい|やりたい|獲得したい|高めたい|磨きたい|確かめたい|得たい|習得したい|鍛えたい|深めたい|試したい|経験したい|積みたい|培いたい|伸ばしたい",
            "answer_focus_message": "冒頭でインターンで何を学びたいかを短く言い切ってください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、学びたいことから経験、成長イメージへの橋渡しを補う",
            "answer_focus": "1文目で学びたいことの核を短く言い切る",
            "grounding": "プログラムとの接点を1点だけ明確にする",
            "structure": "学習目標が複数あるときは「目標は2つある。1つ目は〜2つ目は〜」で数を宣言し、各々に課題と成長イメージを完結させる",
        },
        "rewrite_closing_guidance": (
            "結びでインターン経験を将来のキャリア像に接続してよい。"
            "元回答にない具体的な職種名・企業施策は追加しない"
        ),
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "{intern_name}で学びたいこと",
            "opening": "1文目で学びたいことの核を言い切る（学びたい・確かめたい・得たい・磨きたいのいずれかを含める）",
            "second": "2文目で元回答の経験や問題意識を1点だけ出す",
            "third": "3文目でそのインターンで得たい学びとの接点を1点だけつなぐ。複数学びなら「1つ目は〜2つ目は〜」で順序を示す",
            "fourth": "4文目で将来の成長イメージで締める",
            "example_good_1": "{intern_name}では、実務に近い課題の中で分析の精度と判断の速さを学びたい。",
            "example_good_2": "研究で培った整理力を土台に、チームで課題を前に進める視点を身につけたい。",
            "example_bad": "{intern_name}で学びたいことは、いろいろなことを学ぶことだ。",
        },
        "evaluation_axes": [{'name': '学びの核の明示', 'pass_condition': 'インターンで達成したい目標が1点に絞られている', 'rewrite_instruction': 'いろいろ学びたいを避け、何をできるようにするかを書く'},
         {'name': '経験・問題意識の根拠', 'pass_condition': '目標に至った経験や課題感が示されている', 'rewrite_instruction': '経験から気づき、必要性、学びたいことへ因果を通す'},
         {'name': 'プログラム接点', 'pass_condition': 'プログラム内容と目標の関係が明確', 'rewrite_instruction': 'どの企業にも使える一般論ではなく、内容との接点を書く'},
         {'name': '成長イメージ', 'pass_condition': '参加後にどう活かすかが示されている', 'rewrite_instruction': '学びたいだけで終えず、次の行動や成長方向で締める'},
         {'name': '目標の焦点', 'pass_condition': '何ができれば成功かが読み取れる', 'rewrite_instruction': '達成条件が想像できる表現に具体化する'}],
    }
