"""
Gakuchika (ガクチカ) Prompt Templates

Centralized prompt constants for the gakuchika deep-dive feature.
Used by backend/app/routers/gakuchika.py via .format() templating.
"""

from app.prompts.notion_registry import get_managed_prompt_content

# Shared prohibition list for question generation prompts
_PROHIBITED_EXPRESSIONS_FALLBACK = """### 禁止表現パターン（絶対に使わない）
以下のパターンに該当する表現は全て禁止:
- 「〜してください」で終わる依頼文（「教えてください」「聞かせてください」「説明してください」）
- 「もう少し」「詳しく」「具体的に」等の漠然とした深掘り依頼
- 「他にありますか」「何かありますか」等の列挙依頼
- 「どうでしたか」「いかがでしたか」等のyes/no誘導
- 「先ほど『〇〇』とおっしゃいましたが」等の不自然な定型引用
- 「〇〇とのことですが」で毎回始める硬い書き出し
- 毎回ほぼ同じ書き出しで始める単調な質問文"""
PROHIBITED_EXPRESSIONS = get_managed_prompt_content(
    "gakuchika.prohibited_expressions",
    fallback=_PROHIBITED_EXPRESSIONS_FALLBACK,
)

_QUESTION_QUALITY_PRINCIPLES_FALLBACK = """## 質問品質の原則
- 短い入力からでも、完成度の高いガクチカ文章に育てるために必要な情報だけを集める
- 派手な結果より、課題設定・判断理由・工夫・仕組み化の過程を優先する
- 1問で広く浅く聞かず、同じエピソードの1本の因果線を縦に深掘りする
- 会話に出ていない別の活動・未登場の人物・未言及の設定を仮定して質問しない（エピソードのすり替え禁止）
- 「何が起きたか」だけでなく、「なぜそれを本当の課題と見たか」を、既に述べた事実に接続して確認する
- 学生本人の役割・裁量・他者との分担が自然に伝わる聞き方にする。本人と周囲の役割境界が曖昧なら、その境界を確認する質問にする
- 面接官が情景を思い浮かべられる場面、前後差、比較軸を引き出す（情景が薄いフェーズでは場面寄り、学びが薄いフェーズでは再現可能な行動原則寄り）
- 行動は「何をしたか」だけでなく「なぜその方法を選んだか」まで掘る
- 結果は数字の有無だけでなく、そこから得た学びが次に再現できる形かを見る
- 不自然に盛った印象を与える質問、本人の権限を超えた前提の質問は避ける
- 複数の打ち手や施策が会話に出ているときは、列挙を広げず「いま追う一本の線」を選び、その打ち手を選んだ判断軸か、他と比べて何を後回しにしたかのどちらか一方だけを聞く
- 現象・困りごとと「本当に解きたかった課題」が混ざっているときは、いつ・何をきっかけに課題だと認識したかを、すでに述べた事実に接続して聞く
- 上長・本部・社員など他者の関与が示唆されるときは、指示と自主の切り分け（何を任され、何を自ら決めたか）を同じ場面で1点だけ確認する
- 意見の食い違いや対立に触れているときは、論点を増やさず「目標の再確認」か「合意に至った理由」のどちらか一方に絞って聞く
- 失敗・効果の切れ・想定外に触れているのに、原因の見立てと次の打ち手がセットで語られていなければ、そのギャップを1問で埋める
- 成果や打ち手は語られているのに、当時の目標や「うまくいったか」の基準（定性でも定量でもよい）が会話上まだ曖昧なときだけ、すでに述べた事実に接続して1点だけ確認する（目標がはっきりしているなら無理に聞かない）
- マニュアル・ルール・手順を自分たちで整えたと話しているのに、会社・本部など共通の枠組みと現場独自の範囲の切り分けが曖昧なときだけ、等身大の役割に収まるよう1点だけ確認する（触れていないなら仮定して聞かない）"""
QUESTION_QUALITY_PRINCIPLES = get_managed_prompt_content(
    "gakuchika.question_quality_principles",
    fallback=_QUESTION_QUALITY_PRINCIPLES_FALLBACK,
)

