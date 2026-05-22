# ES添削機能

本ドキュメントは、就活Pass の ES 添削機能を実装から読み解くための詳細資料である。機能全体の単一正本は `docs/features/ES_REVIEW.md`、実行時の正本はコードである。`docs/prompts/es-review/` は人間レビュー用のスナップショットであり、実行時には読み込まれない。

この1ファイルで、UI、Next.js API、ブラウザ向け中継層（BFF）、FastAPI、プロンプト、検索拡張生成（RAG）、品質検証、再試行、課金、公開イベント、確認方法まで把握できることを目的にする。

機能の基本仕様:

- 対応モデル: Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro Preview / GPT-5.4-mini (low-cost)。
- 通信方式: サーバー送信イベント（SSE）によるリアルタイムストリーミング。
- 認証: ログインユーザー専用。ゲストは添削不可。
- 課金: 成功時のみクレジット消費。事前予約して、成功完了時だけ確定する。
- 出力: 改善案、企業情報などの出典、改善解説、提出前チェック材料を返す。

---

## 1. 最初に押さえること

ES 添削は、ユーザーが ES エディタ上で選んだ設問回答を、大規模言語モデル（LLM）で提出品質の文章へ書き直すストリーミング機能である。生成結果は自動保存されず、ユーザーが改善案を適用した後に通常の文書保存経路で保存される。

最重要ルール:

- ログインユーザー専用。ゲスト識別は解決できるが、`esReviewStreamPolicy.precheck()` でゲストは拒否される。
- クレジットは成功時のみ消費する。BFF が事前予約し、妥当な `complete` だけ確定する。
- FastAPI は課金状態を変更しない。課金の正本は BFF 側にある。
- 公開サーバー送信イベント（SSE）には、上流 request id、token usage、retry trace、debug、`internal_telemetry` を出さない。
- 参考ES本文は実行時に読み込まない。手動キュレーション済みの抽象指針だけを `QualityBlueprint` に圧縮して使う。
- 品質改善は許可するが、数値、役職、成果、受賞、固有名詞、未経験の出来事、企業根拠カード外の固有施策は作らない。

---

## 2. 正本ファイル

3層構成:

```text
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                       │
│  ESEditorPageClient → ReviewPanel → useESReview hook    │
│  SSE 消費 → playback 状態遷移 → StreamingReviewResponse │
└────────────────────────────┬────────────────────────────┘
                             │ POST /api/documents/{id}/review/stream
┌────────────────────────────▼────────────────────────────┐
│  BFF (Next.js API Route)                                │
│  認証検証 → クレジット予約 → payload 構築 → SSE 中継     │
│  handle-review-stream.ts + review-stream-context.ts     │
└────────────────────────────┬────────────────────────────┘
                             │ POST /api/es/review/stream
┌────────────────────────────▼────────────────────────────┐
│  Backend (FastAPI)                                      │
│  入力防御 → RAG 取得 → 4段パイプライン → SSE 生成        │
│  es_review.py → services/es_review/ → prompts/          │
└─────────────────────────────────────────────────────────┘
```

| 領域 | 正本 |
|---|---|
| 機能全体 | `docs/features/ES_REVIEW.md` |
| エディタ画面 | `src/components/es/ESEditorPageClient.tsx` |
| 添削パネル | `src/components/es/ReviewPanel.tsx` |
| フック | `src/hooks/useESReview.ts` |
| SSE パース | `src/features/es-review/hooks/transport.ts` |
| 公開 SSE 型 | `src/shared/contracts/es-review-sse.ts` |
| FastAPI 送信型 | `src/shared/contracts/fastapi/es-review.ts` |
| Next.js 入口 | `src/app/api/documents/[id]/review/stream/route.ts` |
| BFF 実行制御 | `src/bff/es-review/handle-review-stream.ts` |
| BFF 入力構築 | `src/bff/es-review/review-stream-context.ts` |
| 公開 SSE 変換 | `src/bff/es-review/public-review-stream.ts` |
| 課金予約 | `src/bff/billing/es-review-stream-policy.ts` |
| FastAPI 入口 | `backend/app/routers/es_review.py` |
| 生成パイプライン | `backend/app/services/es_review/orchestrator.py` |
| 入力防御 | `backend/app/services/es_review/request.py` |
| テンプレート統合 | `backend/app/services/es_review/template_context.py` |
| 企業接地 | `backend/app/services/es_review/grounding.py`, `source_policy.py` |
| 機械検証 | `backend/app/services/es_review/validation.py` |
| LLM 品質検証 | `backend/app/services/es_review/llm_validation.py` |
| 検証プロファイル | `backend/app/services/es_review/validation_profile.py` |
| 再試行 | `backend/app/services/es_review/retry.py`, `backend/app/prompts/es_templates/_focus_modes.py` |
| 事実保全 | `backend/app/services/es_review/fact_guard.py` |
| AI 臭検出 | `backend/app/services/es_review/ai_smell.py` |
| プロンプト構築 | `backend/app/prompts/es_templates/_prompt_builder.py` |
| `QualityBlueprint` | `backend/app/prompts/es_templates/_quality_blueprint.py` |
| 参考ES指針 | `backend/app/prompts/es_reference_guidance.py`, `backend/app/prompts/reference_es.py` |
| 改善解説 | `backend/app/services/es_review/explanation.py` |

役割別の主要ファイル:

| 層 | パス | 責務 |
|---|---|---|
| Page | `src/app/(product)/es/[id]/page.tsx` | SSR と文書取得 |
| Editor | `src/components/es/ESEditorPageClient.tsx` | 分割パネル、ブロック編集、自動保存、改善案反映 |
| Review UI | `src/components/es/ReviewPanel.tsx` | セットアップ、入力検証、添削開始 |
| Result UI | `src/components/es/StreamingReviewResponse.tsx` | ストリーミング結果、改善解説、提出前チェック、出典表示 |
| Hook | `src/hooks/useESReview.ts` | SSE 消費、状態管理、中断制御 |
| Transport | `src/features/es-review/hooks/transport.ts` | 公開 SSE のパース |
| BFF Route | `src/app/api/documents/[id]/review/stream/route.ts` | API 入口 |
| BFF Logic | `src/bff/es-review/handle-review-stream.ts` | 課金予約、上流接続、公開 SSE 中継 |
| BFF Context | `src/bff/es-review/review-stream-context.ts` | 入力検証、所有権確認、payload 構築 |
| Billing | `src/bff/billing/es-review-stream-policy.ts` | Reserve / Confirm / Cancel |
| Router | `backend/app/routers/es_review.py` | FastAPI エンドポイント、内部 SSE 生成 |
| Orchestrator | `backend/app/services/es_review/orchestrator.py` | 4段パイプライン |
| Templates | `backend/app/prompts/es_templates/` | 9テンプレートのプロンプト生成 |
| Reference Source | `docs/reference/es-review/` | offline 抽出入力と設問タイプ別ヒント |

---

## 3. 全体フロー

1. ユーザーが ES エディタで設問ブロックを選ぶ。
2. `ReviewPanel` でテンプレート種別、企業、業界、職種、モデルなどを設定する。
3. `useESReview.requestSectionReview()` が `POST /api/documents/{id}/review/stream` を呼ぶ。
4. Next.js API は薄い入口として `handleReviewStream()` に委譲する。
5. BFF が変更リクエスト防御、認証、所有権、日次トークン上限、レート制限、入力検証、クレジット予約を行う。
6. BFF がプロフィール、ガクチカ、他設問、企業情報を集め、FastAPI 用 payload を作る。
7. BFF が内部 principal 付きで FastAPI の `/api/es/review/stream` へ中継する。
8. FastAPI が入力防御、企業 RAG、テンプレート分類、参考ES指針、ユーザー事実、企業根拠カードを準備する。
9. `orchestrator.py` が `prepare_review_context`、`execute_rewrite_loop`、`execute_recovery_pipeline`、`assemble_review_response` の4段で処理する。
10. FastAPI が内部 SSE を返し、BFF が公開 SSE に変換する。
11. BFF は成功条件を満たす `complete` だけクレジット予約を確定し、それ以外は取り消す。
12. UI は改善案、出典、改善解説、提出前チェック材料を表示する。
13. ユーザーが改善案を適用するとエディタ本文が変わり、既存の自動保存経路で保存される。

ユーザー操作からレスポンスまでの見え方:

1. 設問選択: ユーザーが ES エディタで設問ブロックを選択する。
2. セットアップ: `ReviewPanel` でテンプレート種別、企業、業界、職種、モデルを設定する。
3. 添削開始: 「この設問をAI添削」ボタンから `useESReview.requestSectionReview()` を呼ぶ。
4. BFF 処理: Next.js API が認証確認、クレジット予約、FastAPI 中継を行う。
5. バックエンド処理: 入力防御、RAG 取得、リライト生成、SSE 送出を行う。
6. UI 表示: 進捗バー、リライト文字送出、出典カード、改善解説、完了状態を表示する。

BFF の処理順:

```text
requireOwnerMutationRequest()
  ↓
prepareReviewStreamContext()
  ↓
esReviewStreamPolicy.precheck()
  ↓
esReviewStreamPolicy.reserve()
  ↓
fetchConfiguredUpstreamSSE()
  ↓
公開 SSE へ変換
  ↓
complete 受信 → confirm()
error / abort / invalid complete → cancel()
```

代表的なエラーパス:

| 段階 | 条件 | 結果 |
|---|---|---|
| BFF | 未認証またはゲスト | 401 |
| BFF | クレジット不足 | 402 |
| BFF | 本文6文字未満、1500文字超、設問タイトル不正、文字数上限不正 | 400 |
| BFF | 企業、業界、職種の所有権または必須条件不一致 | 400 / 403 / 404 |
| FastAPI | BFF を迂回した本文空または設問タイトル空 | SSE `error` |
| FastAPI | 注入リスク high | SSE `error` |
| FastAPI | SSE 同時実行上限 | 429 |
| FastAPI | LLM 呼び出し失敗 | 503 または SSE `error` |
| FastAPI | リライト全試行失敗 | 422 |

---

## 4. フロントエンド

主要な表示と状態管理は `ESEditorPageClient`、`ReviewPanel`、`useESReview` に分かれる。

- `ESEditorPageClient`: ES 文書のブロック編集、選択中セクション、改善案の適用、自動保存を担う。
- `ReviewPanel`: 添削対象、テンプレート、企業、業界、職種、モデルを確定し、添削開始条件を整える。
- `useESReview`: リクエスト送信、SSE 消費、進捗、エラー、受信済み本文、出典、改善解説、最終結果を保持する。
- `transport.ts`: 公開 SSE を型安全にパースし、不正なイベントや内部情報を UI に入れない。
- `playback.ts`: 受信済みテキストを UI 表示用に段階再生する。句読点で表示速度を調整し、`prefers-reduced-motion` を尊重する。

フロントから BFF へ送る主な項目:

- `content`: 添削対象本文。6文字以上1500文字以内。
- `sectionId`: 設問ブロック識別子。
- `sectionTitle`: 設問タイトル。1文字以上300文字以内。
- `sectionCharLimit`: 文字数上限。1から1500。
- `companyId`: 文書に紐づく企業、またはユーザーが選んだ所有企業。
- `templateType`: ユーザー指定の設問タイプ。未指定なら推定を使う。
- `internName`: インターン名。
- `roleName`: 職種・コース名。
- `industryOverride`: 業界の明示指定。
- `llmModel`: 標準プラン以上で選べるモデル。無料プランは BFF 側で低コストモデルに固定される。

UI の基本状態:

1. `idle`: 添削未実行。
2. `loading`: BFF 接続中。
3. `streaming`: `rewrite_delta` を受け取り、改善案本文を逐次表示中。
4. `sources_ready`: `source_added` により出典カードを追加中。
5. `explanation_ready`: `explanation_complete` により改善解説を表示可能。
6. `complete`: `complete.result` を受け取り、適用操作が可能。
7. `error`: 公開用に整形されたエラーを表示。

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
            ├── リライトテキスト
            ├── 改善案反映 CTA
            ├── 改善ポイント / 主な変更点
            ├── 提出前チェック
            └── 出典リンク
