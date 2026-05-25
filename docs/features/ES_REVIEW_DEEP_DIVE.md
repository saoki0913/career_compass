# ES添削機能 Deep Dive

本ドキュメントは、就活Pass の ES添削機能を実装から読み解くための詳細資料である。機能全体の単一正本は `docs/features/ES_REVIEW.md`、実行時の正本はコードである。`docs/prompts/es-review/` は人間レビュー用のスナップショットであり、実行時には読み込まれない。

## このドキュメントの読み方

5章構成で、上から順に読むと段階的に理解が深まる。

```text
第1章 全体像 ─────→ まず全体の流れを掴む
     │
第2章 リクエスト処理層 → 各層が何をするか理解する
     │
第3章 生成パイプライン → LLM 生成の中身を理解する
     │
第4章 品質管理 ────→ 品質をどう保っているか理解する
     │
第5章 運用リファレンス → 開発・運用時に参照する
```

基本仕様:

- 対応モデル: Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro Preview / GPT-5.4-mini (low-cost)。
- 通信方式: サーバー送信イベント（SSE）によるリアルタイムストリーミング。
- 認証: ログインユーザー専用。ゲストは添削不可。
- 課金: 成功時のみクレジット消費。事前予約して、成功完了時だけ確定する。
- 出力: 改善案、企業情報の出典、改善解説、提出前チェック材料を返す。

---

## 第1章 全体像

### 1.1 ES添削とは何か

ES添削は、ユーザーが ES エディタ上で選んだ設問回答を、大規模言語モデル（LLM）で提出品質の文章へ書き直すストリーミング機能である。生成結果は自動保存されず、ユーザーが改善案を適用した後に通常の文書保存経路で保存される。

ユーザーの操作フロー:

1. ES エディタで添削したい設問ブロックを選ぶ。
2. テンプレート種別、企業、業界、職種、モデルを設定する。
3. 「この設問をAI添削」ボタンを押す。
4. 進捗バーとリライトの段階表示を見ながら結果を待つ。
5. 改善案、出典、改善ポイント、提出前チェックを確認する。
6. 改善案を適用すると差分確認ダイアログが出て、確認後にエディタ本文が置き換わる。

最重要ルール:

- ログインユーザー専用。ゲスト識別は解決できるが、`esReviewStreamPolicy.precheck()` でゲストは拒否される。
- クレジットは成功時のみ消費する。BFF が事前予約し、妥当な `complete` だけ確定する。
- FastAPI は課金状態を変更しない。課金の正本は BFF 側にある。
- 参考ES本文は実行時に読み込まない。手動キュレーション済みの抽象指針だけを `QualityBlueprint` に圧縮して使う。
- 品質改善は許可するが、数値、役職、成果、受賞、固有名詞、未経験の出来事、企業根拠カード外の固有施策は作らない。

---

### 1.2 3層アーキテクチャ

ES添削は3つの層で構成される。各層は異なる問題を解決するために分離されている。

```text
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                       │
│                                                         │
│  なぜ: LLM の不定速レスポンスに対して、受信状態と         │
│  表示状態を分離し、ユーザー体験を最適化する               │
│                                                         │
│  ESEditorPageClient → ReviewPanel → useESReview hook    │
│  SSE 消費 → playback 状態遷移 → StreamingReviewResponse │
└────────────────────────────┬────────────────────────────┘
                             │ POST /api/documents/{id}/review/stream
┌────────────────────────────▼────────────────────────────┐
│  BFF (Next.js API Route)                                │
│                                                         │
│  なぜ: 認証・課金・秘匿情報除去をブラウザと LLM の間に    │
│  挟み、FastAPI に課金権限を持たせない                     │
│                                                         │
│  handle-review-stream.ts + review-stream-context.ts     │
└────────────────────────────┬────────────────────────────┘
                             │ POST /api/es/review/stream
┌────────────────────────────▼────────────────────────────┐
│  Backend (FastAPI)                                      │
│                                                         │
│  なぜ: LLM 呼び出し・プロンプト構築・品質検証を           │
│  課金状態から完全に分離し、生成品質に集中する              │
│                                                         │
│  es_review.py → services/es_review/ → prompts/          │
└─────────────────────────────────────────────────────────┘
```

---

### 1.3 リクエストの一生

ユーザーが添削ボタンを押してから結果が表示されるまで、データは以下の経路をたどる。

```text
User        Frontend           BFF              FastAPI           LLM
 │            │                 │                  │                │
 │─設問選択──→│                 │                  │                │
 │            │─POST /review/──→│                  │                │
 │            │   stream        │                  │                │
 │            │                 │─認証・所有権確認  │                │
 │            │                 │─クレジット予約    │                │
 │            │                 │─payload 構築─────→│                │
 │            │                 │                  │─入力防御       │
 │            │                 │                  │─企業 RAG 取得  │
 │            │                 │                  │─プロンプト構築─→│
 │            │                 │                  │←─リライト生成──│
 │            │                 │                  │─検証（不合格なら再試行）
 │            │                 │←──内部 SSE───────│                │
 │            │←─公開 SSE───────│                  │                │
 │            │  (秘匿情報除去) │                  │                │
 │←─結果表示──│                 │                  │                │
 │            │                 │─課金確定 or 取消  │                │
```

BFF の処理順:

