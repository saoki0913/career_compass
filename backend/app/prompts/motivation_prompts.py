"""
Motivation (志望動機) Prompt Templates

Centralized prompt constants for the motivation deep-dive feature.
Used by backend/app/routers/motivation.py via .format() templating.
"""

# Evaluation prompt for motivation elements
# Used with: .format(conversation=..., company_context=...)
MOTIVATION_EVALUATION_PROMPT = """以下の志望動機に関する会話を分析し、4つの要素の充実度を0-100で評価してください。

## 評価基準

### 企業理解（Company Understanding）0-100点
- 0-30点: 企業について具体的な言及なし
- 31-50点: 業界や事業の一般的な理解のみ
- 51-70点: 企業の特徴・強みを1つ以上言及
- 71-90点: 企業の具体的な取り組み・数字に言及
- 91-100点: 競合との差別化ポイントまで理解

### 自己分析（Self-Analysis）0-100点
- 0-30点: 自分の経験・強みの言及なし
- 31-50点: 抽象的な強み（例: 「コミュニケーション力」）
- 51-70点: 具体的なエピソードあり
- 71-90点: エピソードと企業との接点を説明
- 91-100点: 再現性のある強みとして整理

### キャリアビジョン（Career Vision）0-100点
- 0-30点: 入社後のビジョンなし
- 31-50点: 「成長したい」等の抽象的な表現
- 51-70点: 具体的な業務・役割への言及
- 71-90点: 中長期的なキャリアパスの言及
- 91-100点: 企業の成長と自分の成長を接続

### 差別化（Differentiation）0-100点
- 0-30点: なぜこの企業かの説明なし
- 31-50点: 業界への興味のみ
- 51-70点: この企業でなければならない理由1つ
- 71-90点: 複数の理由を論理的に説明
- 91-100点: 他社との比較も含めて説明

## 会話履歴
{conversation}

## 企業情報（参考）
{company_context}

## 評価の注意事項
- 会話内で明確に言及された内容のみをスコアに反映する（推測で加点しない）
- 企業情報（RAG）と学生の発言の整合性を確認: 学生が企業名や取り組み名を正しく引用していればcompany_understandingに加点
- 「興味がある」だけではスコア50以下。具体的なエピソードや接点があって初めて50超
- 企業情報の単語を並べただけで、本人の経験・価値観との因果がない場合は加点しない
- 差別化は「他社でも通用する志望理由」なら50以下。比較軸・選択理由が具体的なときのみ高得点
- キャリアビジョンは「成長したい」だけでは低評価。入社後の行動・役割・貢献の見通しまで求める
- 企業理解は「固有名詞を知っているか」ではなく「なぜその企業なのかを因果で説明できるか」を重視する
- 志望動機の強さは `企業固有性` `本人固有性` `why now` の3点が揃って初めて高評価とする
- 面接官が「他社でも同じことが言えるのでは」「本当にその会社を調べているのか」と感じる場合は risk_flags に入れる

## 出力形式
必ず以下のJSON形式で回答してください：
JSON以外の文字列・コードブロック・説明文は禁止です。
missing_aspectsの各要素は最大2項目、各項目20文字以内で記述してください。不足点が具体的に分かる表現にすること。
{{
  "scores": {{
    "company_understanding": 0-100の数値,
    "self_analysis": 0-100の数値,
    "career_vision": 0-100の数値,
    "differentiation": 0-100の数値
  }},
  "hidden_eval": {{
    "company_accuracy": 0-100の数値,
    "why_now_strength": 0-100の数値,
    "fit_reasoning": 0-100の数値
  }},
  "missing_aspects": {{
    "company_understanding": ["観点1", "観点2"],
    "self_analysis": ["観点1"],
    "career_vision": ["観点1", "観点2"],
    "differentiation": ["観点1"]
  }},
  "quality_rationale": ["今回の評価理由1", "今回の評価理由2"],
  "risk_flags": ["面接官が懸念しうる点を最大2つ"]
}}"""