```

ストリーミング再生:

- `useESReview` が公開 SSE を消費し、受信済み状態と表示済み状態を分けて管理する。
- 改善案本文は句読点で表示速度を調整しながら段階表示する。
- `prefers-reduced-motion` が有効な環境ではアニメーションを抑える。
- バックエンドは最終リライトを小さなチャンクで送出し、フロントは `rewrite_delta` と `rewrite_complete` を統合して最終表示にする。

改善案の反映:

1. ユーザーが改善案の反映操作を行う。
2. 差分表示で変更内容を確認する。
3. 確認後、選択セクションの本文を改善案で置き換える。
4. 文書に変更状態が立ち、既存の自動保存経路で保存される。
5. Undo 操作で元の本文へ戻せる。

---

## 5. BFF 境界

`src/app/api/documents/[id]/review/stream/route.ts` は `POST` を受け、実処理を `handleReviewStream()` に渡す。

BFF の責務:

- `requireOwnerMutationRequest()` による変更リクエスト防御。
- `getRequestIdentity()` によるログインユーザーまたはゲスト識別。
- `guardDailyTokenLimit()` による日次トークン上限確認。
- `enforceRateLimitLayers()` によるレート制限。
- `getOwnedDocument()` による文書所有権確認。
- `companyId` がリクエストで上書きされる場合の企業所有権確認。
- 本文、設問、文字数上限の入力検証。
- 企業未選択時の許可テンプレート制限。
- 業界・職種必須テンプレートの事前確認。
- プロフィール、ガクチカ、他設問を集めた FastAPI payload 構築。
- `calculateESReviewCost()` によるクレジット費用計算。
- `esReviewStreamPolicy.reserve()` によるクレジット予約。
- FastAPI principal の付与。
- 内部 SSE から公開 SSE への変換。
- 成功時の `confirm()`、失敗・途中終了・不正 complete 時の `cancel()`。

課金確定条件は `handle-review-stream.ts` に集約されている。`complete.result.billing_outcome.success === true`、`billable === true`、かつ空でない `rewrites` がある場合だけ、BFF が予約済みクレジットを確定する。`complete.result` がない旧形式や、空の `rewrites` は不正な完了として扱われ、クレジットは消費されない。

FastAPI へ渡す payload は `src/shared/contracts/fastapi/es-review.ts` の `esReviewStreamRequestSchema` で固定される。`user_id`、`credit_cost`、予約IDなどの BFF 内部値は payload に入れない。

---

## 6. BFF が作るコンテキスト

`prepareReviewStreamContext()` は、フロントからの簡潔なリクエストを、FastAPI が生成に使える文脈へ変換する。

主な変換:

- `template_request`: テンプレート種別、設問、回答、企業名、業界、文字数範囲、職種、インターン名、推定テンプレート情報をまとめる。
- `role_context`: 現状はユーザー入力職種を `primary_role` として使う。未指定なら `source: "none"`。
- `retrieval_query`: テンプレート、業界、企業名、職種、設問、回答、プロフィール、ガクチカ、他設問を最大850字で連結する。
- `profile_context`: 大学、学部、卒業年、志望業界、志望職種。
- `gakuchika_context`: 直近最大4件のガクチカ要約。未完成も許容する。
- `document_context`: 同じ ES 文書の他設問。最大4件、各260字まで。
- `user_provided_corporate_urls`: 企業情報ソースのうち、ブロックされておらず ES 添削に使ってよい URL。

企業未選択でも `basic`、`gakuchika`、`self_pr`、`work_values` は添削できる。企業 RAG が強く必要なテンプレートは、企業未選択時に BFF 側で拒否する。

---

## 7. FastAPI Stream

FastAPI の入口は `backend/app/routers/es_review.py` の `POST /api/es/review/stream` である。

入口の責務:

- `require_career_principal("ai-stream")` で BFF からの内部 principal を確認する。
- payload と principal の `company_id` が両方ある場合、一致しなければ拒否する。
- `SseLease.acquire()` でユーザー単位の SSE 同時実行リースを取る。
- 上限超過時は `429` と `Retry-After` を返す。
- 企業 RAG が必要な場合だけ tenant key を要求する。
- `_generate_review_progress()` で内部 SSE を生成する。

入力防御では、本文、設問、検索文、テンプレート、職種、プロフィール、ガクチカ、他設問まで注入リスク検査の対象にする。high risk は `error` イベントで終了し、medium risk は無害化して続行する。

FastAPI 内部イベント:

| 内部イベント | 用途 |
|---|---|
| `progress` | 進捗 |
| `string_chunk` | 改善案本文の逐次送信 |
| `field_complete` | 改善案または改善解説の完了 |
| `array_item_complete` | 出典カードの追加 |
| `complete` | 最終結果 |
| `error` | エラー |

無通信時は keep-alive コメントを送る。内部イベントの `internal_telemetry` は BFF のコスト集計専用で、公開 SSE には出さない。

---

## 8. 企業 RAG と出典

企業 RAG は、企業が選択され、かつテンプレート上必要または設問文に企業接地の補助シグナルがある場合に実行する。企業 ID があっても、テンプレートと設問が企業情報を必要としない場合はスキップされる。

RAG 取得と出典処理の流れ:

1. `classify_es_question()` と `build_effective_template_context()` で実効テンプレートを解決する。
2. テンプレートごとの RAG プロファイルを作る。
3. ユーザーが登録した企業 URL を優先候補に入れる。
4. `has_company_rag()` で企業 RAG の有無を確認する。
5. `get_enhanced_context_for_review_with_sources()` で本文と出典を取得する。
6. RAG 本文が短すぎる、出典が不足するなどの場合は企業 RAG を無効化する。
7. `source_policy.py` で同一企業ドメインや出典信頼性を確認し、不適切な出典を除外する。
8. `grounding.py` で企業根拠カードを最大5件に絞る。
9. `evidence_coverage_level` を `strong`、`partial`、`weak`、`none`、`not_applicable` に分類する。
10. 根拠が弱い場合は接地レベルを下げ、企業固有の断定を避ける。

公開 `source_added` は、ユーザーに見せてよい URL、種別、ラベル、タイトル、ドメイン、抜粋だけを含む。内部 `source_id`、順位付け診断、検索詳細は公開しない。

テンプレート別の source family 優先順位:

| テンプレート | 1st | 2nd | 3rd |
|---|---|---|---|
| `company_motivation` | `business_future` | `people_values` | `hiring_role` |
| `role_course_reason` | `hiring_role` | `people_values` | `business_future` |
| `intern_reason` / `intern_goals` | `hiring_role` | `people_values` | `business_future` |
| `post_join_goals` | `business_future` | `people_values` | `hiring_role` |
| `self_pr` / `gakuchika` / `work_values` | `people_values`（補助のみ） | -- | -- |

ソース不足時は企業固有の施策名や制度名を広げず、`company_general` または `weak_evidence_notice` で安全側に倒す。企業 RAG がない場合でも、企業未選択で許可されるテンプレートはユーザー事実と元回答だけで添削できる。

---

## 9. テンプレート分類

ES 添削は、設問文、ユーザー指定、分類器の結果からテンプレートを解決する。

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

複合設問では `build_effective_template_context()` が主テンプレート、副テンプレート、複合パターン、接地レベル、企業 RAG 要否、統合評価軸を解決する。`merge_template_specs()` は主テンプレートを中心に、必須要素、避ける点、評価軸、企業接地レベル、再試行方針を統合する。

分類信頼度が低い場合や、分類器の推定とユーザー指定が異なる場合は、分類ヒントを再試行ヒントに加えて、設問の主眼が混線しないようにする。

テンプレート定義の主な構造:

- `rewrite_policy`: 生成プロンプト用の目的、必須要素、禁止パターン、短字数構成、playbook、企業利用方針。
- `validation_policy`: 自動検証用の評価項目、評価軸、接地レベル、企業 RAG 要否。
- `retry_policy`: failure code ごとの差分リトライ指示。

複合テンプレートでは、主テンプレートの評価軸を基本に、副テンプレートの上位軸を最大7軸まで統合する。企業接地レベルは構成要素中の最も強いレベルを採用し、いずれかの構成要素が企業 RAG を要求すれば実効テンプレートも企業 RAG 要求になる。

テンプレート別の結び動詞ガイダンス:

| テンプレート | 結びの傾向 |
|---|---|
| `gakuchika` | 「培った」「身につけた」「磨いた」を推奨し、「学んだ」「実感した」に寄せすぎない |
| `self_pr` | 強みを志望先業務へ接続し、「活かしたい」「活用したい」で締める |
| `company_motivation` | 元回答の経験と企業根拠カードの方向性を接続し、貢献像で締める |

接地レベルの下方修正:

- `basic` で `char_max <= 220` の場合は `light` に制限する。
- RAG が利用できない場合は1段階下げる。
- `evidence_coverage_level` が `weak` の場合は1段階下げる。
- `evidence_coverage_level` が `none` の場合は `light` に強制する。

---

## 10. 生成パイプライン

`review_section_with_template()` は、FastAPI ルーターから独立して ES 添削のユースケースを実行できる関数である。内部は4段に整理されている。

### Stage 1: `prepare_review_context`

生成前に以下を確定する。

- 有効テンプレートと複合テンプレート。
- 分類信頼度、補助テンプレート候補、分類理由。
- 推奨接地レベルと実効接地レベル。
- 職種名、インターン名、企業名、業界。
- ユーザー文脈から選んだ使える事実。
- 企業 RAG 出典の検証結果。
- 企業根拠カード。
- `evidence_coverage_level` と `weak_evidence_notice`。
- 参考ES由来の抽象品質プロファイル。
- 論理構成パターンの利用有無。
- 文字数制御プロファイル。
- 検証と再試行に必要なメタ情報。

### Stage 2: `execute_rewrite_loop`

最大3回の生成試行を行う。`QUALITY_FIRST_PROFILE.max_retry` が3であるため、初回と最大2回の再試行で構成される。

各試行の処理:

1. 失敗コードから focus mode と composite mode を解決する。
2. 文字数制御計画と再試行ヒントを作る。
3. `build_template_rewrite_prompt()` または条件付きで `build_template_fallback_rewrite_prompt()` を使う。
4. LLM に本文生成を依頼する。
5. `post_process_rewrite()` で後処理する。
6. `_validate_rewrite_combined()` で機械検証と LLM 品質検証を行う。
7. 合格なら最終案にする。
8. 不合格なら失敗コード、理由、最良不合格候補、再試行履歴を記録する。

`safe_rewrite` は、最終寄りの試行で文字数失敗と非文字数失敗が混在し、危険な失敗コードがない場合に使われる。品質を諦める処理ではなく、安全寄りのプロンプトで再生成する処理である。

### Stage 3: `execute_recovery_pipeline`

通常ループで合格案がない場合に実行される。

- `degraded_block_codes` に該当しない最良候補があれば、文体を整え、必要なら決定的圧縮を試して `degraded_best_effort` として採用する。
- 採用不可なら `422` を返す。

`degraded_best_effort` は新しい LLM 呼び出しではない。既存の最良不合格候補を、安全基準を満たす範囲で採用する。

### Stage 4: `assemble_review_response`

最終結果を組み立てる。

- 最終リライトを SSE で逐次送出する。
- 出典リンクを SSE で逐次送出する。
- 文字数、文数、冒頭結論文字数、具体マーカー数を計算する。
- AI 臭とハルシネーションの観測値を計算する。
- deep 接地の場合は、企業根拠カードとの接続を追加評価する。
- `review_meta` を作る。
- `ReviewResponse` を返す。

改善解説は FastAPI ルーター側で最終リライト後に別途生成し、`complete.result.improvement_explanation` に加える。

---

## 11. プロンプト構造

`build_template_rewrite_prompt()` は `PromptPlan` に `PromptInstruction` を追加し、`PromptRenderer.section_order` に従って system prompt と user prompt を描画する。

描画順:

```text
persona
<role_task>
<output_contract>
<constraints priority="absolute">
<quality_blueprint priority="primary">
<template_special_cases>
<fact_boundary>
<length_style>
<constraints priority="core">
<constraints priority="target">
<length>
<style>
<template>
<company>
<context>
<retry>
```

現行の通常リライトでは、旧来の `core`、`target`、`length`、`style`、`template` セクションは空または最小化されることが多い。中心になるのは `QualityBlueprint`、`template_special_cases`、`FactBoundary`、`length_style`、`company`、`context`、`retry` である。

出力契約:

- 改善案本文のみを出力する。
- 説明、前置き、後書き、箇条書き、引用符、JSON、コードブロックを禁止する。
- `だ・である調` で統一する。
- 改行・空行を入れず、1段落にする。

user prompt は条件と元回答を渡す。条件には設問、企業、業界、インターン名、職種・コース名、文字数が含まれる。

---

## 12. QualityBlueprint

`QualityBlueprint` は、設問タイプに合う高品質な提出ESへ改善するための圧縮品質設計である。参考ES本文や特徴的な言い回しを渡すのではなく、抽象化済みの品質ヒント、骨子、文の流れ、論理構成、テンプレート必須要素を短くまとめて渡す。

入力源:

- `reference_quality_profile["quality_hints"]`
- `reference_quality_profile["skeleton"]`
- `reference_quality_profile["sentence_flow"]`
- `logic_patterns`
- `TemplateDef.rewrite_policy.required_elements`
- `TemplateDef.rewrite_policy.anti_patterns`
- 設問タイプ別 `PRIMARY_GOALS`
- 複合設問の補助観点

上限:

- `flow`: 最大5件。
- `must_improve`: 最大3件。
- `avoid`: 最大3件。
- `compound_note`: 最大1から2文。

`rewrite_policy.playbook` は `QualityBlueprint` の直接入力ではない。中字数ガイドなど、別の描画処理で参照される。

`enumeration_phrasing` が文字数帯に合う場合は `must_improve` の先頭に入る。短縮描画でも残るため、長文の `reference_quality_block` を戻さずに列挙・論理構成の型を伝えられる。

---

## 13. FactBoundary と事実保全

`FactBoundary` は、品質改善を止める制約ではなく、ハードファクト捏造を止める境界である。

作ってはいけない対象:

- 数値。
- 役職。
- 受賞。
- 成果。
- 固有名詞。
- 未経験の出来事。
- 企業根拠カード外の固有施策、制度、事業内容。

改善してよい対象:

- 文の順序。
- 論理接続。
- 行動の目的、対象、工夫。
- 経験の意味づけ。
- 強みや学びの抽象化。
- 貢献像。
- キャリア接続。

Fact Guard の照合元は、元回答、選抜済みユーザー事実、当該試行でプロンプトへ渡した企業根拠カード要約、会社名、職種名、インターン名である。数値改変、役職名改変、成果や経験の捏造、受賞の捏造、固有名詞の追加は強制拒否の対象になる。

---

## 14. 参考ESの扱い

参考ES本文は実行時には読まない。`backend/app/prompts/es_reference_guidance.py` に手動キュレーション済みの抽象指針を置き、`backend/app/prompts/reference_es.py` が profile と block を組み立てる。

現行実装では `load_reference_examples()` は空配列を返す。`build_reference_quality_profile()` は、品質ヒントと骨子が空なら `None` を返す。

複合設問では primary-first で合成する。主タイプの骨子を優先し、副タイプは上限付きの補助観点として追加する。骨子を機械的に混ぜない。

通常リライトでは、長い `reference_quality_block` を `<context>` に戻さない。`QualityBlueprint` に圧縮して使う。下書き生成では `reference_quality_block` を context に入れる経路が残る。

コンテンツ漏洩防止:

- 参考ESの本文、語句、特徴的な言い回し、個別エピソードは使わない。
- 参考ES由来の事実をユーザー事実や企業根拠として扱わない。
- 論理構成パターンは構成の参考に留め、例示表現や語句をそのまま使わない。

---

## 15. 文字数制御

文字数制御は、受理帯と生成目標帯を分ける。

- 受理帯: 最終提出として許容する `char_min` / `char_max`。
- 生成目標帯: LLM に狙わせる内部目標。

BFF は `sectionCharLimit` から `char_max` を作り、`char_min` は `char_max - 10` として導出する。文字数上限がない場合は `char_min` もない。

`under_min_recovery` では、生成目標だけ `char_max` を超えることがある。最終提出文は検証と圧縮で受理帯へ戻す。

短答条件:

- 短答: `char_max <= 220`。
- `dense_short_answer`: 150から220字で3から4文を促す。
- `three_sentence_close_on_short_band`: 160から220字で3文締めを促す。
- 中字数ガイド: `char_min` / `char_max` があり、`280 <= char_max <= 520` かつ playbook がある場合。

再試行では不足量に応じて `length_focus_min` の指示が変わる。大きく不足している場合は文を追加し、小さな不足なら語尾や短い補足句で調整する。

---

## 16. 検証

ES 添削は `QUALITY_FIRST_PROFILE` を使う。

重要な設定:

- `fact_preservation="warn"`。
- 数値、役職、成果、経験、受賞、固有名詞の捏造は Fact Guard で強制拒否する。
- `degraded_block_codes` には `empty`、`fragment`、`negative_self_eval`、`company_reference_in_companyless`、`hallucination`、`fact_preservation`、`llm_quality` を含む。
- `best_effort_enabled=True`。
- `max_retry=3`。

`_validate_rewrite_combined()` は、まず機械検証を行い、合格候補に対して LLM 品質検証を行う。

機械検証の代表例:

- 空文字。
- 断片文。
- 箇条書き・リスト形式。
- 文字数下限未満。
- 文字数上限超過。
- `だ・である調` 以外の混在。
- 企業未選択時の企業名・敬称。
- 企業接地不足。
- 事実保全違反。
- 未完の末尾。

LLM 品質検証は9軸:

1. `conclusion_first`
2. `company_grounding`
3. `style_unity`
4. `structure_clarity`
5. `quality_blueprint_alignment`
6. `fact_preservation`
7. `expression_diversity`
8. `theme_focus`
9. `answer_completeness`

`theme_focus` は `gakuchika` では skip される。ES 添削の統合検証では `fail_open_on_error=False` で呼ぶため、品質検証が使えない場合は `validation_unavailable` を `llm_quality` として拒否する。

`quality_first` では、LLM 品質検証に落ちた候補を最終試行でも緩く通さない。再試行または安全な最良候補採用へ進む。

---

## 17. 再試行とリカバリ

再試行は失敗コードから focus mode を選び、次のプロンプトに差分ヒントとして加える。

代表的な focus mode:

- `length_focus_min`: 文字数下限不足。
- `length_focus_max`: 文字数上限超過。
- `style_focus`: 文体不統一。
- `grounding_focus`: 企業接地不足。
- `opening_focus`: 冒頭が設問復唱や前置きに寄っている。
- `positive_reframe_focus`: 自己否定が強い。
- `structure_focus`: 箇条書き、断片、構造不明瞭。
- `fact_preservation_focus`: 事実保全違反。

複数失敗がある場合は composite mode を1回だけ選び、段階的な修復指示をまとめて出す。前回候補に AI 臭い定型句があれば、他の失敗理由による再試行時に改善ヒントとして同乗させる。

採用経路:

- `rewrite`: 通常リライトで合格。
- `safe_rewrite`: 安全寄りの代替プロンプトで合格。
- `degraded_best_effort`: 強制拒否対象ではない最良候補を採用。
- 採用不可: `422`。

危険入力 high risk はこの `422` とは別で、SSE `error` として終了する。

`length_focus_min` では、不足量に応じて修復指示を変える。

| Delta Band | 条件 | 修復戦略 |
|---|---|---|
| `large` | shortfall >= 70字 | 2から3文追加し、根拠経験、学び、企業接点を展開する |
| `medium` | 35から69字 | 1文追加し、既存文脈の具体化か因果を補う |
| `small` | 15から34字 | 補足句を1つ加える |
| `tiny` | 15字未満 | 語尾変更や短い補足句で微調整する |

`under_min_recovery` では、LLM の短く出る傾向を補正するため、生成時の内部目標だけ `char_max` を超えることがある。最終提出文は検証と圧縮で受理帯に戻す。

| Provider | short 帯 | medium 帯 | long 帯 |
|---|---|---|---|
| GPT-5 Mini | +20字 | +15字 | +10字 |
| Claude / GPT-5 / Gemini / generic | +15字 | +12字 | +8字 |

---

## 18. 改善解説

改善解説は `backend/app/services/es_review/explanation.py` が独立に生成する。

- モデル: `gpt-5.4-mini`。
- timeout: 8秒。
- 最大出力: 900 tokens。
- 出力: JSON v2 文字列。

形式:

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

上限:

- `improvement_points`: 最大3件。
- `main_changes`: 最大2件。
- `axis`: 32字。
- `point`: 48字。
- `detail`: 110字。
- `before_summary`: 24字。
- `after_summary`: 24字。
- `change`: 90字。

改善解説の生成に失敗しても、添削自体は成功として続行する。例外時はログに残し、`improvement_explanation` は省略される。生成できた場合は、FastAPI 内部の `field_complete(path="improvement_explanation")` が BFF で `explanation_complete` に変換され、最終 `complete.result.improvement_explanation` にも同じ JSON v2 文字列が入る。

---

## 19. 公開 SSE

BFF は内部 SSE を公開許可リストで整形する。公開イベントは `src/shared/contracts/es-review-sse.ts` の `PUBLIC_SSE_EVENT_TYPES` が正本である。

公開イベント:

| 公開イベント | 用途 |
|---|---|
| `progress` | 公開用文言に正規化した進捗 |
| `rewrite_delta` | 改善案本文の逐次表示 |
| `rewrite_complete` | 改善案本文の確定 |
| `source_added` | 公開可能な出典カード追加 |
| `explanation_complete` | 改善解説 JSON v2 文字列の確定 |
| `complete` | 最終結果 |
| `error` | 公開用エラー |

内部イベントとの対応:

| FastAPI 内部イベント | BFF 公開イベント |
|---|---|
| `progress` | `progress` |
| `chunk` / `string_chunk(path="streaming_rewrite")` | `rewrite_delta` |
| `field_complete(path="streaming_rewrite")` | `rewrite_complete` |
| `field_complete(path="improvement_explanation")` | `explanation_complete` |
| `array_item_complete(path="keyword_sources.*")` | `source_added` |
| `complete` | 公開用に整形した `complete` |
| `error` | 公開用に整形した `error` |

公開 `complete.result`:

- `rewrites`
- `template_review.template_type`
- `template_review.variants`。現行公開値は空配列。
- `template_review.keyword_sources`
- `improvement_explanation`
- `review_meta`
- `billing_outcome`

公開 `review_meta` は `PublicReviewMeta` に限定する。現行の公開対象は次の通り。

- `llm_provider`
- `llm_model`
- `llm_model_alias`
- `review_variant`
- `grounding_mode`
- `primary_role`
- `reference_es_count`
- `evidence_coverage_level`
- `weak_evidence_notice`
- `rewrite_validation_status`
- `rewrite_validation_user_hint`
- `final_acceptance_source`
- `ai_smell_tier`
- `concrete_marker_count`
- `opening_conclusion_chars`
- `rewrite_sentence_count`

公開しない情報:

- 上流 LLM の request id。
- token usage。
- retry trace。
- provider debug。
- raw failure details。
- source ranking 診断。
- `internal_telemetry`。

---

## 20. 保存と課金

添削結果はストリーム完了時点では保存されない。`useESReview` が最終結果を state に保持し、ユーザーが「適用」操作を行うと ES エディタの文書本文に反映される。その後、既存の文書更新 API と自動保存により保存される。

クレジット消費:

| モデル区分 | 500字まで | 1000字まで | 1500字まで | 1501字以上 |
|---|---|---|---|---|
| Claude / GPT / Gemini | 6 | 10 | 14 | 20 |
| クレジット消費を抑えて添削 (`low-cost`) | 3 | 6 | 9 | 12 |
| Free プラン | 6 | 10 | 14 | 20 |

Free プランは実行モデルを低コストモデルへ固定するが、クレジット消費は通常モデル帯として扱う。Standard / Pro は標準モデルを選択できる。

課金の流れ:

1. BFF がリクエスト検証後に `calculateESReviewCost()` で費用を計算する。
2. `esReviewStreamPolicy.precheck()` がログインユーザーか確認する。
3. `esReviewStreamPolicy.reserve()` が `reserveCredits()` で事前予約する。
4. FastAPI から正常な `complete` が返る。
5. BFF が `complete.result.billing_outcome.success === true`、`billable === true`、空でない `rewrites` を確認する。
6. 条件を満たす場合だけ `confirmReservation()` を呼ぶ。
7. 上流エラー、不正 `complete`、途中終了、クライアント中断では `cancelReservation()` を呼ぶ。

`billing_outcome` は FastAPI が `complete.result` 内に入れるが、クレジットを確定する権限は BFF にある。

認証と所有権:

- ログインユーザーは、文書所有権と企業所有権を満たせば利用できる。
- ゲストは添削不可。BFF は identity と owner context を解決した後、billing policy の precheck で `userId` がないリクエストを 401 で拒否する。
- ブラウザからの変更系 API は、共通の origin / CSRF 防御を通る。
- BFF は `getOwnedDocument()` で文書 owner を確認する。
- リクエストで指定された企業が文書の企業と異なる場合も、同一 user / guest owner か確認する。
- FastAPI には browser-visible guest token を渡さず、BFF が signed principal と tenant key を付与する。
- FastAPI 側でも request company と principal company の不一致を拒否する。

---

## 21. エラーと失敗時の扱い

ES 添削の失敗は、ユーザーに見せる公開エラーと、内部診断で使う failure code を分ける。

主な公開エラー:

- 未認証、またはゲスト利用。
- 所有権エラー。
- 日次トークン上限。
- レート制限。
- クレジット不足。
- 課金確認不可。
- 本文、設問、文字数上限の入力不備。
- 企業、業界、職種の不足。
- 注入リスク high。
- SSE 同時実行上限。
- LLM 呼び出し失敗。
- リライト全試行失敗。
- FastAPI または上流の一時障害。

BFF の通常 HTTP エラーは `createApiErrorResponse()` で構造化され、`userMessage` と `action` を持つ。FastAPI の内部 SSE `error` は BFF で公開用の `message`、`code`、`action`、`retryable` に正規化される。

内部 failure code は、再試行方針、`review_meta`、ログ、テストで使う。公開 SSE では retry trace や詳細 debug を出さず、ユーザー向けの説明と復旧アクションを返す。

---

## 22. 観測と品質管理

バックエンド内部では `review_meta` に詳細な診断情報を入れる。BFF は UI に必要な最小 subset だけ公開する。

内部で保持する代表値:

- テンプレート分類、分類信頼度、補助候補。
- 推奨接地レベル、実効接地レベル。
- 企業根拠カード数、検証済み出典数、除外出典数。
- 参考ESプロファイル利用有無。
- 論理構成パターン利用有無。
- 再試行回数、修復ディスパッチ、composite mode。
- `safe_rewrite` の発火有無。
- `final_acceptance_source`。
- 検証ステータス、失敗コード、ユーザー向けヒント。
- LLM 品質検証の失敗軸と警告軸。
- 文字数制御プロファイル。
- token usage。
- AI 臭 tier。
- ハルシネーション tier。
- 具体マーカー数、文数、冒頭結論文字数。

AI 出力品質を確認するときは、プロンプト構造、参考ES指針、検証プロファイル、事実保全、再試行、公開 SSE 契約をまとめて見る。プロンプト実装を変えた場合は、実プロバイダーを使う live / E2E も別途検討する。

---

## 23. 確認方法

ドキュメント差分:

```bash
git diff -- docs/features/ES_REVIEW_DEEP_DIVE.md
```

古い記述の検出:

```bash
rg -n "8[[:space:]]*軸|complete[.]data|top-level[[:space:]]+billing_outcome|ゲスト利用[[:space:]]*の[[:space:]]*拒否|section[_]char[_]limit|document[[:alpha:]]*Context" docs/features/ES_REVIEW_DEEP_DIVE.md
```

docs-only 変更でも、プロンプト仕様や AI 出力品質に関わる説明を変える場合は、次を確認対象にする。

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

SSE 契約に触れた場合は次も確認する。

```bash
pytest backend/tests/es_review/test_sse_event_contract.py
npm run test:unit -- src/shared/contracts/es-review-sse.test.ts src/bff/es-review/handle-review-stream.test.ts src/bff/es-review/public-review-stream.test.ts src/features/es-review/hooks/transport.test.ts
```

実プロバイダーを使う live / E2E は、docs-only では必須にしない。実行する場合は別途判断する。

テスト層の全体像:

| 層 | コマンド | 内容 |
|---|---|---|
| Backend unit | `python -m pytest backend/tests/es_review -q` | プロンプト構造、検証、再試行、RAG 方針 |
| Architecture | `python -m pytest backend/tests/architecture/ -q` | サービス層とルーター層の境界 |
| Live provider | `make backend-test-live-es-review` | 実 API を使う品質ゲート。ローカル判断で実行 |
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
- `backend/tests/es_review/test_logic_patterns.py`: 論理構成パターンとコピー安全性。
- `backend/tests/es_review/test_reference_es_corpus_integrity.py`: 参考ESコーパス整合性。

---

## 24. 関連ドキュメント

主要実装ファイルの早見表:

| カテゴリ | ファイル | 目安 |
|---|---|---|
| Backend Core | `backend/app/services/es_review/orchestrator.py` | 4段パイプライン |
| Backend Core | `backend/app/services/es_review/validation.py` | 機械検証 |
| Backend Core | `backend/app/services/es_review/retry.py` | 再試行制御 |
| Backend Core | `backend/app/services/es_review/grounding.py` | 企業接地とユーザー事実 |
| Backend Core | `backend/app/services/es_review/ai_smell.py` | AI 臭検出 |
| Backend Core | `backend/app/services/es_review/explanation.py` | 改善解説 |
| Backend Core | `backend/app/services/es_review/template_context.py` | 複合テンプレート |
| Backend Router | `backend/app/routers/es_review.py` | FastAPI 入口と内部 SSE |
| Prompts | `backend/app/prompts/es_templates/` | テンプレート定義とプロンプト構築 |
| Prompts | `backend/app/prompts/reference_es.py` | 参考ES抽象指針の描画 |
| Prompts | `backend/app/prompts/es_reference_guidance.py` | 手動キュレーション済み指針 |
| Prompts | `backend/app/prompts/logic_patterns.py` | 論理構成パターン |
| Frontend | `src/components/es/ReviewPanel.tsx` | 添削 UI |
| Frontend | `src/components/es/ESEditorPageClient.tsx` | ES エディタ |
| Frontend | `src/components/es/StreamingReviewResponse.tsx` | 結果表示 |
| Frontend | `src/hooks/useESReview.ts` | SSE 消費と状態管理 |
| BFF | `src/bff/es-review/review-stream-context.ts` | payload 構築 |
| BFF | `src/bff/es-review/handle-review-stream.ts` | 課金と中継 |

| ファイル | 役割 |
|---|---|
| `docs/features/ES_REVIEW.md` | 機能全体の単一正本 |
| `docs/features/ES_REVIEW_DEEP_DIVE.md` | 実装を横断して読むための詳細解説 |
| `docs/prompts/es-review/README.md` | プロンプトスナップショットディレクトリの扱い |
| `docs/prompts/es-review/rewrite-prompt-structure.md` | リライトプロンプトの監査用構造 |
| `docs/prompts/es-review/validation-architecture.md` | 検証軸とプロファイルの監査用説明 |
| `docs/prompts/es-review/repair-strategies.md` | 再試行と修復の監査用説明 |
| `docs/prompts/es-review/support/*.md` | リライト、代替生成、参考ES、改善解説、下書き生成の監査用スナップショット |
| `docs/testing/ES_REVIEW_QUALITY.md` | テスト品質基準 |
| `docs/features/GAKUCHIKA_DEEP_DIVE.md` | ガクチカ深掘り |
| `docs/features/MOTIVATION.md` | 志望動機 |
| `src/app/(marketing)/es-tensaku-ai/page.tsx` | 集客 LP |