```text
requireOwnerMutationRequest()    ← 変更リクエスト防御
         │
prepareReviewStreamContext()     ← 入力検証 + payload 構築
         │
esReviewStreamPolicy.precheck()  ← ゲスト拒否
         │
esReviewStreamPolicy.reserve()   ← クレジット事前予約
         │
fetchConfiguredUpstreamSSE()     ← FastAPI 中継
         │
公開 SSE へ変換                   ← 秘匿情報の除去
         │
    ┌────┴────┐
    │         │
 complete   error / abort
    │         │
 confirm()  cancel()             ← 課金確定 or 取消
```

代表的なエラーパス:

| 段階 | 条件 | 結果 |
|---|---|---|
| BFF | 未認証またはゲスト | 401 |
| BFF | クレジット不足 | 402 |
| BFF | 本文6文字未満、1500文字超、設問タイトル不正、文字数上限不正 | 400 |
| BFF | 企業、業界、職種の所有権または必須条件不一致 | 400 / 403 / 404 |
| FastAPI | 注入リスク high | SSE `error` |
| FastAPI | SSE 同時実行上限 | 429 |
| FastAPI | LLM 呼び出し失敗 | 503 または SSE `error` |
| FastAPI | リライト全試行失敗 | 422 |

---

## 第2章 リクエスト処理層

### 2.1 フロントエンド

ユーザーが添削結果を待つ間の体験を最適化する層。LLM のレスポンスは不定長・不定速であるため、受信済みテキストと画面表示テキストを分離して管理し、句読点で速度を調整しながら段階表示する。`prefers-reduced-motion` が有効な環境ではアニメーションを抑える。

コンポーネント構成:

```text
ESEditorPageClient
├── ブロックエディタ（H2 セクション単位）
├── 自動保存（2秒 debounce）
├── Undo / Redo
└── デスクトップ: 55 / 45 分割パネル
    └── ReviewPanel
        ├── セットアップ UI（テンプレート / 企業 / 業界 / 職種 / モデル）
        ├── 入力検証とエラーハイライト
        └── StreamingReviewResponse
            ├── 進捗バー
            ├── リライトテキスト（段階表示）
            ├── 改善案反映 CTA
            ├── 改善ポイント / 主な変更点
            ├── 提出前チェック
            └── 出典リンク
```

フロントから BFF へ送る主な項目:

- `content`: 添削対象本文。6文字以上1500文字以内。
- `sectionTitle`: 設問タイトル。1文字以上300文字以内。
- `sectionCharLimit`: 文字数上限。1から1500。
- `companyId`: 文書に紐づく企業、またはユーザーが選んだ所有企業。
- `templateType`: ユーザー指定の設問タイプ。未指定なら推定を使う。
- `llmModel`: 標準プラン以上で選べるモデル。無料プランは BFF 側で低コストモデルに固定される。
- `industryOverride`, `roleName`, `internName`: 業界・職種・インターン名の明示指定。

UI の状態遷移:

1. `idle`: 添削未実行。
2. `loading`: BFF 接続中。
3. `streaming`: `rewrite_delta` を受け取り、改善案本文を逐次表示中。
4. `sources_ready`: `source_added` により出典カードを追加中。
5. `explanation_ready`: `explanation_complete` により改善解説を表示可能。
6. `complete`: `complete.result` を受け取り、適用操作が可能。
7. `error`: 公開用に整形されたエラーを表示。

改善案を適用すると、差分表示で変更内容を確認した後、エディタ本文が改善案で置き換わる。Undo で元の本文に戻せる。

---

### 2.2 BFF: 認証・課金・中継

ブラウザと FastAPI の間に立ち、3つの問題を解決する層。(1) 認証と所有権の検証、(2) 成功時のみのクレジット消費（Reserve-Confirm-Cancel パターン）、(3) 内部情報の秘匿（内部 SSE から公開 SSE への変換）。FastAPI に課金権限を持たせないことで、生成ロジックと課金ロジックの責務を分離する。

BFF の責務:

- `requireOwnerMutationRequest()` による変更リクエスト防御。
- `getRequestIdentity()` によるログインユーザーまたはゲスト識別。
- `guardDailyTokenLimit()` による日次トークン上限確認。
- `enforceRateLimitLayers()` によるレート制限。
- `getOwnedDocument()` による文書所有権確認。
- 本文、設問、文字数上限の入力検証。
- `calculateESReviewCost()` によるクレジット費用計算。
- `esReviewStreamPolicy.reserve()` によるクレジット予約。
- FastAPI principal の付与と内部 SSE の中継。
- 成功時の `confirm()`、失敗・途中終了・不正 complete 時の `cancel()`。

`prepareReviewStreamContext()` はフロントからの簡潔なリクエストを、FastAPI が生成に使える文脈へ変換する。主な変換:

- `template_request`: テンプレート種別、設問、回答、企業名、業界、文字数範囲、推定テンプレート情報をまとめる。
- `retrieval_query`: テンプレート、業界、企業名、職種、設問、回答、プロフィール、ガクチカ、他設問を最大850字で連結する。
- `profile_context`: 大学、学部、卒業年、志望業界、志望職種。
- `gakuchika_context`: 直近最大4件のガクチカ要約。
- `document_context`: 同じ ES 文書の他設問。最大4件、各260字まで。
- `user_provided_corporate_urls`: ブロックされていない企業情報ソース URL。

