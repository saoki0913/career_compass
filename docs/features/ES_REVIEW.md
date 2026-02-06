# ES添削機能

ES（エントリーシート）の品質評価・改善提案・リライトを行う機能。

## 概要

| 項目 | 内容 |
|------|------|
| LLM | Claude Sonnet |
| 評価軸 | 論理・具体性・熱意・企業接続・読みやすさ（5段階） |
| 出力 | スコア + 改善点（最大3） + リライト（テンプレート時はvariantsから再構成） |
| 文字制限 | 上限は厳守、下限のみ許容幅（±10% or 最低20字） |
| フォールバック | ES添削はClaude固定（OpenAIフォールバック無効） |

## 処理フロー

```
フロント → Next.js API → FastAPI → Claude LLM
   │           │            │          │
   │ POST      │ 認証/      │ RAG取得   │ JSON出力
   │ /review   │ クレジット  │ + プロンプト│
```

1. **認証・クレジット確認** (Next.js API)
2. **企業RAG取得**（任意）- ハイブリッド検索で関連情報を取得
3. **LLM呼び出し** - テンプレート別プロンプトでClaude Sonnetを呼び出し
4. **バリデーション** - 文字数・パターン数・文体を検証
5. **成功時のみクレジット消費**

## テンプレート一覧

| ID | 名称 | キーワード | 企業RAG |
|----|------|-----------|---------|
| `company_motivation` | 企業志望理由 | 2 | 必須 |
| `intern_reason` | インターン志望理由 | 0 | 必須 |
| `intern_goals` | インターンでやりたいこと | 2 | 必須 |
| `gakuchika` | ガクチカ | 0 | 不要 |
| `post_join_goals` | 入社後やりたいこと | 2 | 必須 |
| `role_course_reason` | 職種・コース選択理由 | 0 | 必須 |
| `work_values` | 働く価値観 | 0 | 不要 |
| `self_pr` | 自己PR | 0 | 不要 |
| `basic` | 汎用ES添削 | 2 | 任意 |

> **Note**: `basic` テンプレートは汎用的なES添削用。特定の設問タイプに当てはまらない場合に使用。

## クレジット消費

| 文字数 | クレジット |
|--------|-----------|
| 〜800 | 1 |
| 〜1600 | 2 |
| 〜2400 | 3 |
| 〜3200 | 4 |
| 3201〜 | 5（上限） |

## max_tokens設定

| 処理 | max_tokens | 備考 |
|------|-----------|------|
| 初回レビュー（1パターン） | 2,500 | 旧: 4,000 |
| テンプレートレビュー（3パターン） | 6,000 | 旧: 10,000 |

トークンコスト約30%削減。

## 文字数制御

### 許容範囲
- **上限**: 厳守（例: 500字以内 → 500超過はエラー）
- **下限**: 許容幅を使用（±10% または最低20字幅）
- 例: 400字指定 → 360〜400字（40字幅）
- テンプレート添削の下限算出: `char_min = char_limit - max(20, floor(char_limit * 0.10))`

### ハードバリデーション

LLMの自己申告文字数（`char_count`）と実際の文字数を比較。乖離が10%を超える場合はエラーとしてリトライ対象とする（サイレント修正ではなく明示的エラー）。

```python
# 10%超の乖離でエラー
deviation = abs(reported - actual) / actual
if deviation > 0.10:
    errors.append("char_count不正確")
```

### リトライ戦略
1. **初回〜3回**: 全パターン再生成
2. **条件付きリトライ**: 2/3パターン成功時、失敗パターンのみ再生成

### 文字数圧縮テクニック（プロンプトに含む）
- 「〜ということ」→「〜こと」
- 「〜させていただく」→「〜する」
- 「非常に大きな」→「大きな」

## JSON出力形式（テンプレート添削）

テンプレート添削では、JSONを簡素化して出力します。
- `rewrites` は出力しない（`template_review.variants[*].text` を本文として使用）
- `top3` は最大2件
- `keyword_sources.excerpt` は任意（無くてもOK）

