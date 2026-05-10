# ES添削機能 (ES Review)

## 1. 概要

ES添削は、ユーザーが書いたエントリーシートの設問回答を AI が添削し、改善案・出典・解説をリアルタイムに返すストリーミング機能。設問ごとにテンプレート（志望動機・ガクチカ等）を判定し、企業情報 RAG・参考ES・ユーザー文脈を組み合わせて質の高いリライトを生成する。

- **対応モデル**: Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro Preview / GPT-5.4-mini (low-cost)
- **プロトコル**: SSE (Server-Sent Events) によるリアルタイムストリーミング
- **認証**: ログインユーザー専用（ゲストは利用不可）
- **課金**: 成功時のみクレジット消費（Reserve → Confirm/Cancel パターン）

---

## 2. アーキテクチャ

### 3層構成

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                       │
│  ESEditorPageClient → ReviewPanel → useESReview hook    │
│  SSE消費 → Playback状態遷移 → StreamingReviewResponse   │
└────────────────────────────┬────────────────────────────┘
                             │ POST /api/documents/{id}/review/stream
┌────────────────────────────▼────────────────────────────┐
│  BFF (Next.js API Route)                                │
│  認証検証 → クレジット予約 → ペイロード構築 → SSE中継     │
│  handle-review-stream.ts + review-stream-context.ts     │
└────────────────────────────┬────────────────────────────┘
                             │ POST /api/es/review/stream
┌────────────────────────────▼────────────────────────────┐
│  Backend (FastAPI)                                       │
│  入力防御 → RAG取得 → 4段パイプライン → SSE生成           │
│  es_review.py → services/es_review/ → prompts/          │
└─────────────────────────────────────────────────────────┘
```

### 主要ファイル配置

| 層 | パス | 責務 |
|---|---|---|
| Page | `src/app/(product)/es/[id]/page.tsx` | SSR + ドキュメント取得 |
| Editor | `src/components/es/ESEditorPageClient.tsx` | 分割パネル + ブロック編集 |
| Review UI | `src/components/es/ReviewPanel.tsx` | セットアップ + 添削開始 |
| Result UI | `src/components/es/StreamingReviewResponse.tsx` | ストリーミング結果表示 |
| Hook | `src/hooks/useESReview.ts` | SSE消費 + 状態管理 |
| Transport | `src/features/es-review/hooks/transport.ts` | SSEパース |
| BFF Route | `src/app/api/documents/[id]/review/stream/route.ts` | API エントリ |
| BFF Logic | `src/bff/es-review/handle-review-stream.ts` | クレジット + ストリーム中継 |
| BFF Context | `src/bff/es-review/review-stream-context.ts` | リクエスト検証 + ペイロード構築 |
| Billing | `src/bff/billing/es-review-stream-policy.ts` | Reserve/Confirm/Cancel |
| Router | `backend/app/routers/es_review.py` | FastAPI エンドポイント + SSE生成 |
| Orchestrator | `backend/app/services/es_review/orchestrator.py` | 4段パイプライン |
| Validation | `backend/app/services/es_review/validation.py` | リライト品質検証 |
| Retry | `backend/app/services/es_review/retry.py` | リトライ戦略 + focus mode |
| Grounding | `backend/app/services/es_review/grounding.py` | エビデンスカード構築 |
| Fact Guard | `backend/app/services/es_review/fact_guard.py` | ハルシネーション検出 |
| AI Smell | `backend/app/services/es_review/ai_smell.py` | AI臭検出・スコアリング（SSOT） |
| Templates | `backend/app/prompts/es_templates/` | 9テンプレートのプロンプト生成 |
| Reference | `backend/app/prompts/reference_es.py` | 参考ES品質プロファイル |
| Logic Patterns | `backend/app/prompts/logic_patterns.py` | 構成パターン抽出（参考ESから分離） |
| Explanation | `backend/app/services/es_review/explanation.py` | 改善解説 JSON v2 生成 |
| Template Context | `backend/app/services/es_review/template_context.py` | 複合テンプレート解決 |
| Reference Data | `backend/app/reference/es_review/` | 参考ES JSONL + 構成パターン JSON |

### SSEイベントプロトコル

FastAPI からの内部SSEは BFF で ES添削専用の公開DTOへ変換する。ブラウザへは内部 `path`、`source_id`、`requestId`、retry trace、token usage、debug 情報を渡さない。

| イベント | 用途 | ペイロード例 |
|---|---|---|
| `progress` | 進捗更新 | `{step, progress, label}` |
| `rewrite_delta` | 改善案テキスト逐次送出 | `{text}` |
| `rewrite_complete` | 改善案テキスト確定 | `{value}` |
| `explanation_complete` | 改善説明確定 | `{value}` — value は JSON v2 文字列: `{"version":2,"improvement_points":[...],"main_changes":[...]}` |
| `source_added` | 出典カード追加 | `{source}` |
| `complete` | 最終結果 | `{result: {rewrites[], template_review, improvement_explanation, review_meta, billing_outcome}}` — `improvement_explanation` も JSON v2 文字列 |
| `error` | エラー | `{message, code, action, retryable}` |

---

## 3. リクエストライフサイクル

### ユーザー操作からレスポンスまで

1. **設問選択**: ユーザーが ES エディタで設問ブロックを選択
2. **セットアップ**: ReviewPanel でテンプレート種別・企業・業界・職種・モデルを設定
3. **添削開始**: 「この設問をAI添削」ボタン → `useESReview.requestSectionReview()` 呼び出し
4. **BFF処理**: Next.js API が認証確認 → クレジット予約 → FastAPI へ中継
5. **バックエンド処理**: 入力防御 → RAG取得 → リライト生成 → SSE送出
6. **UI表示**: 進捗バー → リライト文字送出 → 出典カード → 完了

### BFF層の役割（`handle-review-stream.ts`）

```
prepareReviewStreamContext()  → リクエスト検証 + ペイロード構築
  ↓