課金確定条件: `complete.result.billing_outcome.success === true`、`billable === true`、かつ空でない `rewrites` がある場合だけ BFF が予約済みクレジットを確定する。それ以外はすべてクレジットを取り消す。

---

### 2.3 FastAPI 入口と入力防御

BFF を迂回した不正リクエストの最終防壁。内部 principal の検証、プロンプトインジェクション対策、ユーザー単位の同時実行制限を担う。

FastAPI の入口 `POST /api/es/review/stream` の責務:

- `require_career_principal("ai-stream")` で BFF からの内部 principal を確認する。
- payload と principal の `company_id` が両方ある場合、一致しなければ拒否する。
- `SseLease.acquire()` でユーザー単位の SSE 同時実行リースを取る。上限超過時は `429` と `Retry-After` を返す。

入力防御では、本文、設問、検索文、テンプレート、職種、プロフィール、ガクチカ、他設問まで注入リスク検査の対象にする。high risk は `error` イベントで終了し、medium risk は無害化して続行する。

---

### 2.4 SSE プロトコル

FastAPI の内部 SSE とブラウザ向け公開 SSE は異なるスキーマを持つ。内部 SSE にはデバッグ情報やコスト情報が含まれるが、公開 SSE では許可リスト方式で必要な情報だけを渡す。これにより、内部実装の変更が公開 API に波及することを防ぎ、セキュリティ上の情報漏洩リスクも排除する。

内部イベントから公開イベントへの変換:

| FastAPI 内部イベント | 公開イベント | 用途 |
|---|---|---|
| `progress` | `progress` | 公開用文言に正規化した進捗 |
| `chunk` / `string_chunk(path="streaming_rewrite")` | `rewrite_delta` | 改善案本文の逐次表示 |
| `field_complete(path="streaming_rewrite")` | `rewrite_complete` | 改善案本文の確定 |
| `field_complete(path="improvement_explanation")` | `explanation_complete` | 改善解説 JSON v2 文字列の確定 |
| `array_item_complete(path="keyword_sources.*")` | `source_added` | 公開可能な出典カード追加 |
| `complete` | `complete` | 公開用に整形した最終結果 |
| `error` | `error` | 公開用エラー |

公開 SSE には出さない情報: 上流 LLM の request id、token usage、retry trace、provider debug、source ranking 診断、`internal_telemetry`。公開 SSE の型定義の正本は `src/shared/contracts/es-review-sse.ts` の `PUBLIC_SSE_EVENT_TYPES` である。

---

## 第3章 生成パイプライン

### 3.1 テンプレート分類と企業 RAG

ES には「志望動機」「ガクチカ」「自己PR」など設問タイプがあり、各タイプで必要な企業情報の深さ、検証基準、再試行戦略が異なる。テンプレート分類は、設問に合った生成方針を一括で選択する仕組みである。

対応テンプレート:

| テンプレート | 用途 | 企業接地方針 |
|---|---|---|
| `basic` | 汎用設問 | 設問文に応じて可変 |
| `company_motivation` | 志望動機 | `deep` / required |
| `role_course_reason` | 職種・コース理由 | `deep` / required |
| `intern_reason` | インターン志望理由 | `standard` / required |
| `intern_goals` | インターンで得たいこと | `standard` / required |
| `post_join_goals` | 入社後にやりたいこと | `standard` / required |
| `gakuchika` | 学生時代に力を入れたこと | `none` |
| `self_pr` | 自己PR | `light` / assistive |
| `work_values` | 大切にしている価値観 | `light` / assistive |

テンプレート解決の流れ:

```text
設問文 ────→ classify_es_question()
              │
ユーザー指定 ─→ build_effective_template_context()
              │
              ▼
      ┌── 実効テンプレート ──┐
      │  主テンプレート      │
      │  副テンプレート      │  ← 複合設問（例: 志望動機 + 入社後目標）
      │  接地レベル         │     では主と副を統合
      │  企業 RAG 要否      │
      │  統合評価軸         │
      └────────────────────┘
```

複合設問では `merge_template_specs()` が主テンプレートを中心に、必須要素、避ける点、評価軸、企業接地レベル、再試行方針を統合する。企業接地レベルは構成要素中の最も強いレベルを採用する。

**企業 RAG**

企業 RAG は、企業が選択され、かつテンプレート上必要または設問文に企業接地の補助シグナルがある場合に実行する。企業未選択でも `basic`、`gakuchika`、`self_pr`、`work_values` は添削できる。

```text
企業選択あり? ──No──→ 企業接地なしで添削（許可テンプレートのみ）
    │
   Yes
    │
テンプレートが RAG 必要? ──No──→ スキップ
    │
   Yes
    │
RAG 取得 → 出典検証 → 不適切除外 → 根拠カード生成（最大5件）
    │
evidence_coverage_level 判定:
  strong / partial / weak / none / not_applicable
    │
weak 以下 → 接地レベル下方修正（企業固有の断定を避ける）
```

テンプレート別の source family 優先順位:

| テンプレート | 1st | 2nd | 3rd |
|---|---|---|---|
| `company_motivation` | `business_future` | `people_values` | `hiring_role` |
| `role_course_reason` | `hiring_role` | `people_values` | `business_future` |
| `intern_reason` / `intern_goals` | `hiring_role` | `people_values` | `business_future` |
| `post_join_goals` | `business_future` | `people_values` | `hiring_role` |
| `self_pr` / `gakuchika` / `work_values` | `people_values`（補助のみ） | -- | -- |

接地レベルの下方修正:

- `basic` で `char_max <= 220` の場合は `light` に制限する。
- RAG が利用できない場合は1段階下げる。
- `evidence_coverage_level` が `weak` の場合は1段階下げ、`none` の場合は `light` に強制する。

---

### 3.2 4段パイプライン

生成パイプラインを4段に分けることで、「準備 → 生成と検証の繰り返し → 救済 → 組み立て」という責務が明確になる。特に Stage 2 の再試行ループと Stage 3 のリカバリを分離することで、通常合格・安全代替・最良候補採用・生成失敗の4経路を整理している。

```text
Stage 1: prepare_review_context
  テンプレート・RAG・事実・文字数プロファイルを確定
         │
Stage 2: execute_rewrite_loop（最大3回）
  ┌──────┴──────┐
  │  試行 n     │
  │  ┌─────────┐│
  │  │プロンプト││
  │  │構築     ││
  │  │  ↓     ││
  │  │LLM 生成 ││
  │  │  ↓     ││
  │  │後処理   ││
  │  │  ↓     ││
  │  │機械検証  ││
  │  │  ↓     ││
  │  │LLM 検証 │├── 合格 ──→ 最終案（"rewrite"）
  │  └────┬────┘│
  │    不合格   │
  │    ↓       │
  │  失敗記録 + │
  │  focus mode │
  │  選択      │
  └──────┬──────┘
         │ 全試行不合格
Stage 3: execute_recovery_pipeline
  最良候補が採用可能? ── Yes → degraded_best_effort
       │                       （文体変換・必要なら圧縮）
      No
       │
      422 エラー
         │
Stage 4: assemble_review_response
  リライト SSE 送出 → 出典送出 → 品質スコア計算 → ReviewResponse
```

**Stage 1: prepare_review_context** — 生成前に以下を確定する。

- 有効テンプレートと複合テンプレート。分類信頼度、補助テンプレート候補。
- 推奨接地レベルと実効接地レベル。
- ユーザー文脈から選んだ使える事実（元回答、ガクチカ、他設問、プロフィール）。
- 企業根拠カードと `evidence_coverage_level`。
- 参考ES由来の抽象品質プロファイル（`QualityBlueprint` の入力源）。
- 文字数制御プロファイル。

**Stage 2: execute_rewrite_loop** — `QUALITY_FIRST_PROFILE.max_retry` が3であるため、初回と最大2回の再試行で構成される。各試行で:

1. 失敗コードから focus mode と composite mode を解決する（第4章で詳述）。
2. `build_template_rewrite_prompt()` でプロンプトを構築する。
3. LLM に本文生成を依頼する。
4. `post_process_rewrite()` で後処理する（企業参照処理、文体修正）。
5. `_validate_rewrite_combined()` で機械検証と LLM 品質検証を行う（第4章で詳述）。
6. 合格なら最終案にする。不合格なら失敗コードと再試行履歴を記録する。

`safe_rewrite` は、最終寄りの試行で文字数失敗と非文字数失敗が混在し、危険な失敗コードがない場合に使われる安全寄りのプロンプトによる再生成である。

**Stage 3: execute_recovery_pipeline** — 通常ループで合格案がない場合に実行される。`degraded_block_codes`（`empty`、`fragment`、`hallucination` 等）に該当しない最良候補があれば、文体を整え、必要なら決定的圧縮を試して `degraded_best_effort` として採用する。採用不可なら `422` を返す。

**Stage 4: assemble_review_response** — 最終リライトと出典を SSE で送出し、AI 臭・ハルシネーション・具体マーカー数などの品質スコアを計算し、`ReviewResponse` を返す。改善解説は FastAPI ルーター側で最終リライト後に別途生成する。

採用経路のまとめ:

| 経路 | 意味 |
|---|---|
| `rewrite` | 通常リライトで合格 |
| `safe_rewrite` | 安全寄りの代替プロンプトで合格 |
| `degraded_best_effort` | 強制拒否対象ではない最良候補を採用 |
| 422 | すべて採用不可 |

---

### 3.3 プロンプト構造

プロンプトは `PromptPlan` にセクション単位で命令を積み、`PromptRenderer` が固定順で描画する。この構造により、テンプレート固有の指示、品質設計、事実境界、再試行ヒントをモジュラーに合成できる。再試行時には `retry` セクションだけが追加され、前回の失敗に応じた修正指示が注入される。

描画順（system prompt）:

```text
persona                         ← テンプレート種別ごとのロール定義
<role_task>                     ← 「高品質な提出ESへ再構成する」
<output_contract>               ← 改善案本文のみ。だ・である調。1段落。
<constraints priority="absolute">
<quality_blueprint priority="primary"> ← 最重要: 品質設計（下記参照）
<template_special_cases>        ← テンプレート固有ルール
<fact_boundary>                 ← 作ってよいもの / いけないもの
<length_style>                  ← 受理帯、生成目標帯、短答構成ガイド
<constraints priority="core">
<constraints priority="target">
<length>
<style>
<template>
<company>                       ← 企業根拠カード + 使い方ルール
<context>                       ← ユーザー事実 + fact_weaving_rules
<retry>                         ← 再試行時のみ: focus mode と修正指示
```