### 代表的な出力例

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
      "category": "specificity",
      "issue": "数字が不足",
      "suggestion": "具体的な数値を追加",
      "difficulty": "easy"
    }
  ],
  "template_review": {
    "template_type": "post_join_goals",
    "variants": [
      {
        "text": "改善案本文...",
        "char_count": 395,
        "pros": ["論理的"],
        "cons": ["熱意不足"],
        "keywords_used": ["DX推進"],
        "keyword_sources": ["S1"]
      }
    ],
    "keyword_sources": [
      {
        "source_id": "S1",
        "source_url": "https://...",
        "content_type": "ir_materials"
      }
    ],
    "strengthen_points": []
  }
}
```

## JSON出力形式（通常ES添削）

通常のES添削では `rewrites` を含みます（テンプレート時のみ省略）。
- `top3` は最大3件
- `rewrites` は1〜3件

## バリデーション

| チェック項目 | 条件 | 失敗時 |
|-------------|------|--------|
| パターン数 | 3件必須 | リトライ |
| 文字数上限 | char_max以下 | リトライ |
| 文字数下限 | char_min以上 | リトライ |
| 文体 | だ・である調 | リトライ |

**補足**
- `top3` の件数は通常1〜3件、テンプレート添削は最大2件
- テンプレート添削では `rewrites` を出力しない

**注**: キーワード数はプロンプトでの指示のみ（Soft Guidance）。出力バリデーションは行わない。

## 3パターン差別化

テンプレート添削の3パターンは、明示的にスタイルが指定される:

| パターン | スタイル | 特徴 |
|---------|---------|------|
| パターン1 | **バランス型** | 論理性と熱意を両立、最も安定した構成 |
| パターン2 | **論理型** | PREP法など論理構成を重視、数値やエビデンスを強調 |
| パターン3 | **熱意型** | 具体エピソードと感情描写を重視、人物像が伝わる構成 |

プロンプトに明示的指示を含め、3パターンが類似構成にならないことを保証。

## 設定（config.py）

```python
es_char_tolerance_percent = 0.10  # 許容幅10%
es_char_tolerance_min = 20        # 最小許容幅20字
es_template_max_retries = 3       # 最大リトライ回数
es_enable_conditional_retry = True # 条件付きリトライ有効
```

## エラー対応

| エラー | 原因 | 対処 |
|--------|------|------|
| 503 (parse) | JSON解析失敗 | プロンプト改善またはリトライ |
| 422 (validation) | 文字数/パターン数不正 | 自動リトライ |
| 503 (rate_limit) | API制限 | 時間を置いて再試行 |

**備考**: ES添削はClaude固定のため、OpenAIへのフォールバックは行わない。

## UI機能

### 比較ビュー（Before/After）

添削結果を元のテキストと並べて表示。変更点が視覚的にわかりやすい。

### タブベースリライト表示

複数のリライト案をタブで切り替えて表示。各タブには:
- リライト本文
- 文字数
- 長所（pros）
- 短所（cons）

### RAGソース情報表示

企業RAGから取得した情報のソースを表示:
- ソースURL
- コンテンツタイプ（ir_materials, corporate_site等）
- 使用されたキーワード

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `backend/app/routers/es_review.py` | メインロジック |
| `backend/app/prompts/es_templates.py` | テンプレート・プロンプト |
| `backend/app/utils/llm.py` | LLM呼び出し・JSONパース |
| `backend/app/config.py` | 設定値 |
| `src/app/api/documents/[id]/review/route.ts` | 認証・クレジット（同期） |
| `src/app/api/documents/[id]/review/stream/route.ts` | SSEストリーミング対応 |
| `src/components/es/ReviewPanel.tsx` | フロントエンドUI |
| `src/components/es/ReviewCompareView.tsx` | 比較ビューUI |
| `src/components/es/RewriteTabs.tsx` | タブベースリライト表示 |

## ストリーミング対応

ES添削はSSE（Server-Sent Events）によるリアルタイム進捗表示に対応。

**エンドポイント**: `POST /api/documents/[id]/review/stream`

**レスポンス形式**:
```
data: {"type": "progress", "step": "fetching_rag", "message": "企業情報を取得中..."}
data: {"type": "progress", "step": "calling_llm", "message": "AI添削を実行中..."}
data: {"type": "result", "data": {...}}  // 最終結果
```

## テスト

```bash
cd backend
pytest tests/test_es_char_control.py -v
```

テストカバレッジ:
- `parse_validation_errors` - 文字数超過/不足検出
- `build_char_adjustment_prompt` - 修復プロンプト生成
- `validate_and_repair_section_rewrite` - セクションリライト検証
- `should_attempt_conditional_retry` - 条件付きリトライ判定
- `validate_template_output` - テンプレート出力検証