esReviewStreamPolicy.precheck()  → 認証確認（ゲスト拒否）
  ↓
esReviewStreamPolicy.reserve()  → クレジット事前控除
  ↓
fetch(FastAPI /api/es/review/stream)  → 上流SSE取得
  ↓
SSEストリーム中継  → フロントへ透過転送
  ↓
complete受信 → confirm()  |  error/abort → cancel()（返金）
```

### BFF ペイロード構築（`review-stream-context.ts`）

BFF はフロントからの簡潔なリクエストを、バックエンドが必要とするリッチなコンテキストに変換する:

- `profile_context`: ユーザープロフィール（大学・志望業界・志望職種）
- `gakuchika_context`: 直近4件のガクチカ要約
- `document_context`: 同一ESの他設問（最大4件）
- `retrieval_query`: RAG検索用の連結クエリ（最大850字）
- `role_context`: 職種情報（ユーザー入力 or なし）

### エラーパス

| 段階 | 条件 | 結果 |
|---|---|---|
| BFF | 未認証/ゲスト | 401 |
| BFF | クレジット不足 | 402 |
| Backend | 本文空 / 設問タイトル空 | SSE error |
| Backend | 注入リスク（high） | SSE error |
| Backend | LLM 呼び出し失敗 | 503 |
| Backend | リライト全試行失敗 | 422 |

---

## 4. バックエンドパイプライン

### 4.1 入力防御

ユーザー由来テキスト全体を `detect_request_injection_risk()` で検査する。

- **high**（遮断）: プロンプト開示要求、参考ES開示要求、個人情報抽出、SQL exfiltration
- **medium**（sanitize して続行）: code fence、role prefix、XML風タグ

### 4.2 4段パイプライン（`review_section_with_template`）

#### Stage 1: コンテキスト準備（`prepare_review_context`）

- テンプレート判定 + 分類信頼度評価
- 複合テンプレート解決（`build_effective_template_context()`）— 設問が複数テンプレートにまたがる場合に `EffectiveTemplateContext` を構築。RAG プロファイルタイプ（`rag_profile_type`）、企業 RAG 要否（`requires_company_rag`）、統合評価軸（`effective_evaluation_axes`、最大7軸）を一元解決する。SSOT: `backend/app/services/es_review/template_context.py`
- grounding level 解決（テンプレート推奨 × 証拠量 × 字数帯）
- ユーザー事実抽出（最大8件、relevance + source balance で選択）
- 企業RAGソース検証（同一企業ドメイン確認）
- エビデンスカード構築（最大5件、テーマ分類付き）
- 参考ES品質プロファイル読み込み

#### Stage 2: リライトループ（`execute_rewrite_loop`）

最大3回の試行。各試行で:

1. Focus mode 解決（前回の失敗コードから決定）
2. プロンプト構築（`build_template_rewrite_prompt`）
3. LLM呼び出し
4. `_validate_rewrite_candidate()` で機械検証:
   - 文字数制約（strict帯: char_max-10 〜 char_max）
   - だ・である調の徹底
   - 冒頭結論ファースト（20-45字）
   - 企業根拠の存在（grounding required時）
   - AI smell スコア（6カテゴリ、tier 0-2）
   - ハルシネーション検出（数値/役職/経験の捏造）
5. 合格 → break / 不合格 → 失敗コード記録 → 次の試行

#### Stage 3: リカバリパイプライン（`execute_recovery_pipeline`）

Stage 2 で合格案が得られなかった場合:

1. **Length-fix**（最大1回）: 文字数専用プロンプトで修正。soft validation（length/style/grounding のみ許可）
2. **Best-effort 採用**: 安全基準を満たす最良候補を `degraded` ラベル付きで採用
3. **全失敗**: 422 HTTPException

#### Stage 4: 組立（`assemble_review_response`）

- 最終リライトを20文字チャンクでSSE送出
- 出典リンクを逐次送出
- 改善解説を GPT-5.4-mini で非同期生成（8秒タイムアウト、最大900トークン）
- `review_meta`（50+フィールド）を組立

##### 改善解説（Explanation JSON v2）

改善解説は `explanation.py` の `generate_improvement_explanation()` が生成する。出力は構造化 JSON v2 形式で、OpenAI JSON Schema モードを使用する。評価軸は `effective_evaluation_axes`（Stage 1 で解決済み）からテンプレートごとに決定する。

```json
{
  "version": 2,
  "improvement_points": [
    {"axis": "評価軸名", "point": "改善ポイント短く", "detail": "読み手に伝わる変化を1文で"}
  ],
  "main_changes": [
    {"before_summary": "変更前の要約", "after_summary": "変更後の要約", "change": "何をどう直したかを1文で"}
  ]
}
```

| フィールド | 最大件数 | 切り詰め上限 |
|---|---|---|
| `improvement_points` | 3件 | axis: 32字、point: 48字、detail: 110字 |
| `main_changes` | 2件 | before_summary: 24字、after_summary: 24字、change: 90字 |

- ストリーミングチャンクは個別送出せず、完全なレスポンスを収集後 `_normalize_explanation_payload()` で正規化
- BFF 層で `explanation_complete` イベントに変換し、フロントの `useESReview` が JSON パースして UI 表示
- `complete` イベントの `result.improvement_explanation` も同じ JSON v2 文字列

SSOT: `backend/app/services/es_review/explanation.py`

### 4.3 バリデーション判定基準

| チェック項目 | 判定基準 | 失敗コード |
|---|---|---|
| 文字数下限 | char_max の 90% フロア | `under_min` |
| 文字数上限 | char_max 超過 | `over_max` |
| 文体 | です/ます の残存 | `style` |
| 冒頭 | 設問復唱・長すぎる導入 | `verbose_opening` |
| 企業根拠 | required テンプレで根拠なし | `grounding` |
| 構造 | 箇条書き・断片文 | `bulletish_or_listlike` / `fragment` |
| 自己否定 | ネガティブな自己評価 | `negative_self_eval` |
| 捏造 | 数値/役職の改変 | `hallucination` |

### 4.4 リトライ戦略

リトライ順序は固定:

```
strict → focused retry 1 → focused retry 2 → length-fix → degraded / 422
```

Focused retry は失敗コードから focus mode を決定する:

| 失敗コード | Focus mode |
|---|---|
| `under_min` | `length_focus_min` |
| `over_max` | `length_focus_max` |
| `style` | `style_focus` |
| `grounding` | `grounding_focus` |
| `verbose_opening` | `opening_focus` |
| `negative_self_eval` | `positive_reframe_focus` |
| `bulletish_or_listlike` / `fragment` | `structure_focus` |

複合失敗では composite mode（Step 1 / Step 2 段階指示）を1回の LLM 呼び出しで適用する。

#### Delta-band 動的修復

`length_focus_min` は `FocusModeContext` により不足量に応じた具体的修復戦略を生成する:

| Delta Band | 条件 | 修復戦略 |
|---|---|---|
| large | shortfall >= 70字 | 2〜3文追加。根拠経験→学び→企業接点を展開 |
| medium | 35-69字 | 1文追加。既存文脈の具体化か因果の補足 |
| small | 15-34字 | 補足句1つ。語尾・接続・修飾の密度向上 |
| tiny | < 15字 | 語尾変更・短い補足句で微調整 |

SSOT: `compute_shortfall_delta_band()` in `backend/app/prompts/es_templates/_length_control.py`

#### Overshoot 方式（under_min_recovery）

LLM のアンダーシュート傾向を補正するため、recovery stage では内部目標を char_max を超えて設定する:

| Provider | short 帯 | medium 帯 | long 帯 |
|---|---|---|---|
| GPT-5 Mini | +20字 | +15字 | +10字 |
| Claude / GPT-5 / Gemini / generic | +15字 | +12字 | +8字 |

#### Temperature / Token 上限

| Stage | Focus Mode | Temperature | Token 上限 |
|---|---|---|---|
| Rewrite | normal | 0.20 | char_max * 1.4 |
| Rewrite | length_focus_min (large) | 0.15 | char_max * 1.3 |
| Rewrite | length_focus_min (medium) | 0.13 | char_max * 1.3 |
| Rewrite | length_focus_min (small/tiny) | 0.11 | char_max * 1.3 |
| Rewrite | 他の focus mode | 0.14 | char_max * 1.4 |
| Length-fix | - | 0.12 | char_max * 1.2 |

詳細: `docs/prompts/es-review/repair-strategies.md`

---

## 5. テンプレートシステム

### 9テンプレート

| テンプレート | 用途 | Grounding Policy |
|---|---|---|
| `basic` | 汎用（分類不能時のフォールバック） | 設問文に応じて可変 |
| `company_motivation` | 志望動機 | `deep` (required) |
| `role_course_reason` | コース/職種志望理由 | `deep` (required) |
| `intern_reason` | インターン参加理由 | `standard` (required) |
| `intern_goals` | インターンで学びたいこと | `standard` (required) |
| `post_join_goals` | 入社後にやりたいこと | `standard` (required) |
| `gakuchika` | 学生時代に力を入れたこと | `none` |
| `self_pr` | 自己PR | `light` (assistive) |
| `work_values` | 大切にしている価値観 | `light` (assistive) |

### TEMPLATE_DEFS の構造

`backend/app/prompts/es_templates/` に各テンプレートの仕様を集約:

- `purpose`: テンプレートの目的
- `required_elements`: 必須要素
- `anti_patterns`: 禁止パターン
- `evaluation_checks`: 自動検証項目
- `retry_guidance`: リトライ時の橋渡し文言
- `recommended_structure`: 推奨構成
- `question_focus_rules`: 冒頭焦点ルール

プロンプト・バリデータ・リトライヒントが同じ定義を参照することで一貫性を保証する。

### 複合テンプレート

1設問に複数のテンプレートタイプが含まれる場合（例: 「志望動機 + 入社後の目標」）、`merge_template_specs()` が仕様をマージする:

- `required_elements`: 全コンポーネントから重複排除して統合
- `anti_patterns`: 同上
- `evaluation_axes`: 主テンプレートの全軸 + 副テンプレートの上位2軸（最大7軸、重複排除）
- `grounding_level`: コンポーネント中の最高レベルを採用
- `requires_company_rag`: いずれかが `True` なら `True`
- `retry_guidance`: 主テンプレートを基本に、副テンプレートのガイダンスを追加

`strength_weakness` バリアントでは「弱みの認識と克服姿勢」を必須要素に追加し、専用の評価軸を付与する。11パターンの `SUPPORTED_COMPOUND_PATTERNS` を定義（一覧はコード参照）。

SSOT: `backend/app/services/es_review/template_context.py` の `merge_template_specs()`

### テンプレート別結び動詞ガイダンス

テンプレートごとに参考ESコーパスの傾向に基づく結び動詞の推奨が異なる:

| テンプレート | 結びの傾向 |
|---|---|
| `gakuchika` | 「培った」「身につけた」が主流。「学んだ」は避ける |
| `self_pr` | 「活かしたい」「活用したい」で志望先業務に接続 |
| `company_motivation` | 「貢献していく」「成長したい」で行動宣言 |

ガクチカでは配分ガイド・few-shot例・patterns.json のすべてで「培った」「身につけた」「磨いた」を推奨し、「学んだ」「実感した」を禁止している。

SSOT: `backend/app/prompts/es_templates/_prompt_builder.py` の配分ガイド、`backend/app/prompts/gakuchika_prompts.py` の few-shot 配分例

### Grounding Level の解決

推奨レベルを基に、以下の条件で下方修正する（上げることはない）:

- `basic` で char_max ≤ 220 → `light` に制限
- RAG 未利用 → 1段階下げ
- evidence_coverage が `weak` → 1段階下げ
- evidence_coverage が `none` → `light` に強制

---

## 6. 企業RAG連携

### RAG取得条件

- 企業が選択されている場合のみ実行
- 企業未選択でも添削は可能（テンプレート制限あり: basic/gakuchika/self_pr/work_values のみ）

### Source Family 優先順位（テンプレート依存）

| テンプレート | 1st | 2nd | 3rd |
|---|---|---|---|
| `company_motivation` | business_future | people_values | hiring_role |
| `role_course_reason` | hiring_role | people_values | business_future |
| `intern_reason` / `intern_goals` | hiring_role | people_values | business_future |
| `post_join_goals` | business_future | people_values | hiring_role |
| `self_pr` / `gakuchika` / `work_values` | people_values（補助のみ） | — | — |

### エビデンスカード構築

RAGソースを構造化してプロンプトに渡す:

1. 同一企業ドメイン検証（`classify_company_domain_relation`）
2. テーマ分類（企業理解/事業理解/価値観/役割理解/現場期待 等）
3. 最大5件に絞り込み
4. `evidence_coverage_level` を算出: `strong` / `partial` / `weak` / `none`

ソース不足時は企業固有の断定を広げず、`company_general` または `weak_evidence_notice` で安全側に倒す。

---

## 7. 品質保証

### 参考ES

参考ESは本文の材料には使わない。用途は以下に限定:

- **quality hints**: 冒頭結論の長さ、文数、具体性の統計的指針
- **coarse skeleton**: 大まかな構成パターン
- **conditional hints**: 参考群との乖離が大きい場合のみ追加ヒント
- **logic patterns**: 論理構成パターン（`logic_patterns.py` で別モジュール管理）

#### JSONL コーパス

設問タイプ別にコーパスを格納する。`REFERENCE_ES_PATH` を明示的にオーバーライドした場合のみレガシー JSON にフォールバックする。

```
backend/app/reference/es_review/
├── basic/
│   ├── references.jsonl     ← 参考ES本文
│   └── patterns.json        ← logic_patterns 用
├── company_motivation/
│   └── ...
└── ... (9テンプレート分)
```

**`references.jsonl` レコードのフィルタリング条件**:

| 条件 | 必須値 |
|---|---|
| `question_type` | リクエストと一致 |
| `capture_kind` | `"full_text"` |
| `usage_consent` | `true` |
| `anonymized` | `true` |
| `source_provenance` | 存在（空でない） |

**テキスト品質検証**（`_is_reference_text_usable()`）:

- 最低20文字
- アーティファクトパターンを含まない: `"【内容・詳細】"`, `"文字以上"`, `"文字以下"`, `"お聞かせください"`, `"教えてください"`
- `char_max` 設定時: `max(char_max + 80, char_max × 1.35)` 以内

参考ESが0件の場合、`build_reference_quality_profile()` は空のデフォルトプロファイルを返す（`None` ではない）。品質ヒントと骨子はテンプレート種別の固定値が適用される。

SSOT: `backend/app/prompts/reference_es.py`

#### 構成パターン（Logic Patterns）

`reference_es.py` から分離された `logic_patterns.py` が構成パターンの読み込みと整形を担う。

- ソース: `backend/app/reference/es_review/{question_type}/patterns.json`
- `build_logic_patterns_block()` は `build_reference_quality_block()` 内から呼び出される
- 出力条件: confidence が `high` または `medium`、かつ `char_max >= 260`

**安全検査**:
- `human_reviewed: true` が必須（未レビューのパターンは無視）
- `_check_copy_safety()`: 企業名がパターンテキストに残っていないことを確認
- スキーマバリデーション: 必須フィールドの存在を検証

SSOT: `backend/app/prompts/logic_patterns.py`

### Cross-Model Compliance

ES 添削の text 生成は、Claude / GPT / Gemini の全モデルで `backend/app/prompts/es_templates/_prompt_builder.py` が構築した同一 system / user プロンプトを使用する。provider 別の text augmentation は行わず、文体・文字数・出力形式・段落構成の契約はテンプレートビルダー側を正本にする。

SSOT: `backend/app/prompts/es_templates/_prompt_builder.py`

### AI安全対策

| 対策 | 検出対象 | 処理 |
|---|---|---|
| Injection検出 | プロンプト操作・情報抽出 | high→遮断 / medium→sanitize |
| Fact Guard | 数値変更・役職変更・経験捏造 | `hallucination` 失敗コード → hard block + 事実保全リトライ |
| AI Smell | 6カテゴリのLLM定型句検出（SSOT: `ai_smell.py`） | tier を観測。AI臭単独ではリトライせず、他理由のリトライ時にヒント同乗 |

### review_meta による観測性

バックエンド内部では全添削リクエストに `review_meta`（50+フィールド）を付与し、品質の観測・集計を可能にする。BFF の公開SSEでは UI 表示に必要な最小 subset だけを残す。

- **分類**: `classification_confidence`, `recommended_grounding_level`, `effective_grounding_level`
- **生成過程（内部診断のみ）**: `rewrite_attempt_count`, `length_policy`, `repair_dispatches`, `composite_retry_modes`, `length_fix_attempted`, `fallback_triggered`
- **提出前チェック材料**: `ai_smell_tier`, `concrete_marker_count`, `opening_conclusion_chars`
- **検証結果**: `rewrite_validation_status` (`strict` / `soft_ok` / `degraded` / `failed`)
- **トークン使用量（内部診断のみ）**: `input_tokens`, `output_tokens`, `reasoning_tokens`, `llm_call_count`

公開 `review_meta` は `grounding_mode`、`weak_evidence_notice`、`rewrite_validation_status`、`rewrite_validation_user_hint`、提出前チェックに必要な自然表示用の数値に限定する。

---

## 8. フロントエンド

### コンポーネント構成

```
ESEditorPageClient (1155行)
├── ブロックエディタ（H2セクション単位）
├── 自動保存（2秒debounce）
├── Undo/Redo
└── デスクトップ: 55/45 分割パネル
    └── ReviewPanel (1400行)
        ├── セットアップUI（テンプレート/企業/業界/職種/モデル）
        ├── バリデーション + エラーハイライト
        └── StreamingReviewResponse (601行)
            ├── 進捗バー
            ├── リライトテキスト（タイピングアニメーション）
            ├── 反映準備 CTA
            ├── 改善ポイント / 主な変更点（JSON v2 payload を UI で表示、初期折りたたみ）
            ├── 提出前チェック（構成/具体性/企業接続/根拠、初期折りたたみ）
            └── 出典リンク（初期折りたたみ）
