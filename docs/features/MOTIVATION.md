# 志望動機作成機能（実装フロー & プロンプト仕様）

本書は現行実装に基づく **志望動機作成機能** のフローとプロンプト仕様をまとめたものです。
参照実装: `backend/app/routers/motivation.py`, `src/app/api/motivation/[companyId]/conversation/route.ts`, `src/app/api/motivation/[companyId]/conversation/start/route.ts`, `src/app/companies/[id]/motivation/page.tsx`

---

## 1. 概要

- **目的**: 会話形式で企業特化の志望動機を深掘りし、ES用の下書きを生成する
- **質問数目安**: 8問
- **クレジット**: 5問回答ごとに1クレジット + 下書き生成で1クレジット
- **LLM**: `feature="motivation"` を使用（デフォルト: Claude Haiku, `MODEL_MOTIVATION` で切替可能）
- **特徴**: 企業RAG・ガクチカ・プロフィール・応募職種を束ねて質問する
- **開始フロー**: `setup(企業確認 / 業界確定 / 職種確定) → start API → chat`
- **チャット段階**: `company_reason → desired_work → fit_connection / differentiation → closing`
- **初回開始**: 空の会話履歴は `next-question` 内で初回ターンとして扱い、空 `messages=[]` を LLM に渡さない
- **4択生成**: 質問は LLM が生成した後に server-side validator を通し、回答候補は grounded builder が `2〜4件` の直接回答文だけを決定論的に組み立てる
- **ハルシネーション抑制**: 企業情報・ガクチカ・プロフィール・確定職種・会話で確定済みのやりたい仕事以外の事実を使わないよう prompt と builder の両方で制限する
- **候補数**: 回答候補は `2〜4件` を基本とし、grounding が弱いときだけ `0〜3件` に絞る
- **raw 企業文フィルタ**: `Q4:` などの見出し、採用導線文、社員紹介コピー、URL断片は候補生成前に除外する
- **question-fit**: 候補は `質問タイプ判定 → 直接回答文テンプレート → question-fit scoring` で絞り込み、質問に答えていない候補を上位に残さない
- **UI導線**: `会話をやり直す` は進捗 header 右上のセカンダリボタン、`志望動機ESを作成` は右カラム上部とモバイル入力欄直上で常時 visible、企業RAGの出典は `参考にした企業情報` を `要点1行 + 出典種別` の compact card で表示する

---

## 2. 4要素評価フレームワーク

志望動機を以下の4要素で評価（各0-100点）:

| 要素 | 説明 | 評価基準 |
|------|------|----------|
| **企業理解** | 企業の特徴・事業・強みの理解度 | 0-30: 企業特有の言及なし<br>51-70: 強み・特徴の言及あり<br>91-100: 競合との差別化説明 |
| **自己分析** | 自身の経験・強み・関連エピソード | 0-30: 関連経験の言及なし<br>51-70: 具体的エピソードあり<br>91-100: 再現性のある強み構造化 |
| **キャリアビジョン** | 入社後のビジョン・役割・キャリアパス | 0-30: 入社後ビジョンなし<br>51-70: 具体的な役割・業務言及<br>91-100: 自己成長と企業成長の接続 |
| **差別化** | なぜこの企業なのかの明確な理由 | 0-30: 企業選択理由なし<br>51-70: 1つの理由あり<br>91-100: 競合比較を含む説明 |

### 完了判定（重み付きスコア方式）

```python
weighted = (
    differentiation * 0.30 +      # 差別化（最重要）
    career_vision * 0.25 +         # キャリアビジョン
    company_understanding * 0.25 + # 企業理解
    self_analysis * 0.20           # 自己分析
)
# 完了条件: weighted ≥ 70 AND 全要素 ≥ 50
```

差別化を最も重視（30%）。ES品質の最強予測因子であるため。
全要素の最低ライン（50%）を設けることで、極端な偏りを防止。

**参照実装**: `motivation.py` - `_is_complete()`

---

## 3. エンドツーエンドの流れ

1. **フロント → Next.js API**
   - `GET /api/motivation/:companyId/conversation`（履歴取得 + setup 状態取得）
   - `POST /api/motivation/:companyId/conversation/start`（setup 保存 + 初回質問開始）
   - `POST /api/motivation/:companyId/conversation`（回答送信）
   - `POST /api/motivation/:companyId/generate-draft`（下書き生成）

