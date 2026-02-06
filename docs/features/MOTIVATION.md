# 志望動機作成機能（実装フロー & プロンプト仕様）

本書は現行実装に基づく **志望動機作成機能** のフローとプロンプト仕様をまとめたものです。
参照実装: `backend/app/routers/motivation.py`, `src/app/api/motivation/[companyId]/conversation/route.ts`, `src/app/companies/[id]/motivation/page.tsx`

---

## 1. 概要

- **目的**: 会話形式で企業特化の志望動機を深掘りし、ES用の下書きを生成する
- **質問数目安**: 8問（4要素が70%以上で完了判定）
- **クレジット**: 5問回答ごとに1クレジット + 下書き生成で1クレジット
- **LLM**: Claude Sonnet（feature=`motivation`）
- **特徴**: 企業RAGと連携し、企業情報を質問に反映

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
   - `GET /api/motivation/:companyId/conversation`（履歴取得 + 初回質問）
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

---

## 4. Next.js API（会話管理）

**ファイル:** `src/app/api/motivation/[companyId]/conversation/route.ts`

### GET の動き
- 会話履歴がない場合、初回質問を生成（「なぜ{企業名}に興味を持ちましたか？」）
- 会話がある場合、FastAPIで評価→次質問を生成
- 返却: `nextQuestion`, `questionCount`, `isCompleted`, `scores`

### POST の動き
- ユーザー回答を会話履歴に追加
- FastAPIで4要素を評価
- 5問ごとにクレジット消費（ログインユーザーのみ）
- 全要素70%以上で `isCompleted: true`

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
  "company_name": "株式会社〇〇",
  "industry": "IT",
  "conversation_history": [...],
  "scores": {
    "company_understanding": 65,
    "self_analysis": 40,
    "career_vision": 55,
    "differentiation": 30
  },
  "missing_aspects": {...}
}
```

出力:
```json
{
  "question": "先ほど『〇〇』とおっしゃいましたが、その経験で得た強みは具体的にどのような場面で発揮できると思いますか？",
  "reasoning": "自己分析のスコアが最も低いため、経験と強みの具体化を促す",
  "target_element": "self_analysis"
}
```

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
- **Temperature**: 0.7（自然な変化）
- **Max tokens**: 400
- **禁止表現**:
  - 「もう少し詳しく教えてください」
  - 「具体的に説明してください」
  - 「他にありますか？」
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

## 10. データベーススキーマ

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

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 11. 代表ログ

- `[LLM] Calling claude-sonnet (...) for feature: motivation`
- `[Motivation] Evaluation scores: {...}`
- `[Motivation] Generated question for element: self_analysis`
- `[Motivation] Draft generated: 398 chars`

---

## 12. 関連ファイル

### バックエンド
- `backend/app/routers/motivation.py` - FastAPI ルーター
- `backend/app/utils/llm.py` - LLM呼び出しユーティリティ
- `backend/app/utils/vector_store.py` - RAGコンテキスト取得

### フロントエンド
- `src/app/companies/[id]/motivation/page.tsx` - 志望動機作成ページ
- `src/app/api/motivation/[companyId]/conversation/route.ts` - 会話API
- `src/app/api/motivation/[companyId]/generate-draft/route.ts` - 下書き生成API

### データベース
- `src/lib/db/schema.ts` - `motivationConversations` テーブル定義