user prompt は条件（設問、企業、業界、インターン名、職種、文字数）と元回答を渡す。

**QualityBlueprint**

`QualityBlueprint` は、設問タイプに合う高品質な提出ESへ改善するための圧縮品質設計である。参考ES本文や特徴的な言い回しを渡すのではなく、抽象化済みの品質ヒント、骨子、文の流れ、論理構成パターンを短くまとめて渡す。

入力源:

- `reference_quality_profile`: 品質ヒント、骨子、文の流れ（`es_reference_guidance.py` の手動キュレーション済み指針）。
- `logic_patterns`: 論理構成パターン（アプローチ、構成設計、根拠提示、接続パターン）。
- `TemplateDef.rewrite_policy`: 必須要素、禁止パターン。
- 設問タイプ別 `PRIMARY_GOALS`（例: 志望動機なら「自分が実現したいことと、その企業でなければならない理由を一本の線でつなぐ」）。

上限: `flow` 最大5件、`must_improve` 最大3件、`avoid` 最大3件。

**参考ESの扱い**

参考ES本文は実行時には読まない。`es_reference_guidance.py` に手動キュレーション済みの抽象指針を置き、品質ヒントと骨子が空なら `None` を返す。コンテンツ漏洩防止:

- 参考ESの本文、語句、特徴的な言い回し、個別エピソードは使わない。
- 参考ES由来の事実をユーザー事実や企業根拠として扱わない。
- 論理構成パターンは構成の参考に留め、例示表現や語句をそのまま使わない。

---

### 3.4 文字数制御

LLM は指定した文字数を正確に守るのが苦手である。そのため、受理帯（最終提出として許容する範囲）と生成目標帯（LLM に狙わせる範囲）を分けて管理し、検証と再試行で受理帯に収める。

- 受理帯: `char_min` / `char_max`。BFF は `sectionCharLimit` から `char_max` を作り、`char_min` は `char_max - 10` として導出する。
- 生成目標帯: `char_max - gap` から `char_max` まで。gap はモデルと字数帯で可変。

短答条件:

- 短答: `char_max <= 220`。
- `dense_short_answer`: 150から220字で3から4文を促す。
- `three_sentence_close_on_short_band`: 160から220字で3文締めを促す。
- 中字数ガイド: `280 <= char_max <= 520` かつ playbook がある場合。

`under_min_recovery` では LLM の短く出る傾向を補正するため、生成時の内部目標だけ `char_max` を超えることがある。最終提出文は検証と圧縮で受理帯に戻す。

| Provider | short 帯 | medium 帯 | long 帯 |
|---|---|---|---|
| GPT-5 Mini | +20字 | +15字 | +10字 |
| Claude / GPT-5 / Gemini / generic | +15字 | +12字 | +8字 |

---

## 第4章 品質管理

### 4.1 検証: 機械検証 + LLM 品質検証

検証を2段にすることで、まず高速な機械検証で明らかな不備を弾き、合格候補だけを低速で高コストな LLM 品質検証にかける。LLM 品質検証は `fail_open_on_error=False` で動作するため、検証自体が利用不可能な場合は拒否となり、品質不明な出力をユーザーに返さない。

```text
リライト候補
     │
     ▼
┌────────────────────┐
│ 機械検証（10項目）  │── 不合格 → 失敗コード記録 → 再試行
│ 高速・決定的        │
└────────┬───────────┘
         │ 合格
         ▼
┌────────────────────┐
│ LLM 品質検証（9軸） │── 不合格 → 失敗コード記録 → 再試行
│ 低速・LLM 判定      │
└────────┬───────────┘
         │ 合格
         ▼
    最終案として採用
```

機械検証の主な項目:

| チェック | 内容 |
|---|---|
| 空文字 | テキストが空でないか |
| 断片文 | 末尾が句点で終わる完結した文か |
| 箇条書き・リスト形式 | 本文形式になっているか |
| 文字数下限未満 | `char_min` 以上か |
| 文字数上限超過 | `char_max` 以下か |
| 文体混在 | `だ・である調` で統一されているか |
| 企業未選択時の企業名 | 企業未選択なのに企業名・敬称が含まれていないか |
| 企業接地不足 | テンプレートが要求する企業接地があるか |
| 事実保全違反 | 元回答の具体的事実を改変・削除していないか |
| 未完の末尾 | 文が途中で切れていないか |

LLM 品質検証の9軸:

1. `conclusion_first` — 1文目が設問への答えになっているか。
2. `company_grounding` — 企業言及の適切性。
3. `style_unity` — `だ・である調` で統一されているか。
4. `structure_clarity` — 論理の流れが追えるか、冗長性がないか。
5. `quality_blueprint_alignment` — QualityBlueprint に沿っているか。
6. `fact_preservation` — 元回答の具体的事実が保持されているか。
7. `expression_diversity` — 同じ表現の繰り返しがないか。
8. `theme_focus` — 設問タイプの主題に合致しているか（`gakuchika` では skip）。
9. `answer_completeness` — 結論まで自然に言い切れているか。

