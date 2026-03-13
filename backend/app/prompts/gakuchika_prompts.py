"""
Gakuchika (ガクチカ) Prompt Templates

Centralized prompt constants for the gakuchika deep-dive feature.
Used by backend/app/routers/gakuchika.py via .format() templating.
"""

# Shared prohibition list for question generation prompts
PROHIBITED_EXPRESSIONS = """### 禁止表現パターン（絶対に使わない）
以下のパターンに該当する表現は全て禁止:
- 「〜してください」で終わる依頼文（「教えてください」「聞かせてください」「説明してください」）
- 「もう少し」「詳しく」「具体的に」等の漠然とした深掘り依頼
- 「他にありますか」「何かありますか」等の列挙依頼
- 「どうでしたか」「いかがでしたか」等のyes/no誘導
- 「先ほど『〇〇』とおっしゃいましたが」等の不自然な定型引用
- 「〇〇とのことですが」で毎回始める硬い書き出し
- 毎回ほぼ同じ書き出しで始める単調な質問文"""

QUESTION_QUALITY_PRINCIPLES = """## 質問品質の原則
- 派手な結果より、課題設定・判断理由・工夫・仕組み化の過程を優先する
- 1問で広く浅く聞かず、同じエピソードの1本の因果線を縦に深掘りする
- 「何が起きたか」だけでなく、「なぜそれを本当の課題と見たか」を確認する
- 学生本人の役割・裁量・他者との分担が自然に伝わる聞き方にする
- 面接官が情景を思い浮かべられる場面、前後差、比較軸を引き出す
- 行動は「何をしたか」だけでなく「なぜその方法を選んだか」まで掘る
- 結果は数字の有無だけでなく、そこから得た学びが次に再現できる形かを見る
- 不自然に盛った印象を与える質問、社員や他者の役割を奪う前提の質問は避ける"""

REFERENCE_GUIDE_RUBRIC = """## 参考ルーブリック
- 面接官の懐疑心を生まないよう、本人の権限・役割範囲に収まる事実から掘る
- 課題は表面的な困りごとではなく、なぜそれが組織や成果に影響したかまで確認する
- 行動は実施内容だけでなく、代替案比較・判断理由・順番の設計まで掘る
- 失敗やズレがある場合は、原因分析と次の打ち手までつながる質問にする
- 盛った成果より、等身大の役割・周囲との分担・仕組み化の工夫を優先する
- 回答の中の「撒き餌」になっているキーワードは拾うが、論点を増やさず1本に絞る
- 最後は学びを一般論で閉じず、次に再現できる行動原則へ接続する"""


# STAR評価プロンプト (standalone use)
# Used with: .format(conversation=...)
STAR_EVALUATION_PROMPT = """以下のガクチカ会話を分析し、STAR法の各要素の充実度を0-100で評価してください。

## 評価基準

### 状況(Situation) 0-100点
- 0-30点: 時期・場所・規模の記載なし
- 31-50点: 一部記載あり(例: 「サークルで」)
- 51-70点: 具体的だが数字なし(例: 「大学2年のサークルで」)
- 71-90点: 具体的で数字あり(例: 「大学2年の秋、30人規模のテニスサークルで」)
- 91-100点: 背景の社会的文脈まで説明

### 課題(Task) 0-100点
- 0-30点: 課題が不明確
- 31-50点: 課題は分かるが「なぜ課題か」が不明
- 51-70点: 課題と理由あり(例: 「参加率低下で大会出場が危うい」)
- 71-90点: 課題の深刻さ・自分の責任範囲が明確
- 91-100点: 複数の観点から課題を分析

### 行動(Action) 0-100点
- 0-30点: 何をしたか不明確
- 31-50点: 行動はあるが課題との因果関係が不明
- 51-70点: 課題に対する行動とその理由あり
- 71-90点: 工夫・試行錯誤・他者の巻き込み方あり（「なぜその方法を選んだか」が明確）
- 91-100点: PDCAサイクル・チームでの役割・独自性まで明確

### 結果(Result) 0-100点
- 0-30点: 結果が不明確(「うまくいった」等)
- 31-50点: 定性的な結果のみ(「改善された」等)
- 51-70点: 定量的な結果あり(数字)
- 71-90点: 数字 + そこから得た学び・気づき
- 91-100点: 学びの汎用性・他場面での再現性まで言及

## スコアリング注意事項
- 会話の中で一度でも具体的に言及された内容は、その時点で反映する
- 同じ要素の情報が複数ある場合、最も具体的なものでスコアリング
- 「言及はあるが曖昧」は上位バンドに入れない
- 実績の盛りすぎ・役割過大表現・因果不明の主張は減点する
- 数字がない場合でも、比較軸（前後差・人数差・期間差）があれば部分加点する
- 学びは抽象語だけでなく、再現可能な行動原則まで示せているかを重視する
- 面接官が「本当にその立場でそこまでできるのか」と疑いそうな箇所は credibility / role_scope_validity を低めにする
- 派手な成果よりも、課題設定・判断理由・仕組み化・再現性がある場合を高く評価する
- 面接官が情景を想像できる場面描写や、前後比較・他案比較がある場合は加点する

## 会話履歴
{conversation}

## 出力形式
必ず以下のJSON形式で回答してください:
{{
  "scores": {{
    "situation": 0-100の数値,
    "task": 0-100の数値,
    "action": 0-100の数値,
    "result": 0-100の数値
  }},
  "hidden_eval": {{
    "credibility": 0-100の数値,
    "role_scope_validity": 0-100の数値,
    "scene_vividness": 0-100の数値,
    "transferability": 0-100の数値
  }},
  "missing_aspects": {{
    "situation": ["不足している観点1", "不足している観点2"],
    "task": ["不足している観点1"],
    "action": ["不足している観点1", "不足している観点2"],
    "result": ["不足している観点1"]
  }},
  "quality_rationale": ["今回の評価理由1", "今回の評価理由2"],
  "risk_flags": ["面接官が懸念しうる点を最大2つ"]
}}"""


