# AI機能仕様書

Career Compass (ウカルン) で使用されるAI機能の詳細仕様書です。

---

## 目次

1. [概要](#概要)
2. [ES添削機能](#1-es添削機能)
3. [ガクチカ深掘り機能](#2-ガクチカ深掘り機能)
4. [企業情報取得機能](#3-企業情報取得機能)
5. [共通アーキテクチャ](#共通アーキテクチャ)
6. [モデル設定](#モデル設定)

---

## 概要

| 機能 | 使用モデル | 目的 | クレジット消費 |
|------|----------|------|---------------|
| ES添削 | Claude Sonnet | 文章の品質評価・改善提案 | `ceil(文字数/800)` (上限5) |
| ガクチカ深掘り | Claude Sonnet | 対話形式でエピソードを深掘り | 5問回答ごとに1 |
| 企業情報取得 | GPT-4o-mini | 採用ページから情報抽出 | 成功1 / 部分成功0.5 |

---

## 1. ES添削機能

### 概要

ES（エントリーシート）の文章を5つの評価軸で採点し、具体的な改善提案とリライト例を提供する機能。

### ファイル構成

```
backend/app/routers/es_review.py  # FastAPI エンドポイント
src/app/api/documents/[id]/review/route.ts  # Next.js API (認証・クレジット管理)
```

### API仕様

**エンドポイント:** `POST /api/es/review`

**リクエスト:**
```json
{
  "content": "ES本文",
  "section_id": "設問ID（オプション）",
  "style": "バランス",
  "is_paid": false,
  "has_company_rag": false,
  "rewrite_count": 1,
  "sections": ["設問1", "設問2"]
}
```

**レスポンス:**
```json
{
  "scores": {
    "logic": 3,
    "specificity": 4,
    "passion": 3,
    "company_connection": 3,
    "readability": 4
  },
  "top3": [
    {
      "category": "具体性",
      "issue": "具体的なエピソードが不足",
      "suggestion": "数字を入れて具体化する"
    }
  ],
  "rewrites": ["リライト文1", "リライト文2"],
  "section_feedbacks": [
    {
      "section_title": "設問1",
      "feedback": "改善点の指摘（100-150字）"
    }
  ]
}
```

### 評価軸（5軸スコアリング）

| 軸 | 英語名 | 説明 | 評価基準 |
|----|--------|------|----------|
| 論理 | `logic` | 論理の一貫性 | 主張と根拠の整合性、因果関係の明確さ |
| 具体性 | `specificity` | 具体性 | 数字、エピソード、固有名詞の使用 |
| 熱意 | `passion` | 熱意・意欲の伝わり度 | モチベーションの説得力 |
| 企業接続 | `company_connection` | 企業との接続度 | 企業の事業・文化との接点（RAG使用時のみ） |
| 読みやすさ | `readability` | 文章の読みやすさ | 文章の明瞭さ、構成の分かりやすさ |

**スコア:** 各軸1-5点（厳しめに採点、平均3点程度を目安）

### リライトスタイル

| スタイル | プラン | 説明 |
|---------|--------|------|
| バランス | Free/Paid | バランスの取れた、読みやすい文章 |
| 堅め | Free/Paid | フォーマルで堅実な印象の文章 |
| 個性強め | Free/Paid | 個性と独自性が際立つ文章 |
| 短く | Paid | 簡潔でコンパクトな文章 |
| 熱意強め | Paid | 熱意と意欲が強く伝わる文章 |
| 結論先出し | Paid | 結論を先に述べ、根拠を後から示す構成 |
| 具体例強め | Paid | 具体的なエピソードや数値を増やした文章 |
| 端的 | Paid | 端的で要点を押さえた文章 |

### プラン別機能

| 機能 | Free | Paid |
|------|------|------|
| リライトスタイル | 3種類 | 8種類 |
| リライト数 | 1個 | 最大3個 |
| 設問別指摘 | - | 100-150字/設問 |

### クレジット消費

```
消費クレジット = ceil(文字数 / 800)
上限: 5クレジット
```

| 文字数 | 消費クレジット |
|--------|---------------|
| 1-800 | 1 |
| 801-1600 | 2 |
| 1601-2400 | 3 |
| 2401-3200 | 4 |
| 3200以上 | 5 |

### LLM設定

| パラメータ | 値 |
|-----------|---|
| モデル | Claude Sonnet (環境変数: `CLAUDE_MODEL`) |
| 温度 | 0.3（低めで一貫性重視） |
| 最大トークン | 3000 |

---

## 2. ガクチカ深掘り機能

### 概要

「学生時代に力を入れたこと」について、AIが対話形式で質問を投げかけ、エピソードの深掘りを支援する機能。目安8問の質問を通じて、ES・面接で使える具体的なエピソードを引き出す。

### ファイル構成

```
backend/app/routers/gakuchika.py  # FastAPI エンドポイント
src/app/api/gakuchika/[id]/conversation/route.ts  # Next.js API
```

### API仕様

#### 次の質問を取得

**エンドポイント:** `POST /api/gakuchika/next-question`

**リクエスト:**
```json
{
  "gakuchika_title": "サークル活動",
  "conversation_history": [
    {"role": "assistant", "content": "質問1"},
    {"role": "user", "content": "回答1"}
  ],
  "question_count": 1
}
```

**レスポンス:**
```json
{
  "question": "次の深掘り質問",
  "reasoning": "この質問をする理由",
  "should_continue": true,
  "suggested_end": false
}
```

#### サマリー生成（オプション）

**エンドポイント:** `POST /api/gakuchika/summary`

**レスポンス:**
```json
{
  "summary": "経験の要約（200-300字）",
  "key_points": ["ポイント1", "ポイント2"],
  "numbers": ["20人のチーム", "売上30%向上"],
  "strengths": ["リーダーシップ", "課題解決力"]
}
```

### 質問のターゲット観点

LLMは以下の観点をバランスよくカバーするよう質問を生成：

| 観点 | 質問例 |
|------|--------|
| きっかけ | 「その経験を始めたきっかけは何でしたか？」 |
| 困難 | 「その中で最も困難だった出来事は何ですか？」 |
| 乗り越え | 「その困難をどのように乗り越えましたか？」 |
| 学び | 「その経験から学んだことは何ですか？」 |
| 外部評価 | 「周りの人からどのような評価を受けましたか？」 |
| 数字・成果 | 「具体的な数字や成果はありますか？」 |
| チーム内役割 | 「チームの中でのあなたの役割は何でしたか？」 |
| 今後活かし方 | 「その学びを今後どのように活かしたいですか？」 |

### 質問フロー

```
[開始] → 導入質問
    ↓
[1-6問目] → 文脈に応じた深掘り質問
    ↓
[7-8問目] → 進捗情報を考慮した質問（終了提案の可能性あり）
    ↓
[8問以降] → suggested_end=true で終了を提案
    ↓
[ユーザー選択] → 継続 or 終了
```

### クレジット消費

```
消費クレジット = floor(回答数 / 5)
```

| 回答数 | 消費クレジット |
|--------|---------------|
| 1-4問 | 0 |
| 5-9問 | 1 |
| 10-14問 | 2 |

**重要:** 5問未満で終了した場合、クレジットは消費されない。

### LLM設定

| パラメータ | 値 |
|-----------|---|
| モデル | Claude Sonnet (環境変数: `CLAUDE_MODEL`) |
| 温度 | 0.7（高めで創造的な質問生成） |
| 最大トークン | 400 |

### フォールバック

APIキーが未設定または障害時は、以下の静的質問バンクを使用：

```python
STATIC_QUESTIONS = [
    "その経験を始めたきっかけは何でしたか？",
    "その中で最も困難だった出来事は何ですか？",
    "その困難をどのように乗り越えましたか？",
    "その経験から学んだことは何ですか？",
    "周りの人からどのような評価を受けましたか？",
    "具体的な数字や成果はありますか？",
    "チームの中でのあなたの役割は何でしたか？",
    "その学びを今後どのように活かしたいですか？",
]
```

---

## 3. 企業情報取得機能

### 概要

企業の採用ページURLから、締切・募集区分・提出物・応募方法などの情報をAIで自動抽出する機能。

### ファイル構成

```
backend/app/routers/company_info.py  # FastAPI エンドポイント
src/app/api/companies/[id]/fetch-info/route.ts  # Next.js API
```

### API仕様

**エンドポイント:** `POST /company-info/fetch`

**リクエスト:**
```json
{
  "url": "https://example.com/recruit"
}
```

**レスポンス:**
```json
{
  "success": true,
  "partial_success": false,
  "data": {
    "deadlines": [
      {
        "type": "es_submission",
        "title": "ES提出（一次締切）",
        "due_date": "2025-03-15",
        "source_url": "https://example.com/recruit",
        "confidence": "high"
      }
    ],
    "recruitment_types": [
      {
        "name": "夏インターン",
        "source_url": "https://example.com/recruit",
        "confidence": "high"
      }
    ],
    "required_documents": [
      {
        "name": "エントリーシート",
        "required": true,
        "source_url": "https://example.com/recruit",
        "confidence": "high"
      }
    ],
    "application_method": {
      "value": "マイページからエントリー",
      "source_url": "https://example.com/recruit",
      "confidence": "medium"
    },
    "selection_process": {
      "value": "ES → SPI → 面接3回",
      "source_url": "https://example.com/recruit",
      "confidence": "medium"
    }
  },
  "source_url": "https://example.com/recruit",
  "extracted_at": "2025-01-28T10:00:00Z",
  "error": null,
  "deadlines_found": true,
  "other_items_found": true
}
```

### 抽出項目

#### 締切情報 (deadlines)

| type | 説明 |
|------|------|
| `es_submission` | ES提出 |
| `web_test` | Webテスト |
| `aptitude_test` | 適性検査 |
| `interview_1` | 一次面接 |
| `interview_2` | 二次面接 |
| `interview_3` | 三次面接 |
| `interview_final` | 最終面接 |
| `briefing` | 説明会 |
| `internship` | インターン |
| `offer_response` | 内定承諾期限 |
| `other` | その他 |

#### 募集区分 (recruitment_types)

| 例 |
|----|
| 夏インターン |
| 本選考 |
| 早期選考 |
| 秋冬インターン |

#### 必要書類 (required_documents)

| 例 | required |
|----|----------|
| 履歴書 | true/false |
| エントリーシート | true |
| 成績証明書 | true/false |
| 卒業見込証明書 | false |

### 信頼度 (confidence)

各抽出項目には信頼度が付与される：

| 値 | 説明 |
|----|------|
| `high` | ページ上に明確に記載 |
| `medium` | 推測を含む（文脈から判断） |
| `low` | 不確実（情報が曖昧） |

### クレジット消費

| 結果 | 消費クレジット |
|------|---------------|
| 成功（締切あり） | 1 |
| 部分成功（締切なし、他の情報あり） | 0.5 |
| 失敗（情報なし） | 0 |

**重要:** `low` confidence の締切は、ユーザー承認なしに自動登録しない。

### 処理フロー

```
[URL受信]
    ↓
[HTMLフェッチ] ← httpx (User-Agent偽装、リダイレクト対応)
    ↓
[テキスト抽出] ← BeautifulSoup (script/style/nav/header/footer除去)
    ↓
[文字数制限] ← 最大10,000文字
    ↓
[LLM抽出] ← GPT-4o-mini (JSON形式で構造化)
    ↓
[結果返却] ← success/partial_success/failure判定
```

### LLM設定

| パラメータ | 値 |
|-----------|---|
| モデル | GPT-4o-mini (環境変数: `OPENAI_MODEL`) |
| 温度 | 0.1（非常に低め、正確性重視） |
| 最大トークン | 2000 |
| レスポンス形式 | JSON Object |

---

## 共通アーキテクチャ

### LLMラッパー

**ファイル:** `backend/app/utils/llm.py`

```python
async def call_llm(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None  # "es_review", "gakuchika", "company_info"
) -> dict | None
```

### 機能別モデル自動選択

```python
MODEL_CONFIG = {
    "es_review": "claude-sonnet",      # 高品質な文章改善
    "gakuchika": "claude-sonnet",      # 対話的な質問生成
    "company_info": "gpt-4o-mini",     # コスト効率の良い構造化抽出
}
```

### フォールバック戦略

```
1. APIキー未設定 → 別プロバイダーにフォールバック
   - Claude未設定 → OpenAI
   - OpenAI未設定 → Claude

2. API障害/パースエラー → モックデータ返却
   - ES添削: ハードコードされたスコア・改善点
   - ガクチカ: 静的質問バンク
   - 企業情報: confidence=low のプレースホルダー
```

### 認証・クレジット管理

認証とクレジット消費は Next.js API で処理：

```
[Next.js API]
    ↓
認証チェック (Better Auth)
    ↓
クレジット残高確認
    ↓
[FastAPI] → LLM呼び出し
    ↓
成功時のみクレジット消費
    ↓
結果をDBに保存
```

---

## モデル設定

### 環境変数

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `CLAUDE_MODEL` | Claude モデル名 | `claude-haiku-3-5-20241022` (開発) |
| `OPENAI_MODEL` | OpenAI モデル名 | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Anthropic APIキー | - |
| `OPENAI_API_KEY` | OpenAI APIキー | - |

### 環境別推奨設定

| 環境 | CLAUDE_MODEL | 入出力コスト |
|------|--------------|-------------|
| 開発 | `claude-haiku-3-5-20241022` | $0.80/$4 per MTok |
| 本番 | `claude-sonnet-4-5-20250929` | $3/$15 per MTok |

### 設定ファイル

```python
# backend/app/config.py
class Settings(BaseSettings):
    claude_model: str = "claude-haiku-3-5-20241022"
    openai_model: str = "gpt-4o-mini"
```

---

## 参考リンク

- [Anthropic Claude Pricing](https://platform.claude.com/docs/ja/about-claude/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [SPEC.md - ES添削仕様](./SPEC.md#16-es添削)
- [SPEC.md - ガクチカ深掘り仕様](./SPEC.md#17-ガクチカ深掘り)
- [SPEC.md - 企業情報取得仕様](./SPEC.md#9-企業情報取得)