2. **Next.js API → FastAPI**
   - `POST /api/motivation/evaluate`（4要素評価）
   - `POST /api/motivation/next-question`（次質問生成）
   - `POST /api/motivation/generate-draft`（下書き生成）

3. **会話保存**
   - `motivationConversations` テーブルにメッセージ・質問数・スコアを保存

4. **下書き生成**
   - `documents` テーブルにES（type="es"）として保存
   - ESエディタ（`/es/{documentId}`）へ自動遷移

5. **UI補助**
   - 回答候補 `suggestions` / `suggestionOptions` は `2〜4件` を基本に返し、根拠が薄いときだけ件数を絞る
   - 企業RAGの根拠要約 `evidenceSummary` と `evidenceCards` を返し、UI では `参考にした企業情報` の source card を主表示にする
   - 回答送信はSSEストリーミング経路を利用する

---

## 4. Next.js API（会話管理）

**ファイル:** `src/app/api/motivation/[companyId]/conversation/route.ts`

### GET の動き
- 会話履歴と setup 状態を返す
- 会話未開始の場合でも、ここでは初回質問を自動生成しない
- 返却: `nextQuestion`, `questionCount`, `isCompleted`, `scores`, `suggestions`, `suggestionOptions`, `evidenceSummary`, `evidenceCards`, `generatedDraft`, `questionStage`, `stageStatus`, `conversationContext`, `setup`
- 右カラム最上部の `志望動機ESを作成` CTA は開始前から表示し、深掘り完了までは disabled のまま理由を示す

### POST /start の動き
- setup で確定した `selectedIndustry / selectedRole / roleSelectionSource` を保存する
- ログインユーザーは完了済みガクチカ要約、プロフィール、応募職種を読み込む
- FastAPI へ空の会話履歴で `next-question` を投げ、初回ターン用の最初の assistant 質問を生成して DB に保存する
- 初回質問は `company_reason` から開始する

### POST の動き
- ユーザー回答を会話履歴に追加
- setup 完了済み前提で、`company_reason` と `desired_work` の回答を `conversationContext` へ保存する
- FastAPIで4要素を評価
- 5問ごとにクレジット消費（ログインユーザーのみ、FastAPI成功後に消費）
- 完了判定は FastAPI の重み付きスコアを優先
- 後方互換として、`questionCount >= 8` かつ全要素70%以上でも完了扱い

### SSE POST の動き
**ファイル:** `src/app/api/motivation/[companyId]/conversation/stream/route.ts`

- フロントの通常送信経路はこちらを利用
- FastAPI の `next-question/stream` を consume-and-re-emit で中継
- `progress` / `string_chunk` / `complete` / `error` を処理
- `complete` 時にDB更新とクレジット消費を行い、フロント向け整形済みデータを返却
- フロントは `question` の `string_chunk` を優先表示し、chunk が来ない場合でも `complete.nextQuestion` を疑似ストリーム再生して表示体験を揃える

**ファイル:** `src/app/api/motivation/[companyId]/generate-draft/route.ts`

### POST の動き
- 文字数（300/400/500）を指定して下書き生成
- FastAPIで下書き生成
- `documents` テーブルにES作成
- 1クレジット消費（成功時のみ）

---

## 5. FastAPI エンドポイント

**ファイル:** `backend/app/routers/motivation.py`

### 5.1 4要素評価
**`POST /api/motivation/evaluate`**

入力:
```json
{
  "company_name": "株式会社〇〇",
  "industry": "IT",
  "conversation_history": [
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "..."}
  ]
}
```

出力:
```json
{
  "company_understanding": 65,
  "self_analysis": 40,
  "career_vision": 55,
  "differentiation": 30,
  "missing_aspects": {
    "company_understanding": ["競合との差別化"],
    "self_analysis": ["具体的なエピソード"],
    "career_vision": ["中長期のキャリアパス"],
    "differentiation": ["なぜこの企業なのか"]
  }
}
```

### 5.2 次質問生成
**`POST /api/motivation/next-question`**

入力:
```json
{
  "company_id": "company_xxx",
  "company_name": "株式会社〇〇",
  "industry": "IT",
  "conversation_history": [...],
  "question_count": 3,
  "scores": {
    "company_understanding": 65,
    "self_analysis": 40,
    "career_vision": 55,
    "differentiation": 30
  },
  "gakuchika_context": [...],
  "conversation_context": {
    "selectedIndustry": "銀行",
    "selectedRole": "法人営業",
    "desiredWork": "法人顧客への提案営業",
    "questionStage": "desired_work"
  },
  "profile_context": {
    "targetIndustries": ["金融"],
    "targetJobTypes": ["営業"]
  },
  "application_job_candidates": ["法人営業"],
  "company_role_candidates": ["法人営業", "デジタル / システム"]
}
```