各軸は `required`（不合格で fail）、`warn`（警告だが合格扱い）、`skip`（チェックなし）のモードで制御できる。`QUALITY_FIRST_PROFILE` では LLM 品質検証に落ちた候補を最終試行でも緩く通さない。

---

### 4.2 事実保全と安全装置

LLM は文章の品質を上げようとして、数値や受賞歴を盛ったり、企業の施策名を捏造したりすることがある。`FactBoundary` は「品質改善は許可するが、ハードファクトの捏造は止める」境界線である。

作ってはいけない対象:

- 数値。役職。受賞。成果。固有名詞。未経験の出来事。企業根拠カード外の固有施策・制度・事業内容。

改善してよい対象:

- 文の順序。論理接続。行動の目的、対象、工夫。経験の意味づけ。強みや学びの抽象化。貢献像。キャリア接続。

Fact Guard の照合元は、元回答、選抜済みユーザー事実、当該試行でプロンプトへ渡した企業根拠カード要約、会社名、職種名、インターン名。検出されるハルシネーション:

| コード | 内容 | 対応 |
|---|---|---|
| `number_mutation` | 数値の改変 | 強制拒否 |
| `role_title_mutation` | 役職名の追加・改変 | 強制拒否 |
| `metric_fabrication` | 元にない数値の追加 | 強制拒否 |
| `experience_fabrication` | 未経験の出来事の創作 | 強制拒否 |
| `award_fabrication` | 受賞の創作 | 強制拒否 |
| `proper_noun_fabrication` | 固有名詞の創作 | 強制拒否 |

**AI 臭検出**

LLM が生成しがちな定型表現を検出し、就活ESとして不自然にならないよう制御する。5カテゴリで採点する:

| カテゴリ | パターン例 |
|---|---|
| `abstract_buzzword` | 多角的、包括的、俯瞰的 |
| `value_creation` | 価値を創出、新たな価値を生み出す |
| `growth_cliche` | ~を通じて成長した、~の重要性を学んだ |
| `relation_abstract` | 関係者を巻き込み、多様な人々 |
| `empty_emphasis` | まさに、確かに、大いに |

元の文に数値・具体名詞・動作動詞による具体性がある場合は、修飾詞の抽象性は許容される。

---

### 4.3 再試行とリカバリ

再試行は「同じプロンプトを再実行する」のではなく、前回の失敗コードから focus mode を選び、差分修正指示をプロンプトの `<retry>` セクションに追加する学習型の再試行である。複数の失敗が重なった場合は composite mode で段階的な修復指示をまとめる。

代表的な focus mode:

| focus mode | 条件 | 修正指示 |
|---|---|---|
| `length_focus_min` | 文字数下限不足 | 不足量に応じた展開戦略（下記） |
| `length_focus_max` | 文字数上限超過 | 重複説明、一般論、補助論点を削る |
| `style_focus` | 文体不統一 | `だ・である調` に統一 |
| `grounding_focus` | 企業接地不足 | 企業根拠カードから1軸に絞って明確化 |
| `opening_focus` | 冒頭が設問復唱や前置き | 冒頭で結論ファーストに書き直す |
| `positive_reframe_focus` | 自己否定が強い | 否定的表現を前向きに再構成 |
| `structure_focus` | 箇条書き、断片、構造不明瞭 | 本文形式に書き直す |
| `fact_preservation_focus` | 事実保全違反 | 数値・役職を一切改変しない |

`length_focus_min` は不足量に応じて修復指示を変える:

| 帯 | 条件 | 戦略 |
|---|---|---|
| `large` | 70字以上不足 | 2から3文追加し、根拠経験、学び、企業接点を展開する |
| `medium` | 35から69字 | 1文追加し、既存文脈の具体化か因果を補う |
| `small` | 15から34字 | 補足句を1つ加える |
| `tiny` | 15字未満 | 語尾変更や短い補足句で微調整する |

複合リトライモード（例: `fact_safety_length`、`company_reference_length`、`length_grounding`）は、複数種類の失敗がある場合に1回だけ選択される。前回候補に AI 臭い定型句があれば、他の失敗理由による再試行時に改善ヒントとして同乗させる。

---

### 4.4 改善解説

改善解説は「なぜこう直したか」をユーザーに伝える副産物である。メインの添削とは独立して低コストモデル（`gpt-5.4-mini`）で生成するため、改善解説の生成に失敗しても添削自体は成功として続行する。

仕様: timeout 8秒、最大出力 900 tokens、出力形式 JSON v2 文字列。

```json
{
  "version": 2,
  "improvement_points": [
    {"axis": "評価軸名", "point": "改善ポイント", "detail": "説明"}
  ],
  "main_changes": [
    {"before_summary": "変更前", "after_summary": "変更後", "change": "変更内容"}
  ]
}
```

上限: `improvement_points` 最大3件、`main_changes` 最大2件。`axis` 32字、`point` 48字、`detail` 110字、`before_summary` / `after_summary` 24字、`change` 90字。

生成できた場合は FastAPI 内部の `field_complete(path="improvement_explanation")` が BFF で `explanation_complete` に変換され、最終 `complete.result.improvement_explanation` にも同じ JSON v2 文字列が入る。

---

## 第5章 運用リファレンス

### 5.1 課金とエラーハンドリング