_REFERENCE_GUIDE_RUBRIC_FALLBACK = """## 参考ルーブリック（面接深掘りの要点）
- 面接官の懐疑心を生まないよう、本人の権限・役割範囲に収まる事実から掘る
- 課題は表面的な困りごとではなく、なぜそれが成果や現場に効いたのか（課題選定の筋の良さ）まで確認する
- 行動は実施内容だけでなく、代替案比較・判断理由・順番の設計まで掘る
- 失敗・予定外・ズレに触れている場合は、原因の見立てと次に取った打ち手まで、1本の因果で聞く
- 盛った成果より、等身大の役割・周囲との分担・仕組み化の工夫を優先する
- 回答の中の「撒き餌」になっているキーワードは拾うが、論点を増やさず1本の線で深掘りする
- 学びは抽象語だけで終わらせず、次に再現できる行動原則へ接続する質問にする
- ユーザーが複数の具体策に触れた直後でも、「ほかには」「別の施策は」と広げず、直前に話した一本に沿って深掘りする
- 組織やチームとして何を達成したいか・何をもって成功とみなすかが曖昧だと説得力が落ちるため、会話に既に出ている文脈だけを手がかりに、目標や評価の軸を1点だけ補う
- 独自の仕組み・手順の主張があるときは、共通ルールの上での補完なのかゼロからの整備なのかが曖昧だと懐疑心につながるため、本人の権限の範囲で1点だけ確認する"""
REFERENCE_GUIDE_RUBRIC = get_managed_prompt_content(
    "gakuchika.reference_guide_rubric",
    fallback=_REFERENCE_GUIDE_RUBRIC_FALLBACK,
)


# 統合プロンプト: STAR評価 + 質問生成
# Used with: .format(gakuchika_title=..., conversation=..., phase_name=...,
#   phase_description=..., preferred_focuses=...,
#   preferred_target_elements=..., prohibited_expressions=..., threshold=...)
_STAR_EVALUATE_AND_QUESTION_PROMPT_FALLBACK = """あなたは就活生向けの深掘りコーチです。学生の経験を、面接で伝わる形に整理する質問を1つだけ返してください。

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
- 曖昧な深掘りではなく、anchor / challenge / action_decision / result_evidence / learning_transfer / credibility_scope のどれか1つだけを狙う
- 禁止: ユーザーがまだ話していない別エピソードへ誘導すること、未登場の第三者や組織を前提にした聞き方
- 禁止: 列挙を広げる聞き方（「ほかにも」「別の施策は」等）で、まだ触れていない別の打ち手へ誘導すること

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
STAR_EVALUATE_AND_QUESTION_PROMPT = get_managed_prompt_content(
    "gakuchika.star_evaluate_and_question",
    fallback=_STAR_EVALUATE_AND_QUESTION_PROMPT_FALLBACK,
)


# 初回質問生成プロンプト(コンテンツあり)
# Used with: .format(gakuchika_title=..., gakuchika_content=...,
#   prohibited_expressions=...)
_INITIAL_QUESTION_PROMPT_FALLBACK = """あなたは10年以上の経験を持つ就活アドバイザーです。学生が記載したガクチカの内容を読み、最初の深掘り質問を生成してください。

## テーマ
{gakuchika_title}

## 学生が記載した内容
{gakuchika_content}

## タスク
上記の内容を読み、学生が最も印象に残っている場面や、最も力を入れた部分について尋ねる質問を生成してください。
初回質問でも、曖昧・誇張になりやすい部分を避けるため、役割や具体場面に寄せた聞き方にしてください。
質問は必ず上記「学生が記載した内容」と同じエピソード・同じ主題に留め、記載にない別活動や別テーマへ誘導しないこと。

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
- 記載にない別の活動や人物を持ち出さない。曖昧なら本人の役割や当時の状況から入る

## 出力形式
必ず以下のJSON形式で回答してください:
{{
  "question": "質問文(内容を踏まえつつ、自然な日本語で具体的な切り口にする)"
}}"""
INITIAL_QUESTION_PROMPT = get_managed_prompt_content(
    "gakuchika.initial_question",
    fallback=_INITIAL_QUESTION_PROMPT_FALLBACK,
)


# 構造化サマリープロンプト
# Used with: .format(gakuchika_title=..., conversation=...)
_STRUCTURED_SUMMARY_PROMPT_FALLBACK = """あなたは就活アドバイザーです。以下のガクチカ深掘り会話の内容を分析し、STAR構造に整理してください。

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
STRUCTURED_SUMMARY_PROMPT = get_managed_prompt_content(
    "gakuchika.structured_summary",
    fallback=_STRUCTURED_SUMMARY_PROMPT_FALLBACK,
)


# ガクチカES下書き生成プロンプト
# Used with: .format(char_limit=..., gakuchika_title=...,
#   structured_summary_section=..., conversation=..., char_min=...)
_GAKUCHIKA_DRAFT_PROMPT_FALLBACK = """以下のガクチカ深掘り会話から、{char_limit}字程度のガクチカESを作成してください。

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
GAKUCHIKA_DRAFT_PROMPT = get_managed_prompt_content(
    "gakuchika.draft_generation",
    fallback=_GAKUCHIKA_DRAFT_PROMPT_FALLBACK,
)