出力:
```json
{
  "question": "これまでの経験を踏まえると、法人営業としてどんな顧客課題の解決に取り組みたいですか？",
  "reasoning": "自己分析のスコアが最も低いため、経験と強みの具体化を促す",
  "target_element": "self_analysis",
  "suggestions": ["法人営業として顧客課題に向き合いたい", "学生団体運営で培った巻き込み力を提案業務で活かしたい"],
  "suggestion_options": [
    {
      "id": "opt_1",
      "label": "法人営業として顧客課題に向き合いたい",
      "sourceType": "application_job_type",
      "intent": "desired_work",
      "evidenceSourceIds": ["S1"],
      "rationale": "応募職種と企業資料の両方に沿う",
      "isTentative": true
    }
  ],
  "evidence_summary": "S1 careers: ...",
  "evidence_cards": [
    {
      "sourceId": "S1",
      "title": "新卒採用ページ",
      "contentType": "new_grad_recruitment",
      "excerpt": "法人営業では...",
      "sourceUrl": "https://example.com/recruit",
      "relevanceLabel": "職種候補の根拠"
    }
  ],
  "question_stage": "desired_work",
  "stage_status": {
    "current": "desired_work",
    "completed": ["company_reason"],
    "pending": ["fit_connection", "differentiation", "closing"]
  },
  "captured_context": {
    "selectedIndustry": "銀行",
    "selectedRole": "法人営業",
    "desiredWork": "法人顧客への提案営業",
    "questionStage": "desired_work"
  }
}
```

補足:
- setup で `selectedIndustry / selectedRole` を先に確定する
- `company_reason / desired_work / fit_connection / differentiation` の全段階で LLM は質問本文のみを生成する
- 回答候補は `selectedRole / companyWorkCandidates / company_features / gakuchika / profile / captured desiredWork` を使う grounded builder が生成する
- `suggestions` は `suggestion_options[].label` の後方互換フィールド
- `desired_work` 段階の回答候補は仮置き候補として `isTentative=true` を付け、会話で初めて `desiredWork` を確定する
- prompt には `会話コンテキスト + 直近の会話履歴` を渡し、質問の連続性を維持する
- builder は `質問 validator → 質問タイプ判定 → 直接回答文テンプレート → question-fit scoring` の順で候補を作り、企業説明の断片や設問見出しをそのまま候補へ流さない
- UI の候補 chip は本文のみを表示し、根拠ラベルや仮置き表示は出さない

### 5.2.1 次質問ストリーミング
**`POST /api/motivation/next-question/stream`**

- SSEで進捗と質問本文を段階返却
- 主なイベント:
  - `progress`: `企業情報を取得中...` / `回答を分析中...` / `質問を考え中...`
  - `string_chunk`: 質問本文のトークン単位ストリーミング
  - `complete`: `question` / `evaluation` / `suggestions` / `suggestion_options` / `evidence_summary` / `evidence_cards` / `stage_status` / `captured_context`
  - `error`: エラーメッセージ

### 5.3 下書き生成
**`POST /api/motivation/generate-draft`**

入力:
```json
{
  "company_name": "株式会社〇〇",
  "industry": "IT",
  "conversation_history": [...],
  "char_limit": 400
}
```

出力:
```json
{
  "draft": "私が貴社を志望する理由は...(400字程度)",
  "key_points": ["企業の強み", "自身の経験", "キャリアビジョン"],
  "company_keywords": ["DX推進", "グローバル展開"]
}
```

---

## 6. 企業RAG連携

### 連携ポイント
- **質問生成時**: 企業情報を取得し、質問に反映
- **下書き生成時**: 企業キーワードを抽出し、具体性を向上
- **根拠表示**: 取得ソースから `evidence_summary` を構築し、UI では `参考にした企業情報` の source card として表示
- **4択生成**: 初期4段階は企業特徴・プロフィール・ガクチカ・応募職種を元に grounded builder で決定論的に組み立てる
- **ノイズ除去**: 企業RAGの raw excerpt から `Q4:` 見出し、社員紹介コピー、採用導線文を落としてから候補生成へ使う