```

### ストリーミング再生システム

`useESReview` フックが SSE を消費し、Playback状態遷移を管理:

```
idle → rewrite（文字逐次表示）→ sources（出典カード追加）→ complete（確定）
```

- タイピングアニメーション: 句読点で遅延、`prefers-reduced-motion` 対応
- 20文字チャンク単位でバックエンドから送出
- `responseInstanceKey` インクリメントで再マウント強制

### 主要フック

| フック | 責務 |
|---|---|
| `useESReview` | SSE消費・状態管理・abort制御・経過時間計測 |
| `useCredits` | 残高取得・コスト計算 |
| `useOperationLock` | ストリーミング中のエディタロック |

### リライト反映

1. ユーザーが「この改善案を反映」をクリック
2. `ReflectModal` で差分（追加=緑/削除=赤）を表示
3. 確認 → `handleApplyRewrite()` でセクション置換
4. Undo ボタンで元に戻せる

---

## 9. 課金・認証

### クレジット消費テーブル（`calculateESReviewCost`）

| モデル区分 | 〜500字 | 〜1000字 | 〜1500字 | 1501字〜 |
|---|---|---|---|---|
| Claude / GPT / Gemini | 6 | 10 | 14 | 20 |
| クレジット消費を抑えて添削 (low-cost) | 3 | 6 | 9 | 12 |
| Free プラン（実体=mini、クレジットはプレミアム帯） | 6 | 10 | 14 | 20 |

### Reserve → Confirm/Cancel フロー

1. **Reserve**: 添削開始時にクレジットを事前控除
2. **Confirm**: SSE `complete` で `billing_outcome.success && billable` → 控除確定
3. **Cancel**: エラー・abort・無効な結果 → 返金

### 認証ルール

- **ログインユーザー**: 全機能利用可能
- **ゲスト**: 添削不可（BFF が 401 で拒否）
- **Free プラン**: GPT-5.4 mini 固定（モデル選択UI非表示）
- **Standard / Pro**: 4モデルから選択可能

---

## 10. テスト

### Validation Profile

ES rewrite の検証は `backend/app/services/es_review/validation_profile.py` の `STRICT_PROFILE` を標準にする。元回答の情報量は文字数と抽出事実数から `sparse` / `low` / `moderate` / `sufficient` に分類し、短い元回答では `fact_preservation` を warning 扱いに落として、事実が少ない入力への過剰ブロックを避ける。

`number_mutation` は全 tier で hard block のまま維持する。`role_title_mutation` と `metric_fabrication` は情報量 tier に応じて hard block / warning の境界を変え、telemetry には `validation_profile_name` と `information_density` を残す。

### テスト層

| 層 | コマンド | 内容 |
|---|---|---|
| Unit (Backend) | `python -m pytest backend/tests/es_review -q` | プロンプト構造・バリデーション・リトライ |
| Architecture | `python -m pytest backend/tests/architecture/ -q` | サービス層の境界分離 |
| Live Provider | `make backend-test-live-es-review` | 実API品質ゲート（ローカルのみ） |
| Unit (Frontend) | `npm run test:unit` | コンポーネント・バリデーション |
| E2E | `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=es-review` | ブラウザ統合テスト |

### 主要テストファイル

- `backend/tests/es_review/test_es_review_prompt_structure.py` — 166ケース、全テンプレートの prompt 構造検証
- `backend/tests/es_review/test_es_review_final_quality_cases.py` — リライト品質・文字数・文体の回帰テスト
- `backend/tests/es_review/test_es_review_quality_rubric.py` — コンテキスト品質の最低0.8スコア保証
- `backend/tests/es_review/test_es_review_template_repairs.py` — 正規化・圧縮・degraded処理
- `backend/tests/architecture/test_es_review_ca2_boundaries.py` — サービス層↔ルーター層の依存方向
- `backend/tests/es_review/test_es_review_explanation_prompt.py` — 改善説明 JSON v2 構造検証
- `backend/tests/es_review/test_es_review_template_context.py` — 複合テンプレート解決
- `backend/tests/es_review/test_ai_smell.py` — AI臭検出6カテゴリ・具体性チェック・スコアリング
- `backend/tests/es_review/test_logic_patterns.py` — 構成パターン・copy-safety
- `backend/tests/es_review/test_reference_es_corpus_integrity.py` — コーパス整合性

---

## 11. 主要ファイル一覧（クイックリファレンス）

| カテゴリ | ファイル | 行数 |
|---|---|---|
| **Backend Core** | `backend/app/services/es_review/orchestrator.py` | ~1,630 |
| | `backend/app/services/es_review/validation.py` | ~824 |
| | `backend/app/services/es_review/retry.py` | ~900 |
| | `backend/app/services/es_review/grounding.py` | ~990 |
| | `backend/app/services/es_review/ai_smell.py` | ~276 |
| | `backend/app/services/es_review/explanation.py` | ~310 |
| | `backend/app/services/es_review/template_context.py` | ~295 |
| | `backend/app/routers/es_review.py` | ~1,310 |
| **Prompts** | `backend/app/prompts/es_templates/` (dir) | ~2,535 |
| | `backend/app/prompts/reference_es.py` | ~650 |
| | `backend/app/prompts/logic_patterns.py` | ~290 |
| **Data** | `backend/app/reference/es_review/` (dir) | 9テンプレート分の JSONL + patterns |
| **Frontend** | `src/components/es/ReviewPanel.tsx` | ~1,400 |
| | `src/components/es/ESEditorPageClient.tsx` | ~1,155 |
| | `src/components/es/StreamingReviewResponse.tsx` | ~600 |
| | `src/hooks/useESReview.ts` | ~690 |
| **BFF** | `src/bff/es-review/review-stream-context.ts` | ~393 |
| | `src/bff/es-review/handle-review-stream.ts` | ~221 |

---

## 補足: 関連ドキュメント

- テスト品質基準: `docs/testing/ES_REVIEW_QUALITY.md`
- ガクチカ深掘り: `docs/features/GAKUCHIKA_DEEP_DIVE.md`
- 志望動機: `docs/features/MOTIVATION.md`
- 集客LP: `src/app/(marketing)/es-tensaku-ai/page.tsx`