# 統合プロンプト: STAR評価 + 質問生成
# Used with: .format(gakuchika_title=..., conversation=..., phase_name=...,
#   phase_description=..., preferred_focuses=...,
#   preferred_target_elements=..., prohibited_expressions=..., threshold=...)
STAR_EVALUATE_AND_QUESTION_PROMPT = """あなたは就活生向けの深掘りコーチです。学生の経験を、面接で伝わる形に整理する質問を1つだけ返してください。

## テーマ
{gakuchika_title}

## 会話履歴
{conversation}

## 会話フェーズ
- 現在: {phase_name}
- 意図: {phase_description}
- 優先したい深掘り観点: {preferred_focuses}
- 優先したいSTAR要素: {preferred_target_elements}

{question_quality_principles}
{reference_guide_rubric}

## 評価ルール
- STAR の 4 要素を 0-100 点で評価する
- 具体的な時期・人数・前後比較・判断理由・学びは加点する
- 抽象語だけ、因果不明、役割過大、数字の根拠不足は加点しない
- 次質問は、直前回答の同じエピソードを縦に深掘りする
- 1問で複数の論点を聞かない
- 課題の深さ、役割の妥当性、具体場面、学びの再現性のうち、いちばん不足している1点だけを補う
- 自然な会話にし、硬い引用や定型句を避ける
- 迷ったら、数字より先に「なぜそう判断したか」「なぜそれを課題と見たか」を優先する
- 曖昧な深掘りではなく、scene / root_cause / decision_reason / concrete_action / result_learning / credibility_scope のどれか1つだけを狙う

{prohibited_expressions}

## 出力ルール
- JSON以外を出力しない
- コードフェンス、説明文、理由、前置きは禁止
- question を最初に出力する
- question は1文、簡潔で自然な日本語にする

## 出力形式
{{
  "question": "次の深掘り質問",
  "star_scores": {{
    "situation": 0,
    "task": 0,
    "action": 0,
    "result": 0
  }}
}}
"""


# 初回質問生成プロンプト(コンテンツあり)
# Used with: .format(gakuchika_title=..., gakuchika_content=...,
#   prohibited_expressions=...)
INITIAL_QUESTION_PROMPT = """あなたは10年以上の経験を持つ就活アドバイザーです。学生が記載したガクチカの内容を読み、最初の深掘り質問を生成してください。

## テーマ
{gakuchika_title}

## 学生が記載した内容
{gakuchika_content}

## タスク
上記の内容を読み、学生が最も印象に残っている場面や、最も力を入れた部分について尋ねる質問を生成してください。
初回質問でも、曖昧・誇張になりやすい部分を避けるため、役割や具体場面に寄せた聞き方にしてください。

{question_quality_principles}
{reference_guide_rubric}

## 質問生成ルール

{prohibited_expressions}

### 推奨: 内容に基づいた具体的な質問
- 記載内容から具体的なキーワードを引用する
- 書き出しは会話として自然にする
- 役割、当時の状況、なぜその経験が印象に残っているかのいずれかに絞る
- いきなり成果や学びだけを聞かない
- 「誰が何をしたのか」の境界が曖昧なら、まず本人の役割範囲を確認する
- いきなり抽象論に行かず、面接官が一場面を想像できる入口を作る

## 出力形式
必ず以下のJSON形式で回答してください:
{{
  "question": "質問文(内容を踏まえつつ、自然な日本語で具体的な切り口にする)"
}}"""