# Question generation prompt
# Used with: .format(company_name=..., industry=..., company_context=...,
#   gakuchika_section=..., company_understanding_score=..., self_analysis_score=...,
#   career_vision_score=..., differentiation_score=...,
#   weakest_element=..., missing_aspects=..., threshold=...)
MOTIVATION_QUESTION_PROMPT = """あなたは就活生の「志望動機」を深掘りするプロのインタビュアーです。

## 企業情報
- 企業名: {company_name}
- 業界: {industry}

## 企業の特徴（RAG情報）
{company_context}

## ユーザーの経験（ガクチカ情報）
{gakuchika_section}

## ユーザープロフィール
{profile_section}

## 会話コンテキスト
{conversation_context}

## 現在の評価スコア
- 企業理解: {company_understanding_score}%
- 自己分析: {self_analysis_score}%
- キャリアビジョン: {career_vision_score}%
- 差別化: {differentiation_score}%

## 最も深掘りが必要な要素
**{weakest_element}** を重点的に深掘りしてください。

## 不足している観点
{missing_aspects}

## 現在の質問段階
{question_stage}

## 質問生成ルール

### 必須: 初回4段階を優先する
- `industry_reason`: なぜこの業界なのか
- `company_reason`: なぜこの企業なのか
- `role_selection`: この企業のどの職種を志望するのか
- `desired_work`: この企業でどんな仕事をしたいのか
- `fit_connection`: 自分の経験と企業・職種の接続
- `differentiation`: 他社ではなくこの企業である理由
- `closing`: 入社後の目標のまとめ
- 現在の質問段階に必ず従うこと
- 初回4段階では、質問の意図が一目で分かるように端的に聞くこと

### 必須: RAG情報を活用する
企業の具体的な情報（事業内容、強み、取り組み等）を質問に織り込んでください。
例: 「〇〇事業に惹かれた理由は何ですか？」
質問文またはevidence_summaryには、参照した根拠（出典番号や固有語）を最低1つ入れてください。

### 禁止表現
- ❌「もう少し詳しく教えてください」
- ❌「具体的に説明してください」
- ❌「他にありますか？」
- ❌「先ほど『〇〇』とおっしゃいましたが」
- ❌ 長い前置きや引用調の導入

### 推奨: 具体的な切り口
- 経験を聞く: 「〇〇に関連する経験はありますか？」
- 接点を聞く: 「ご自身の経験と御社の△△はどう繋がりますか？」
- 比較を聞く: 「同業他社ではなく御社を選ぶ理由は？」
- ビジョンを聞く: 「入社後、どんな仕事に挑戦したいですか？」
- why now を聞く: 「なぜ今その関心が強まったのですか？」

### 質問戦略
- generic な志望理由を具体化する
- 企業の特徴と本人経験の因果接続を作る
- 面接官が抱く「他社でもよいのでは」という疑問を解消する
- 入社後にどう価値を出すかまで繋げる
- 必要に応じて、学生の発言の中の曖昧さや飛躍をやさしく検証する
- 役割を聞く: 「どの職種で力を発揮したいですか？」
- 仕事内容を聞く: 「入社後まず取り組みたい仕事は何ですか？」

## 回答サジェスション生成ルール
質問と同時に、ユーザーが選べる回答候補を4つ生成してください。

### 厳守要件
- 1つあたり20〜40文字の短いフレーズ
- 体言止めまたは「〜こと」「〜から」「〜ため」で終わる簡潔表現
- 対象要素（{weakest_element}）のスコアアップに直結する内容
- 4つが明確に異なる切り口であること（同じ内容の言い換えは禁止）
- 4つすべてに、企業RAG・ガクチカ・プロフィールのいずれか具体情報を最低1つ含めること
- 初回4段階では generic な無難表現を禁止する

### 必須: 企業情報の活用（最重要）
- **4つのうち最低2つ**に企業RAG情報の具体的な内容（事業名、製品名、取り組み名、数字等）を含めること
- 汎用的な回答（どの企業にも当てはまる内容）は最大2つまで
- 企業固有の情報がない場合のみ、業界の一般的な特徴で代替可

### 多様性パターン（この順序で生成）
1. 経験×企業: ガクチカ経験と企業の具体的な取り組みを結びつける（ガクチカ情報があれば必ず参照）
2. 企業理解: 企業の特徴・強みに直接触れて関心を示す
3. 価値観: ガクチカで得た学び・価値観から答える
4. 将来×企業: 企業の事業を踏まえて将来やりたいことを述べる

### 必須: ガクチカ情報の活用（情報がある場合）
- 4つのうち最低1つにユーザーの具体的な経験・強みを反映すること
- 「〇〇で培った△△を活かし」のような個人化された短い表現を使う
- ガクチカ情報がない場合は汎用的な経験表現で代替可

### 必須: プロフィール情報の活用（情報がある場合）
- 4つのうち最低1つに志望業界、志望職種、学部・専攻などの基本情報を反映すること
- `role_selection` ではプロフィールの志望職種があれば候補に自然に混ぜること
- `desired_work` では selectedRole と矛盾しない仕事候補にすること

## 出力形式
必ず以下のJSON形式で回答してください。suggestionsはquestionの直後に出力すること（重要フィールドを先に出力）：
{{
  "question": "質問文",
  "suggestions": ["〇〇の経験から御社の△△に関心", "御社の□□事業に共感したため", "チームで成果を出す力を活かしたい", "□□分野に挑戦したいから"],
  "reasoning": "この質問をする理由（1文）",
  "coaching_focus": "今回の質問の狙いを15字以内で",
  "risk_flags": ["面接官が懸念しうる点を最大2つ"],
  "evidence_summary": "RAG情報の根拠要約（最大120字、参照した企業情報を簡潔に）",
  "target_element": "company_understanding|self_analysis|career_vision|differentiation",
  "company_insight": "質問に活用した企業情報（あれば）",
  "should_continue": true,
  "suggested_end": false
}}

suggested_endは全ての要素が{threshold}%以上の場合のみtrueにしてください。"""


# ES draft generation prompt
# Used with: .format(char_limit=..., company_name=..., industry=...,
#   company_context=..., conversation=..., char_min=...)
DRAFT_GENERATION_PROMPT = """以下の会話内容から、{char_limit}字程度の志望動機ESを作成してください。

## 企業情報
- 企業名: {company_name}
- 業界: {industry}

## 企業の特徴（参考）
{company_context}

## 会話内容
{conversation}

## 作成ルール
1. だ・である調で統一
2. 文字数: {char_min}〜{char_limit}字
3. 構成:
   - 導入（15%）: 志望理由の結論
   - 本論（70%）: 具体的な理由・経験・接点
   - 結論（15%）: 入社後のビジョン
4. 会話で出た具体的なエピソード・数字を活用
5. 企業の特徴との接点を明確に
6. 企業固有の特徴と本人固有の経験の両方を必ず入れる
7. 「成長したい」だけで終わらず、入社後にどう価値を出すかまで書く
8. generic な表現や、他社でも通る志望理由を避ける
9. 可能なら why now が伝わる一節を入れる

## 出力形式
必ず以下のJSON形式で回答してください：
{{
  "draft": "志望動機本文",
  "key_points": ["強調したポイント1", "強調したポイント2", "強調したポイント3"],
  "company_keywords": ["使用した企業キーワード1", "使用した企業キーワード2"]
}}"""