クレジットは「使ったら引く」のではなく「予約して、成功したら確定、失敗したら取消」の Reserve-Confirm-Cancel パターンで管理する。これにより、LLM 呼び出しが途中で失敗しても、ユーザーのクレジットが消費されることがない。

クレジット消費:

| モデル区分 | 500字まで | 1000字まで | 1500字まで | 1501字以上 |
|---|---|---|---|---|
| Claude / GPT / Gemini | 6 | 10 | 14 | 20 |
| クレジット消費を抑えて添削 (`low-cost`) | 3 | 6 | 9 | 12 |
| Free プラン | 6 | 10 | 14 | 20 |

Free プランは実行モデルを低コストモデルへ固定するが、クレジット消費は通常モデル帯として扱う。

課金の流れ:

1. BFF がリクエスト検証後に `calculateESReviewCost()` で費用を計算する。
2. `esReviewStreamPolicy.precheck()` がログインユーザーか確認する。
3. `esReviewStreamPolicy.reserve()` が `reserveCredits()` で事前予約する（クレジット即時減算）。
4. FastAPI から正常な `complete` が返る。
5. BFF が `complete.result.billing_outcome.success === true`、`billable === true`、空でない `rewrites` を確認する。
6. 条件を満たす場合だけ `confirmReservation()` を呼ぶ（減算確定）。
7. 上流エラー、不正 `complete`、途中終了、クライアント中断では `cancelReservation()` を呼ぶ（クレジット返還）。

認証と所有権:

- ログインユーザーは、文書所有権と企業所有権を満たせば利用できる。
- ゲストは添削不可。BFF は billing policy の precheck で `userId` がないリクエストを 401 で拒否する。
- BFF は `getOwnedDocument()` で文書 owner を確認し、FastAPI には signed principal と tenant key を付与する。

主な公開エラー: 未認証 / 所有権エラー / 日次トークン上限 / レート制限 / クレジット不足 / 入力不備 / 注入リスク high / SSE 同時実行上限 / LLM 呼び出し失敗 / リライト全試行失敗 / 上流一時障害。BFF の HTTP エラーは `createApiErrorResponse()` で構造化され、FastAPI の SSE `error` は公開用の `message`、`code`、`action`、`retryable` に正規化される。

---

### 5.2 観測と診断

バックエンド内部では `review_meta` に詳細な診断情報を入れる。BFF は UI に必要な最小 subset だけ公開する。

内部で保持する代表値: テンプレート分類・分類信頼度 / 推奨接地レベル・実効接地レベル / 企業根拠カード数・検証済み出典数・除外出典数 / 参考ESプロファイル利用有無 / 再試行回数・修復ディスパッチ・composite mode / `safe_rewrite` 発火有無 / `final_acceptance_source` / 検証ステータス・失敗コード / LLM 品質検証の失敗軸と警告軸 / token usage / AI 臭 tier / ハルシネーション tier / 具体マーカー数・文数・冒頭結論文字数。

公開 `review_meta`（`PublicReviewMeta`）: `llm_provider` / `llm_model` / `llm_model_alias` / `review_variant` / `grounding_mode` / `primary_role` / `reference_es_count` / `evidence_coverage_level` / `weak_evidence_notice` / `rewrite_validation_status` / `rewrite_validation_user_hint` / `final_acceptance_source` / `ai_smell_tier` / `concrete_marker_count` / `opening_conclusion_chars` / `rewrite_sentence_count`。

---

### 5.3 テストと確認方法

テスト層の全体像:

| 層 | コマンド | 内容 |
|---|---|---|
| Backend unit | `python -m pytest backend/tests/es_review -q` | プロンプト構造、検証、再試行、RAG 方針 |
| Architecture | `python -m pytest backend/tests/architecture/ -q` | サービス層とルーター層の境界 |
| Live provider | `make backend-test-live-es-review` | 実 API を使う品質ゲート |
| Frontend unit | `npm run test:unit` | フック、公開 SSE、UI 周辺 |
| E2E | `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=es-review` | ブラウザ統合テスト |

主要テストファイル:

- `backend/tests/es_review/test_es_review_prompt_structure.py`: 全テンプレートのプロンプト構造。
- `backend/tests/es_review/test_es_review_final_quality_cases.py`: リライト品質、文字数、文体の回帰。
- `backend/tests/es_review/test_es_review_quality_rubric.py`: コンテキスト品質。
- `backend/tests/es_review/test_es_review_template_repairs.py`: 正規化、圧縮、`degraded` 処理。
- `backend/tests/architecture/test_es_review_ca2_boundaries.py`: サービス層とルーター層の依存方向。
- `backend/tests/es_review/test_es_review_explanation_prompt.py`: 改善解説 JSON v2。
- `backend/tests/es_review/test_es_review_template_context.py`: 複合テンプレート解決。
- `backend/tests/es_review/test_ai_smell.py`: AI 臭検出とスコアリング。
- `backend/tests/es_review/test_llm_validation.py`: LLM 品質検証。
- `backend/tests/es_review/test_validation_profile.py`: 検証プロファイル。

ドキュメント差分:

```bash
git diff -- docs/features/ES_REVIEW_DEEP_DIVE.md
```

古い記述の検出:

```bash
rg -n "8[[:space:]]*軸|complete[.]data|top-level[[:space:]]+billing_outcome|ゲスト利用[[:space:]]*の[[:space:]]*拒否|section[_]char[_]limit|document[[:alpha:]]*Context" docs/features/ES_REVIEW_DEEP_DIVE.md
```

プロンプト仕様や AI 出力品質に関わる説明を変える場合の確認:

```bash
pytest backend/tests/es_review/test_es_review_prompt_structure.py \
  backend/tests/es_review/test_es_reference_guidance_contract.py \
  backend/tests/es_review/test_reference_es_quality.py \
  backend/tests/es_review/test_reference_es_compound.py \
  backend/tests/prompts/test_logic_patterns_enumeration.py \
  backend/tests/es_review/test_llm_validation.py \
  backend/tests/es_review/test_validation_profile.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_es_review_explanation_prompt.py \
  backend/tests/prompts/test_es_draft_generation_prompt.py
```

SSE 契約に触れた場合:

```bash
pytest backend/tests/es_review/test_sse_event_contract.py
npm run test:unit -- src/shared/contracts/es-review-sse.test.ts src/bff/es-review/handle-review-stream.test.ts src/bff/es-review/public-review-stream.test.ts src/features/es-review/hooks/transport.test.ts
```

---

### 5.4 正本ファイル一覧

| カテゴリ | パス | 責務 |
|---|---|---|
| Page | `src/app/(product)/es/[id]/page.tsx` | SSR と文書取得 |
| Editor | `src/components/es/ESEditorPageClient.tsx` | 分割パネル、ブロック編集、自動保存 |
| Review UI | `src/components/es/ReviewPanel.tsx` | セットアップ、入力検証、添削開始 |
| Result UI | `src/components/es/StreamingReviewResponse.tsx` | ストリーミング結果、出典、チェック |
| Hook | `src/hooks/useESReview.ts` | SSE 消費、状態管理、中断制御 |
| Transport | `src/features/es-review/hooks/transport.ts` | 公開 SSE パース |
| 公開 SSE 型 | `src/shared/contracts/es-review-sse.ts` | `PUBLIC_SSE_EVENT_TYPES` |
| FastAPI 送信型 | `src/shared/contracts/fastapi/es-review.ts` | `esReviewStreamRequestSchema` |
| BFF Route | `src/app/api/documents/[id]/review/stream/route.ts` | API 入口 |
| BFF Logic | `src/bff/es-review/handle-review-stream.ts` | 課金予約、上流接続、SSE 中継 |
| BFF Context | `src/bff/es-review/review-stream-context.ts` | 入力検証、所有権確認、payload 構築 |
| 公開 SSE 変換 | `src/bff/es-review/public-review-stream.ts` | 内部 → 公開 SSE 変換 |
| Billing | `src/bff/billing/es-review-stream-policy.ts` | Reserve / Confirm / Cancel |
| Router | `backend/app/routers/es_review.py` | FastAPI エンドポイント、内部 SSE |
| Orchestrator | `backend/app/services/es_review/orchestrator.py` | 4段パイプライン |
| Request | `backend/app/services/es_review/request.py` | 入力防御 |
| Template Context | `backend/app/services/es_review/template_context.py` | テンプレート統合 |
| Grounding | `backend/app/services/es_review/grounding.py` | 企業接地、ユーザー事実 |
| Source Policy | `backend/app/services/es_review/source_policy.py` | 出典信頼性 |
| Validation | `backend/app/services/es_review/validation.py` | 機械検証 |
| LLM Validation | `backend/app/services/es_review/llm_validation.py` | LLM 品質検証 |
| Validation Profile | `backend/app/services/es_review/validation_profile.py` | 検証プロファイル |
| Retry | `backend/app/services/es_review/retry.py` | 再試行制御 |
| Fact Guard | `backend/app/services/es_review/fact_guard.py` | 事実保全 |
| AI Smell | `backend/app/services/es_review/ai_smell.py` | AI 臭検出 |
| Explanation | `backend/app/services/es_review/explanation.py` | 改善解説 |
| Prompt Builder | `backend/app/prompts/es_templates/_prompt_builder.py` | プロンプト構築 |
| QualityBlueprint | `backend/app/prompts/es_templates/_quality_blueprint.py` | 品質設計 |
| Focus Modes | `backend/app/prompts/es_templates/_focus_modes.py` | 再試行 focus mode |
| Reference Guidance | `backend/app/prompts/es_reference_guidance.py` | 手動キュレーション済み指針 |
| Reference ES | `backend/app/prompts/reference_es.py` | 参考ESプロファイル |
| Logic Patterns | `backend/app/prompts/logic_patterns.py` | 論理構成パターン |

関連ドキュメント:

| ファイル | 役割 |
|---|---|
| `docs/features/ES_REVIEW.md` | 機能全体の単一正本 |
| `docs/prompts/es-review/README.md` | プロンプトスナップショットディレクトリの扱い |
| `docs/prompts/es-review/rewrite-prompt-structure.md` | リライトプロンプト監査用 |
| `docs/prompts/es-review/validation-architecture.md` | 検証軸監査用 |
| `docs/prompts/es-review/repair-strategies.md` | 再試行修復監査用 |
| `docs/testing/ES_REVIEW_QUALITY.md` | テスト品質基準 |
| `src/app/(marketing)/es-tensaku-ai/page.tsx` | 集客 LP |