# 構造化サマリープロンプト
# Used with: .format(gakuchika_title=..., conversation=...)
STRUCTURED_SUMMARY_PROMPT = """あなたは就活アドバイザーです。以下のガクチカ深掘り会話の内容を分析し、STAR構造に整理してください。

## テーマ
{gakuchika_title}

## 会話履歴
{conversation}

{question_quality_principles}

## タスク
1. STAR要素を簡潔に抽出
2. 強みを2個特定（短いタイトル+説明）
3. 学びを2個特定（短いタイトル+説明）
4. 具体的な数字を抽出
5. 面接で深掘りされると強いポイントを抽出
6. 信憑性を担保する補足メモを抽出

## 出力ルール
- situation_text: 時期・場所・規模を含む状況説明（50-80字）。会話に情報なければ「記載なし」
- task_text: 「なぜ課題か」を含む課題説明（50-80字）
- action_text: 行動の理由・工夫を含む具体的行動（80-120字）
- result_text: 可能な限り数字を含む成果（50-80字）
- strengths: 2個、titleは「行動力」「分析力」等の汎用ラベルではなくエピソード固有の表現（例: 「データ駆動の改善提案力」）。descriptionは30字以内
- learnings: 2個、「コミュニケーションの大切さ」等の定型句禁止。会話で述べた学びを抽出。descriptionは30字以内
- numbers: 会話に出た具体的数字のみ（推測・捏造禁止、0個でも可）
- interviewer_hooks: 面接官が深掘りしたくなる論点を2-3個、20字以内
- decision_reasons: 判断理由や施策選定理由を最大3個
- before_after_comparisons: 前後差・比較軸を最大3個
- credibility_notes: 面接で突っ込まれた時に補足すべき事実を最大2個
- role_scope: 自分の責任範囲を40字以内で
- reusable_principles: 入社後にも再現できる行動原則を最大3個
- JSONのみ出力。説明文やマークダウンは禁止

## 出力形式
必ず以下のJSON形式で回答してください:
{{
  "situation_text": "...",
  "task_text": "...",
  "action_text": "...",
  "result_text": "...",
  "strengths": [{{"title": "強みの名前", "description": "具体的な説明"}}],
  "learnings": [{{"title": "学びの名前", "description": "具体的な説明"}}],
  "numbers": ["数字や成果"],
  "interviewer_hooks": ["深掘りポイント"],
  "decision_reasons": ["判断理由"],
  "before_after_comparisons": ["比較軸"],
  "credibility_notes": ["補足メモ"],
  "role_scope": "自分の責任範囲",
  "reusable_principles": ["再現可能な原則"]
}}"""


# ガクチカES下書き生成プロンプト
# Used with: .format(char_limit=..., gakuchika_title=...,
#   structured_summary_section=..., conversation=..., char_min=...)
GAKUCHIKA_DRAFT_PROMPT = """以下のガクチカ深掘り会話から、{char_limit}字程度のガクチカESを作成してください。

## テーマ
{gakuchika_title}

{structured_summary_section}

## 会話内容
{conversation}

## 作成ルール
1. だ・である調で統一
2. 文字数: {char_min}〜{char_limit}字（厳守）
3. 構成:
   - 導入（15%）: 取り組みの結論・概要を一文で
   - 本論（70%）: 状況→課題→行動（具体的な工夫・判断理由を重点的に）
   - 結論（15%）: 数字を含む成果と、学び・今後への応用
4. 会話で出た具体的なエピソード・数字を必ず活用する
5. 「私は」で始め、面接官に「もっと聞きたい」と思わせる深さ
6. 抽象的な表現を避け、自分だけの具体的な経験を描写する
7. 成果を盛りすぎず、役割範囲と因果関係が自然に読めるようにする
8. 最後は学びだけで終わらず、再現可能な強みや行動原則が伝わるようにする

## 出力形式
必ず以下のJSON形式で回答:
{{
  "draft": "ガクチカ本文（{char_min}〜{char_limit}字）",
  "char_count": 実際の文字数
}}"""