### ガクチカ連携
- ログインユーザーは完了済みガクチカ要約を最大3件取得
- `strengths` / `action_text` / `result_text` / `numbers` を質問生成プロンプトへ埋め込む
- 初期4段階でも後半でも、候補の少なくとも1件はガクチカやプロフィール由来の個人化候補を優先する
- grounding が弱い場合は候補数を減らし、自由入力を前面に残す

### 業界・職種連携
- ES添削と同じ `es-review-role-catalog` を利用する
- `company.industry` が broad / 未設定の場合だけ setup で業界選択を必須にする
- 職種候補は応募職種、company override、industry seed、プロフィール志望職種の順で優先する
- setup 後は `selectedRole` を質問生成の source of truth とし、`desired_work` で具体業務に落とし込む

### 適応的RAGクエリ

評価スコアに基づき、弱い要素を重点的に補強するクエリを動的生成。

```python
# _build_adaptive_rag_query(scores) の動作:
# - 企業理解 < 50 → "企業の事業内容、製品、サービス、業界での位置づけ"
# - 自己分析 < 50 → "求める人物像、必要なスキル、企業文化、働き方"
# - キャリアビジョン < 50 → "キャリアパス、成長機会、研修制度、配属"
# - 差別化 < 50 → "競合との差別化、独自の強み、特徴的な取り組み"
# - 全要素 ≥ 50 → デフォルトクエリ（全般的な企業情報）
```

**参照実装**: `motivation.py` - `_build_adaptive_rag_query()`, `_get_company_context()`

---

## 7. プロンプト仕様

### 7.1 評価プロンプト
- **Temperature**: 0.3（一貫した評価）
- **Max tokens**: 500
- **出力**: JSON（4要素のスコア + 不足点リスト）

### 7.2 質問生成プロンプト
- **Temperature**: 0.5（自然さと一貫性のバランス）
- **Max tokens**: 700
- **禁止表現**:
  - 「もう少し詳しく教えてください」
  - 「具体的に説明してください」
  - 「他にありますか？」
- **役割**:
  - `company_reason / desired_work / fit_connection / differentiation / closing` の質問を生成する
  - 1問で聞く論点は1つに絞り、短文で直接答えやすい質問にする
  - 企業情報・ガクチカ・プロフィール・確定職種・やりたい仕事以外の事実を創作しない
  - 回答候補は backend の grounded builder が `2〜4件` を基本に生成し、question-fit が弱い候補は落とす
- **切り口**:
  - 経験を聞く: 「関連する経験は？」
  - 接点を聞く: 「その経験と企業のXはどう繋がる？」
  - 比較を聞く: 「競合ではなくこの企業を選ぶ理由は？」
  - ビジョンを聞く: 「入社後どのような役割・挑戦を？」

### 7.3 下書き生成プロンプト
- **Temperature**: 0.5（バランス）
- **Max tokens**: 600
- **構成比**:
  - 導入（15%）: 志望動機の結論
  - 本論（70%）: 具体的理由・経験・接点
  - 結論（15%）: 入社後のビジョン

---

## 8. クレジット消費

| アクション | 消費量 | 条件 |
|-----------|--------|------|
| 5問回答 | 1クレジット | ログインユーザーのみ |
| 下書き生成 | 1クレジット | 成功時のみ |

**ゲストユーザー**: クレジット消費なし（制限なく利用可能）

---

## 9. ガクチカ機能との比較

| 項目 | 志望動機作成 | ガクチカ深掘り |
|------|-------------|---------------|
| **評価軸** | 4要素（企業理解/自己分析/ビジョン/差別化） | STAR法（状況/課題/行動/結果） |
| **企業RAG** | あり（企業情報を質問に反映） | なし |
| **出力** | ES下書き（300/400/500字） | サマリー（JSON） |
| **保存先** | `documents` テーブル（type="es"） | `gakuchikaConversations` |
| **遷移先** | ESエディタ（`/es/{id}`） | ガクチカ詳細ページ |

---

## 10. 面接品質基準

ガクチカ深掘り機能と共通で、面接通過観点の品質ルーブリックを採用する。志望動機では「企業固有性」と「本人固有性」の両立を重視する。

### 共通観点
- `specificity`: 固有名詞、具体場面、比較軸がある
- `credibility`: 盛りすぎや役割過大がなく、信じやすい
- `causality`: 課題、判断、行動、結果の因果が通る
- `transferability`: 学びが抽象語で終わらず再現可能
- `coachability`: 質問が答えやすく、次の一歩が明確

### 志望動機固有観点
- `company_specificity`: 他社でも通る話になっていない
- `company_accuracy`: 企業情報の使い方が正確
- `self_anchor`: 本人の経験や価値観に根ざしている
- `fit_reasoning`: 経験と企業・職種・仕事の接続が自然
- `why_now`: 今その企業を選ぶ理由がある

### 合格条件
- generic な質問になっていない
- 信憑性を損なう加点をしていない
- 不足観点が次の質問に反映されている
- 最終出力が固有性を持つ

---

## 11. 品質拡張と受け入れ条件

### 参考資料反映

対象資料: `/Users/saoki/work/references/gakuchika_QA_guide.md`

- 企業情報の根拠を伴う質問設計:
  `backend/app/prompts/motivation_prompts.py`, `backend/app/routers/motivation.py`, `src/app/api/motivation/[companyId]/conversation*.ts`, `src/app/api/motivation/[companyId]/conversation/start/route.ts`, `src/app/companies/[id]/motivation/page.tsx` で `evidence_summary` / `evidenceSummary` を生成・伝播し、`参考にした企業情報` の source card UI を表示

### 受け入れチェック
- 初回質問取得で `evidenceSummary` と `evidenceCards` が返り、サイドバー「参考にした企業情報」に表示される
- 回答送信の SSE 完了後、`evidenceSummary` が更新される
- 根拠が無いケースでは説明文プレースホルダが表示される

---

## 12. データベーススキーマ

### motivationConversations テーブル

```sql
CREATE TABLE motivation_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  guest_id TEXT REFERENCES guest_users(id),
  company_id TEXT NOT NULL REFERENCES companies(id),

  messages TEXT NOT NULL,              -- JSON: Q&A配列
  question_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress',   -- 'in_progress' | 'completed'

  motivation_scores TEXT,              -- JSON: 4要素スコア
  generated_draft TEXT,
  char_limit_type TEXT,                -- '300' | '400' | '500'
  conversation_context TEXT,           -- JSON: selectedIndustry / selectedRole / desiredWork / companyRoleCandidates ...
  selected_role TEXT,
  selected_role_source TEXT,
  desired_work TEXT,
  question_stage TEXT,
  last_suggestions TEXT,               -- JSON: 直近の回答候補
  last_suggestion_options TEXT,        -- JSON: 直近の4択メタデータ
  last_evidence_cards TEXT,            -- JSON: 根拠カード
  stage_status TEXT,                   -- JSON: current/completed/pending

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

補足:
- `conversation_context` は JSON で保持し、`selectedIndustry`, `selectedIndustrySource`, `selectedRole`, `selectedRoleSource`, `desiredWork`, `questionStage`, `companyRoleCandidates`, `companyWorkCandidates` などを入れる
- `20260302193000_add_motivation_conversation_context.sql`, `20260303195000_add_motivation_evidence_cards.sql` が追加カラムの migration
- Next.js 側は `motivationConversationCompat.ts` で未適用 migration 環境にも後方互換で対応する

---

## 13. 代表ログ

- `[LLM] Calling claude-haiku (...) for feature: motivation`
- `[Motivation] Evaluation scores: {...}`
- `[Motivation] Generated question for stage: desired_work`
- `[Motivation] Draft generated: 398 chars`

---

## 14. 関連ファイル

### バックエンド
- `backend/app/routers/motivation.py` - FastAPI ルーター
- `backend/app/prompts/motivation_prompts.py` - 深掘り質問 / 評価 / 下書き生成プロンプト
- `backend/app/utils/llm.py` - LLM呼び出しユーティリティ
- `backend/app/utils/vector_store.py` - RAGコンテキスト取得

### フロントエンド
- `src/app/companies/[id]/motivation/page.tsx` - 志望動機作成ページ
- `src/app/api/motivation/[companyId]/conversation/route.ts` - 会話API
- `src/app/api/motivation/[companyId]/conversation/start/route.ts` - setup 保存 + 初回質問開始API
- `src/app/api/motivation/[companyId]/conversation/stream/route.ts` - 会話SSE API
- `src/app/api/motivation/[companyId]/generate-draft/route.ts` - 下書き生成API
- `src/lib/constants/es-review-role-catalog.ts` - ES添削と共有する業界 / 職種 catalog
- `src/lib/db/motivationConversationCompat.ts` - migration 未適用環境向け互換レイヤー

### データベース
- `src/lib/db/schema.ts` - `motivationConversations` テーブル定義
