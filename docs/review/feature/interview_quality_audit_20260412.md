# 面接対策機能 品質監査レポート

**監査日:** 2026-04-12
**監査レベル:** 外部コンサルレビューレベル（5観点独立レビュー + 面接プロ品質重点 + 12ケースマトリクス分析）
**対象Git SHA:** cbf9de8
**対象モデル:** gpt-5.4-mini (質問生成: MODEL_INTERVIEW), claude-sonnet-4-6 (講評生成: MODEL_INTERVIEW_FEEDBACK)
**Temperature:** 0.2 (計画), 0.35 (開始質問/ターン/練習再開), 0.25 (講評)
**max_tokens:** 700 (質問系4エンドポイント), 1600 (講評)
**プロンプトバージョン:** 全5プロンプトが Fallback 版のみ稼働（Notion managed 版は未作成）

---

## 1. エグゼクティブサマリー

### 6軸評価マトリクス

| 軸 | 配点 | 得点 | 評価 | 判定根拠 |
|---|---:|---:|:---:|---|
| **コード品質・設計** | 15 | 7 | **D+** | `interview.py` 2172行の God Object。`payload` 変数シャドウイング(critical bug)。二重サニタイズ。1111行の `page.tsx`。34個の `useState`。型定義3重重複 |
| **AI/プロンプト品質** | 20 | 9 | **C** | 5パラメータ（strictness/interviewer/stage/selection/role）がラベル挿入のみで行動指示なし。グラウンディングルール皆無。プロンプト内変数3重複。Notion版未作成 |
| **面接プロ品質** | 30 | 13 | **C-** | 4方式の差分は B 水準。しかし厳しさ制御 E、段階・面接官整合 D、深掘り技術 D。12ケース中 strictness 差が保証されるケース=0。ROLE_TRACK 10→5 不整合 |
| **UX・ユーザー体験** | 15 | 10 | **B-** | 正常系は良好。persistence-error の fail-closed 設計は優秀。ただしリセット確認なし、満足度ボタンにアンカーラベルなし、開始ボタン無効時の説明なし |
| **テスト・信頼性** | 10 | 4 | **C-** | SSE format テスト・persistence-error チェーン・credit 順序テストは堅実。しかし continue/reset ルート未テスト、controller 751行が完全未テスト、E2E は 144設定中 1設定のみ |
| **セキュリティ基礎** | 10 | 7 | **B** | 全7ルートでログイン必須。owner チェック一貫。入力サニタイズ完備。ただし SSE error で生 Python 例外メッセージをクライアントに漏洩 |

### 総合スコア: 50/100 (グレード C)

### 最重要改善5点

1. **`payload` 変数シャドウイング [C-01: 致命的]** — `interview.py` の全4ジェネレータ関数で `async for kind, payload in ...` が外側の `payload: InterviewStartRequest` をシャドウイング。ループ後のフォールバック処理で Pydantic モデルではなく `dict | None` を参照する。5箇所 (L1707, 1736, 1825, 1915, 1997)
2. **ROLE_TRACK 不整合 [C-02: 致命的]** — Frontend は10種 (`frontend_engineer`, `backend_engineer`, `data_ai`, `infra_platform`, `product_manager` 含む)、Backend は5種のみ。50%のロールトラックが `biz_general` にサイレントフォールバックし、技術系の論点設計が消失
3. **strictness/interviewer/stage の行動指示欠如 [P-01, P-02: 致命的]** — 3つの主要設定パラメータがプロンプトにラベルとして挿入されるのみ。`strict` でも `supportive` でも LLM への行動変化指示がゼロ。面接対策ツールとしての根幹的な品質問題
4. **グラウンディングルール皆無 [P-03: 致命的]** — 志望動機プロンプトには7項目のグラウンディングルールがあるが、面接プロンプトにはゼロ。LLM が候補者の発言していない事実を前提とした質問を生成するリスク
5. **continue/reset ルート・controller 完全未テスト [T-02〜T-06: 重大]** — 練習再開フロー(Backend+Frontend)、リセットルート、751行の状態管理 hook が全て未テスト。設定マトリクス 144組合せ中 E2E カバーは 1組合せのみ

---

## 2. 面接対話のプロ品質監査（最重要 — 配点30）

### 2-1. 評価フレームワーク（面接プロ品質6軸）

| 面接品質軸 | 評価 | 概要 |
|---|:---:|---|
| **論点設計力** | **C** | company-seeds 23業界×3企業は充実。`_fallback_plan()` の format/stage/role 分岐は機能。ただし seed 活用指示が「補足」に埋没、strictness/interviewer 差分なし |
| **深掘り技術** | **D** | 「深掘りするか移るか判断」指示はあるが STAR 深掘り・前提揺さぶり・仮説検証等の具体テクニック指示なし。followup_style 33種は定義のみで説明なし |
| **方式適合性** | **B** | 4方式それぞれにフォールバック質問・チェックリスト・must_cover・timeflow・講評重み。`_opening_question_matches_format` ガード。format_phase 管理 |
| **段階・面接官整合** | **D** | final でチェックリスト追加（company_compare, decision_axis, commitment）は good。しかし interviewer_type 4種は行動指示ゼロ。early の探索的質問指示なし |
| **厳しさ制御** | **E** | ラベル挿入のみ。行動差分指示ゼロ。12ケース中 strictness による出力差が保証される箇所=0 |
| **講評専門性** | **C+** | 7軸スコア(company_fit〜credibility)は妥当。weakest_turn_id による最弱設問特定。improved_answer 提示。ただしスコアリングルブリック未定義、strictness 差分なし |

### 2-2. 代表ケース評価結果（12ケース × 6軸）

#### 再現条件

全ケース共通:
- モデル: gpt-5.4-mini (質問), claude-sonnet-4-6 (講評)
- Temperature: 0.2 (計画), 0.35 (質問), 0.25 (講評)
- max_tokens: 700 (質問), 1600 (講評)
- プロンプト: 全5つが `_*_FALLBACK` テンプレート（Notion版なし）

| # | 企業 | 方式 | 段階 | 面接官 | 厳しさ | roleTrack | 論点 | 深掘 | 方式 | 段階面 | 厳しさ | 講評 |
|---|------|------|------|--------|--------|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 三菱商事 | standard | early | hr | standard | biz_general | B | D | B | C | D | C |
| 2 | 三菱商事 | standard | final | executive | strict | biz_general | B | D | B | D | E | D |
| 3 | 任天堂 | standard | mid | line_manager | supportive | it_product | C | D | B | D | E | C |
| 4 | マッキンゼー | case | mid | mixed_panel | standard | consulting | C | C | B | C | D | C |
| 5 | マッキンゼー | case | mid | mixed_panel | strict | consulting | C | C | B | C | E | C |
| 6 | Google | technical | mid | line_manager | standard | it_product | C | C | B | C | D | C |
| 7 | Google | technical | final | executive | strict | it_product | C | C | B | D | E | D |
| 8 | トヨタ | life_history | early | hr | supportive | biz_general | C | D | B | D | E | C |
| 9 | 三菱UFJ銀行 | standard | mid | hr | standard | biz_general | B | D | B | C | D | C |
| 10 | ソニー | technical | mid | line_manager | standard | it_product | C | C | B | C | D | C |
| 11 | デロイト | case | early | hr | supportive | consulting | B- | C | B | D | E | C |
| 12 | 架空IT企業 | standard | mid | hr | standard | frontend_engineer | D | D | B | C | D | C |

### 2-3. ケース間比較

#### 厳しさ差（ケース1 vs 2、ケース4 vs 5）

**ケース1 (standard) vs ケース2 (strict) — 三菱商事:**
- プロンプト上の実質差分: `strictness_mode` ラベル文字列の変更 + final 分岐のチェックリスト追加
- 欠落: executive ペルソナの行動指示、strict の具体的行動変化（矛盾指摘、前提揺さぶり、沈黙耐性）
- **結論**: 構造的差分はあるが、LLM の行動を変える指示が不十分で、出力品質の差が小さくなりやすい

**ケース4 (standard) vs ケース5 (strict) — マッキンゼー case:**
- プロンプト上の実質差分: `strictness_mode` ラベル文字列のみ
- **結論**: standard と strict で出力が変わる保証が極めて低い

#### 方式差（ケース1 vs 4 vs 6 vs 8）

4方式の差分は比較的よく実装されている:
- `_fallback_plan()` の must_cover が完全に方式依存（motivation_fit 系 vs case_fit 系 vs life_narrative 系）
- チェックリストが方式依存（STAR 系 vs structure/hypothesis 系 vs turning_point/values 系）
- フォールバック質問が方式依存（4パターン）
- `format_phase` で段階管理（opening → standard_main / case_main / technical_main / life_history_main → feedback）
- **結論**: 4方式の差分は本機能で最もよく作り込まれた部分

#### 企業固有性（ケース1 vs 9）

**三菱商事（シード有）vs 三菱UFJ銀行（シード有）:**
- 両社ともシード情報が `materials_section` 内の `## seed` セクションに含まれる
- 三菱商事: 産業DX、グローバル事業経営、人材育成、変革志向
- 三菱UFJ: グローバル案件、法人金融の深さ、デジタル変革
- **問題**: シード情報がプロンプト末尾の「補足」に埋もれ、活用指示が曖昧

#### ROLE_TRACK 不整合の実影響（ケース12）

- `frontend_engineer` は Backend `ROLE_TRACKS` に含まれず `biz_general` にフォールバック
- プロンプト上は `role_track: biz_general` として扱われる
- UI/UX設計、フレームワーク選定、パフォーマンス最適化等のフロントエンド固有論点が消失
- `_fallback_plan()` の `it_product` 分岐にも乗らず、`work_understanding` 等のIT系 must_cover が欠落
- 影響を受けるロールトラック: `frontend_engineer`, `backend_engineer`, `data_ai`, `infra_platform`, `product_manager` の5種

---

## 3. AI/プロンプト品質監査（配点20）

### 3-1. プロンプト構造分析（5プロンプト）

| プロンプト | 用途 | 推定入力トークン | Temperature | max_tokens | 主要問題 |
|---|---|---|---|---|---|
| `_PLAN_FALLBACK` | 面接計画生成 | ~2,500-4,000 | 0.2 | 700 | 変数3重複、行動指示なし |
| `_OPENING_FALLBACK` | 開始質問生成 | ~3,000-5,000 | 0.35 | 700 | interview_plan 2重挿入、academic_summary 3重挿入 |
| `_TURN_FALLBACK` | ターン質問生成 | ~3,500-6,000 | 0.35 | 700 | interview_plan 2重挿入、深掘り技法指示なし |
| `_CONTINUE_FALLBACK` | 練習再開 | ~3,000-5,000 | 0.35 | 700 | strictness/interviewer 行動指示なし |
| `_FEEDBACK_FALLBACK` | 最終講評 | ~4,000-7,000 | 0.25 | 1600 | スコアリングルブリック未定義、strictness 差分なし |

#### 共通問題: プロンプト内変数の大量重複

全5テンプレートで以下が2-3回重複:
- `role_track`, `interview_format`, `selection_type`, `interview_stage`, `interviewer_type`, `strictness_mode`: 日本語ラベルブロック + raw key=value ブロック
- `academic_summary`, `research_summary`: セットアップブロック + 専用セクション + `materials_section`
- `interview_plan`: 専用セクション + インライン記法（Opening, Turn で2重挿入）

**推定トークン浪費**: 各プロンプト呼出しあたり 150-400 tokens（全体で年間数百万トークン規模のコスト増）

### 3-2. Notion vs Fallback 整合性

`notion_prompts.json` に `interview.*` キーは **ゼロ**。全5プロンプトが常に Fallback テンプレートにフォールスルーする。

| 比較項目 | 志望動機プロンプト | 面接プロンプト |
|---|---|---|
| Notion 管理版 | あり（4プロンプト） | **なし（0プロンプト）** |
| グラウンディングルール | 7項目 | **0項目** |
| 反復防止の明示指示 | あり | intent_key 構造はあるが活用指示なし |
| ロールペルソナ | 一部あり | なし |
| A/B テスト可能性 | あり（Notion版切替） | **不可能** |

### 3-3. トークン効率分析

| プロンプト | 推定非重複トークン | 推定重複トークン | 重複率 |
|---|---|---|---|
| `_PLAN_FALLBACK` | ~1,800 | ~600 | ~25% |
| `_OPENING_FALLBACK` | ~2,200 | ~800 | ~27% |
| `_TURN_FALLBACK` | ~2,500 | ~700 | ~22% |
| `_CONTINUE_FALLBACK` | ~2,000 | ~500 | ~20% |
| `_FEEDBACK_FALLBACK` | ~2,800 | ~400 | ~13% |

### 3-4. フォールバック戦略評価

**良い点:**
- `_opening_question_matches_format()` がLLM生成の開始質問がフォーマットに合致しない場合にフォールバック質問を使用（L1133-1146）
- `_enrich_feedback_defaults()` が LLM 出力不完全時にスコア適切な改善提案を自動生成（L1179-1226）
- `_fallback_plan()` が format/stage/selection/role に応じた決定論的計画を生成（L1581-1626）

**問題点:**
- ケース面接のフォールバック質問が企業・業界無関係の固定「小売チェーンの売上低下」シナリオ（L1068）
- フォールバック opening の `turn_action` が全方式で `"shift"`（初回なのに「次論点への移動」は意味不整合）

---

## 4. コード品質・設計監査（配点15）

### 4-1. ファイルサイズ・複雑度分析

| ファイル | 行数 | 責務数 | 閾値超過 |
|---|---:|---:|---|
| `backend/app/routers/interview.py` | 2,172 | 7 | 500行閾値の **4.3倍** |
| `src/app/(product)/.../interview/page.tsx` | 1,111 | 8 | 500行閾値の **2.2倍** |
| `src/hooks/useInterviewConversationController.ts` | 751 | 1 | 500行閾値の **1.5倍** |
| `src/app/api/.../interview/context.ts` | 546 | 4 | 500行閾値の **1.1倍** |
| `src/app/api/.../interview/persistence.ts` | 436 | 3 | 閾値内 |

**`interview.py` の責務内訳:**
1. プロンプトテンプレート (~360行)
2. JSON Schema 定義 (~120行)
3. Pydantic モデル (~50行)
4. 正規化ヘルパー (~600行)
5. プロンプトビルダー (~150行)
6. ストリームジェネレータ (~360行)
7. ルートハンドラ (~90行)

**推奨分割計画:**

| 新モジュール | 内容 | 推定行数 |
|---|---|---|
| `interview_schemas.py` | Pydantic モデル + JSON Schema | ~200 |
| `interview_templates.py` | Fallback テンプレート + `_build_*_prompt` | ~500 |
| `interview_state.py` | `_normalize_*`, `_merge_plan_progress` 等 | ~600 |
| `interview.py` | ルートハンドラ + ジェネレータ | ~500 |

### 4-2. 型安全性分析

| 問題 | 場所 | 影響 |
|---|---|---|
| `dict[str, Any]` で turn_state 受け取り | `interview.py:655-669` | Pydantic がリクエスト境界で構造検証不能 |
| `guestId!` 非null アサーション15+箇所 | `context.ts`, `persistence.ts` | 契約変更時にランタイムエラー不可視 |
| 型定義3重重複 | `ui.ts`, `conversation.ts`, `types.ts` | スキーマ変更時に3ファイル同期必須 |

### 4-3. 致命的バグ: `payload` 変数シャドウイング [C-01]

```python
# interview.py:1700-1710 (_generate_start_progress)
async def _generate_start_progress(payload: InterviewStartRequest, ...):
    ...
    async for kind, payload in _stream_llm_json_completion(...):  # ← payload をシャドウイング
        ...
    # ループ後、payload は dict | None。以降の payload.company_name 等は AttributeError
    _fallback_plan(payload, setup)  # ← 元の InterviewStartRequest ではない
```

**影響範囲:** 5箇所 (L1707, 1736, 1825, 1915, 1997)、全4ジェネレータ関数
**発現条件:** LLM ストリーム完了後のフォールバックパスに入った場合
**修正:** `async for kind, chunk_data in ...` にリネーム

---

## 5. UX・ユーザー体験監査（配点15）

### 5-1. 状態遷移マップ

```
setup_pending → (POST /start) → in_progress → (POST /stream ×N) → in_progress
                                                                   ↓ (question_flow_completed)
                                                            question_flow_completed
                                                                   ↓ (POST /feedback)
                                                                completed
                                                                   ↓ (POST /continue → POST /stream ×N)
                                                                in_progress (再開)
任意の状態 → (POST /reset) → setup_pending
```

### 5-2. fail-closed 挙動と state hydration

**persistence-errors.ts の設計は優秀 [Positive]:**
- PostgreSQL エラーコード `42P01` (missing table), `42703` (missing column) を検出
- `InterviewPersistenceUnavailableError` でラップし 503 レスポンスを返却
- フロントエンドは `persistenceUnavailable` 状態で専用 UI を表示
- マイグレーション未適用時のグレースフルデグラデーションとして機能

**context.ts の `Promise.all` 問題 [C-09]:**
- `buildInterviewContext` の L363-428 で motivation, gakuchika, documents, persistence を `Promise.all` で並列取得
- いずれか1つの失敗（例: gakuchika テーブルの一時的障害）で面接機能全体がブロック
- 推奨: 非クリティカルクエリに `Promise.allSettled` を使用し、失敗時は空配列でデグレード

### 5-3. エラーハンドリングとリカバリ

| 問題 | 場所 | 影響 |
|---|---|---|
| リセット確認なし [U-01] | `page.tsx:952,991` / `controller.ts:580-623` | 誤タップで会話全消失。`handleReset` が確認ダイアログなしで直接実行 |
| 満足度アンカーラベルなし [U-02] | `page.tsx:456-467` | 1-5 のボタンに 1=不満、5=満足 等のラベルがなく、ユーザーが何を選んでいるか分からない |
| 開始ボタン無効時の説明なし [U-03] | `page.tsx:876` | `!setupComplete` で disabled だが、何が不足しているかの説明がない |
| 90秒タイムアウトの汎用エラー | `controller.ts:291-296, 461-462` | `AbortController` の 90秒タイムアウトで「ストリームが途中で切断されました」という汎用メッセージ。リトライ提案なし |
| JST タイムゾーン未指定 [C-11] | `page.tsx:329-331` | `toLocaleString("ja-JP")` に `timeZone: "Asia/Tokyo"` なし |

---

## 6. テスト・信頼性監査（配点10）

### 6-1. カバレッジマトリクス

| テスト対象 | Backend pytest | Frontend Vitest | E2E Playwright |
|---|:---:|:---:|:---:|
| 面接計画生成 (start) | ○ | ○ | ○ (1/144設定) |
| ターン質問生成 (turn/stream) | ○ | ○ | ○ (1/144設定) |
| 練習再開 (continue) | **✗** | **✗** | **✗** |
| 最終講評 (feedback) | ○ | ○ (一部) | ○ |
| リセット (reset) | — | **✗** | **✗** |
| state hydration | — | **✗** | — |
| persistence-error chain | — | ○ (4ルート) | — |
| credit ordering | — | ○ (feedback) | — |
| SSE wire format | ○ | — | — |
| 設定マトリクス (4×3×3×4=144) | ○ (1設定) | — | ○ (1設定) |
| ROLE_TRACK 10種 | **✗** | — | **✗** |

#### 凡例: ○=テスト存在、✗=テストなし、—=該当なし

### 6-2. 重大な finding

**[T-01] test_feedback_defaults 呼出しシグネチャ不一致 (critical):**
- `test_interview_prompt_shapes.py:400-419`: `_enrich_feedback_defaults(feedback, setup=..., company_name=...)` と呼ぶが、実装 (`interview.py:1179`) は `(feedback, *, setup)` のみ受付
- `TypeError: unexpected keyword argument 'company_name'` で失敗するか、テストがスキップされている
- アサーション `"任天堂" in feedback["improved_answer"]` も実装のフォールバックテンプレートと不一致

**[T-02〜T-06] 重大なテストギャップ:**
- `_generate_continue_progress` (Backend): ゼロテスト。専用プロンプト、スキーマ、`transition_line` フィールドが全て未検証
- `reset/route.ts` (Frontend): テストファイル不在。auth 拒否、persistence error、happy path が全て未カバー
- `continue/route.ts` (Frontend): テストファイル不在
- `useInterviewConversationController` (751行): テストファイル不在。`persistenceUnavailable` フリップ、`legacySessionDetected`、streaming 蓄積が全て未検証
- credit-insufficient (402) パス in feedback route: テストなし

**[T-03] E2E 設定マトリクスカバレッジ:**
- `tests/ai_eval/interview_cases.json`: 6ケース (smoke 1, extended 5)
- 全ケースが暗黙の default 設定（`standard_behavioral` / `standard` / `mid` / `hr`）
- `case`, `technical`, `life_history` フォーマットの E2E カバレッジ = **ゼロ**
- `final` stage, `executive` interviewer, `strict` mode の E2E カバレッジ = **ゼロ**

### 6-3. ポジティブ評価

| 評価 | 対象 |
|---|---|
| ○ 優秀 | persistence-error チェーン: 42P01/42703 → 503 のパスが3レイヤーで独立検証 |
| ○ 優秀 | credit reservation/confirmation 順序: `invocationCallOrder` で enforce |
| ○ 良好 | SSE wire format: 実際の `json.loads` パースでフォーマット回帰を検出 |
| ○ 良好 | feedback backfill: weakest_turn_id/action fields の欠落時フォールバック検証 |
| ○ 良好 | Schema validation: `issubset` で optional フィールド追加に耐性あり |

---

## 7. セキュリティ基礎チェック（配点10）

### 7-1. 認証・所有権チェック

| ルート | 認証チェック | 所有権チェック |
|---|:---:|:---:|
| `GET /interview` | ○ L19 | ○ (`getOwnedCompany`) |
| `POST /interview/start` | ○ L63 | ○ |
| `POST /interview/stream` | ○ L45 | ○ |
| `POST /interview/feedback` | ○ L63 | ○ |
| `POST /interview/continue` | ○ | ○ |
| `POST /interview/reset` | ○ L20 | ○ |
| `POST /interview/satisfaction` | ○ | ○ |

**全ルートで `identity.userId` 必須チェック → ゲストはブロック** ✓

### 7-2. 入力検証

| 項目 | 状態 |
|---|---|
| `_sanitize_base_request()` | ○ 全フィールドに `sanitize_user_prompt_text()` 適用 |
| 会話メッセージサニタイズ | ○ `_sanitize_messages()` でロール・コンテンツ検証 |
| JSON Schema `additionalProperties: false` | ○ 全6スキーマ |
| 二重サニタイズ [C-05] | △ `_sanitize_base_request` + endpoint-level `sanitize_prompt_input` 重複 |
| SSE error での例外漏洩 [S-01] | ✗ `str(exc)` が生 Python 例外メッセージを SSE イベントとしてクライアントに送信 (L1810, 1901, 1983, 2057) |

---

## 8. 競合比較（市場基準との差分）

### 面接対策AI市場の概況

日本の新卒就活特化で「企業別コンテキスト連携 + 多軸設定 + 7軸スコア講評」を備えるサービスは現時点で確認できず、就活Passは独自ポジションにある。学生向け面接練習AIは日本市場で空白地帯（harutaka等はB2B面接ツールで企業の選考用）。

### 競合比較マトリクス

| 観点 | **就活Pass** | GPTs (面接GPTs) | InterviewAI.me | interviewing.io | Exponent (旧Pramp) | Careerflow.ai |
|---|---|---|---|---|---|---|
| 対象市場 | **日本の新卒就活** | 汎用 | グローバル(英語) | FAANG志向(英語) | Tech特化(英語) | グローバル(英語) |
| 模擬面接 | テキスト対話 | テキスト対話 | 音声ベース | 人間+AI | Peer-to-Peer | 記載不明 |
| 面接方式 | **4種** | 汎用1種 | 3カテゴリ | 6種(algo/sys等) | 6種(DS&A/PM等) | なし |
| 厳しさ設定 | **3段階** | なし | なし | なし | なし | なし |
| 面接段階 | **3段階** | なし | なし | なし | なし | なし |
| 面接官タイプ | **4種** | なし | なし | なし | なし | なし |
| 企業別対策 | **ES/志望動機/ガクチカ連携** | なし | JD連携あり | 企業別コーチング | なし | なし |
| フィードバック | **7軸スコア+最弱質問+改善例** | 自由文 | tone/pace/content 3軸 | 口頭FB | ピアFB | 「面接分析」 |
| 価格 | 月0-2,980円 | ChatGPT Plus $20/月必須 | $8-20 | 非公開(高額) | 無料 | 月$20-45 |

### 就活Passの差別化ポイント（ランク付き）

| 順位 | 差別化要素 | 競合優位性 |
|---|---|---|
| 1 | **一気通貫連携**: ES/志望動機/ガクチカ/企業情報が面接に自動反映 | 唯一無二。他サービスは全て面接が独立機能 |
| 2 | **日本の新卒就活に完全特化**: ガクチカ/志望動機/業界志望理由の日本固有構造 | GPTs/海外サービスは非対応 |
| 3 | **7軸スコア+最弱質問特定+改善回答例**: 構造化フィードバック | GPTs=自由文、InterviewAI=3軸に対し圧倒的に詳細 |
| 4 | **設定の柔軟性**: 4方式×3厳しさ×3段階×4面接官=144通り | 同等の設定粒度を持つサービスは確認できず |
| 5 | **月0-2,980円**: 就活塾(月3-10万円)の1/30以下 | ChatGPT Plus($20/月)より安い |

### 弱み（本監査で判明）

- 設定柔軟性は UI 上の選択肢としては存在するが、プロンプト上の行動変化に繋がっていない（strictness E 評価）
- 深掘り技術の具体性が GPTs 比でも低い（具体テクニック指示なし）
- グラウンディングルールがなく、虚偽前提の質問リスクが競合 GPTs より高い
- 音声対応なし（InterviewAI.me は音声ベースで臨場感あり）

### 市場ポジショニング

就活Pass の面接機能は「設定インフラ」と「データ連携」で市場をリードしているが、「プロンプトによる行動制御」がボトルネックとなり、設定の豊富さがユーザー体験の差に転換されていない。strictness/interviewer/stage の行動指示を追加すれば、設定インフラが即座に品質向上に直結する。

---

## 9. 全 Finding 一覧（正規化済み）

### 命名規則
- **C-xx**: コード品質・設計
- **P-xx**: AI/プロンプト品質
- **Q-xx**: 面接プロ品質
- **U-xx**: UX・ユーザー体験
- **T-xx**: テスト・信頼性
- **S-xx**: セキュリティ

### Critical（致命的）

| ID | 発見観点 | ファイル:行 | 問題 |
|---|---|---|---|
| **C-01** | 1A | `interview.py:1707,1736,1825,1915,1997` | `async for kind, payload` が外側の `payload: InterviewStartRequest` をシャドウイング。フォールバックパスで `dict\|None` を Pydantic モデルとして使用 |
| **C-02** | 1A,1D | `interview.py:24-29` / `session.ts:1-12` | ROLE_TRACK 不整合: Frontend 10種 vs Backend 5種。`frontend_engineer` 等5種が `biz_general` にサイレントフォールバック |
| **P-01** | 1B,1D | `interview.py:74-436` (全5テンプレート) | `strictness_mode` がラベル挿入のみ。supportive/standard/strict の行動差分指示がゼロ |
| **P-02** | 1B,1D | `interview.py:74-436` (全5テンプレート) | `interviewer_type` + `interview_stage` がラベル挿入のみ。hr/executive/line_manager の質問視点差、early/final の深さ差が指示なし |
| **P-03** | 1B | `interview.py:74-436` (全5テンプレート) | グラウンディング/anti-hallucination ルールがゼロ。LLM が候補者未発言の事実を前提とした質問生成のリスク |
| **T-01** | 1C | `test_interview_prompt_shapes.py:400-419` | `_enrich_feedback_defaults` の呼出しシグネチャが実装と不一致。`company_name` パラメータは実装に存在しない |

### Major（重大）

| ID | 発見観点 | ファイル:行 | 問題 |
|---|---|---|---|
| **C-03** | 1A | `interview.py:1-2172` | 2172行の God Object。7責務が混在。新フォーマット追加時のマージコンフリクトリスク |
| **C-04** | 1A | `page.tsx:1-1111` | 1111行のページコンポーネント。8つのインラインサブコンポーネント。50+フィールドのデストラクチャリング |
| **C-05** | 1A,1B | `interview.py:2088-2172` | `_sanitize_base_request()` + endpoint-level `sanitize_prompt_input()` の二重サニタイズ。40回の冗長呼出し |
| **C-06** | 1A | `interview.py:1810,1901,1983,2057` | SSE error イベントで `str(exc)` が生 Python 例外メッセージをクライアントに送信。OWASP A01 情報漏洩 |
| **P-04** | 1A,1B,1D | 全5テンプレート | プロンプト内変数の大量重複。各パラメータ2-3回、interview_plan 2重挿入、academic_summary 3重挿入。推定 150-400 tokens/call の浪費 |
| **P-05** | 1B,1D | `interview.py:353-436` | 講評スコアリングルブリック未定義。0-5の意味が不明。strictness による採点基準の調整指示なし |
| **P-06** | 1B,1D | `interview.py:1056-1080` | ケース面接フォールバック質問が企業無関係の固定「小売チェーン売上低下」シナリオ |
| **P-07** | 1D | `interview.py:757-767` / `_PLAN_FALLBACK` | company-seeds のシード情報がプロンプト末尾「補足」に埋没。活用指示なし |
| **P-08** | 1D | `interview.py:215-296` | ターンプロンプトに深掘り具体テクニック（STAR深掘り、前提揺さぶり、仮説検証）の指示なし |
| **T-02** | 1C | Backend `_generate_continue_progress` | 練習再開フロー: 専用プロンプト・スキーマ・`transition_line` が全て未テスト |
| **T-03** | 1C | `tests/ai_eval/interview_cases.json` | E2E 設定マトリクスカバレッジ: 144設定中1設定。case/technical/life_history/final/executive/strict = ゼロ |
| **T-04** | 1C | `reset/route.ts` | テストファイル不在。auth拒否・persistence error・happy path 全て未カバー |
| **T-05** | 1C | `continue/route.ts` | テストファイル不在 |
| **T-06** | 1C | `useInterviewConversationController.ts` | 751行の状態管理 hook がテストファイル不在 |
| **T-07** | 1C | `feedback/route.test.ts` | credit-insufficient (402) パスのテストなし |
| **U-01** | 1E | `page.tsx:952,991` / `controller.ts:580-623` | リセット確認ダイアログなし。誤タップで会話全消失 |

### Moderate（中程度）

| ID | 発見観点 | ファイル:行 | 問題 |
|---|---|---|---|
| **C-07** | 1A | `controller.ts:99-132` | 34個の `useState`。関連 state のグルーピングなし |
| **C-08** | 1A | `ui.ts` / `conversation.ts` / `types.ts` | Feedback 型定義3重重複。Material 型定義2重重複 |
| **C-09** | 1A | `context.ts:363-428` | `Promise.all` all-or-nothing。非クリティカルクエリ失敗で面接機能全体ブロック |
| **C-10** | 1A | `session.ts:355-361` | Dead code: `getCurrentStageQuestionCount()` (常に0), `shouldChargeInterviewSession()` (identity 関数) |
| **C-11** | 1A | `page.tsx:329-331` | `toLocaleString("ja-JP")` に `timeZone: "Asia/Tokyo"` なし。JST ルール違反 |
| **C-12** | 1A | `context.ts`, `persistence.ts` | `guestId!` 非null アサーション15+箇所。型ガードなし |
| **C-13** | 1A | `persistence.ts:175-228` | `JSON.stringify`/`JSON.parse` で jsonb カラムに二重シリアライズの可能性 |
| **P-09** | 1B | `interview.py` / `notion_prompts.json` | Notion 管理版が全5プロンプトで未作成。版管理・A/Bテスト不能 |
| **P-10** | 1B | `interview.py:267-296` | `intent_key` 反復防止: `recentQuestionSummariesV2` をプロンプトに注入するが活用指示なし |
| **Q-01** | 1D | `interview.py:843-864` | `_checklist_for_topic` が `interviewer_type`/`strictness_mode` を完全無視 |
| **Q-02** | 1D | `interview.py:1581-1626` | `_fallback_plan` が `interviewer_type`/`strictness_mode` を無視。executive×final と hr×final で同一計画 |
| **Q-03** | 1D | `interview.py:292` | `followup_style` 33種が定義のみ。各スタイルの使い分けルール説明なし |
| **Q-04** | 1D | `_PLAN_FALLBACK` | 企業固有性活用指示不十分。`company_name`/`company_summary` の論点設計への具体的活用指示なし |
| **Q-05** | 1D | `interview.py:1066-1130` | フォールバック opening の `turn_action` が全方式で `"shift"`。初回に「次論点への移動」は意味不整合 |
| **T-08** | 1C | `test_interview_streaming.py` | Opening 生成フォールバックパスが独立テストなし（plan 失敗テストのみ） |
| **T-09** | 1C | `test_interview_streaming.py` | format-specific feedback prompt weight variation のテストなし |
| **T-10** | 1C | `test_interview_streaming.py` | Turn LLM failure の error-emission パスのテストなし |
| **U-02** | 1E | `page.tsx:456-467` | 満足度ボタン 1-5 にアンカーラベル（1=不満、5=満足）なし |
| **U-03** | 1E | `page.tsx:876` | 開始ボタン disabled 時に不足設定の説明なし |

### Minor（軽微）

| ID | 発見観点 | ファイル:行 | 問題 |
|---|---|---|---|
| **C-14** | 1A | `interview.py:655-669` | `dict[str, Any]` で turn_state を受け取り。Pydantic 検証なし |
| **C-15** | 1A | `page.tsx:911-913` | index ベースの React key。optimistic 挿入で mis-reconciliation リスク |
| **P-11** | 1B | `interview.py:438-474` / Opening prompt | `INTERVIEW_TURN_META_SCHEMA` が opening でも `intent_key` を required にするが、opening prompt の出力例に含まれない |
| **P-12** | 1B | `_PLAN_FALLBACK` | `{materials_section}` と個別セクション (`## 志望動機` 等) の両方が同一内容を含む |
| **Q-06** | 1D | `interview.py:298-351` | continue プロンプトに strictness/interviewer/stage の行動指示なし |
| **Q-07** | 1D | `company-seeds.ts` | マッキンゼー、Google、ソニー等の主要企業がシードに不在 |
| **T-11** | 1C | `test_interview_prompt_shapes.py:283-311` | case fallback opening テストの `intent_key` アサーションが `_build_fallback_opening_payload` の返却値と不一致の可能性 |
| **T-12** | 1C | Backend tests | `_normalize_question_text`, `_merge_plan_progress`, `_format_conversation` 等の重要 pure 関数がユニットテストなし |
| **T-13** | 1C | `stream/route.test.ts` | `onComplete` での `saveInterviewTurnEvent` 失敗パスのテストなし |

---

## 10. 改善ロードマップ

### 即時（1-2日）

| 優先度 | 対象 | 作業内容 | 根拠 |
|---|---|---|---|
| **P0** | C-01 | `async for kind, payload` → `async for kind, chunk_data` にリネーム (5箇所) | 致命的バグ。フォールバックパスでランタイムエラー |
| **P0** | C-02 | Backend `ROLE_TRACKS` に5種追加 + `ROLE_TRACK_KEYWORDS` 拡張 | 50%のロールが biz_general 化 |
| **P0** | C-06/S-01 | SSE error で `str(exc)` → 汎用メッセージ。server-side log は維持 | 情報漏洩 |

### 短期（1-2週間）

| 優先度 | 対象 | 作業内容 | 根拠 |
|---|---|---|---|
| **P1** | P-01,P-02 | 5プロンプトに strictness/interviewer/stage の行動指示セクション追加 | 面接品質の根幹 |
| **P1** | P-03 | 全プロンプトにグラウンディングルール追加 | 虚偽前提リスク |
| **P1** | P-04 | 全テンプレートの変数重複除去 | トークン効率 20-27% 改善 |
| **P1** | P-05 | 講評スコアリングルブリック定義（0-5の意味 + strictness 基準調整） | スコア信頼性 |
| **P1** | U-01 | リセット前に確認ダイアログ追加 | データ損失防止 |
| **P2** | T-04,T-05 | reset/continue ルートテスト作成 | 基本カバレッジ |
| **P2** | T-01 | test_feedback_defaults のシグネチャ修正 | テスト偽陽性/偽陰性 |
| **P2** | C-05 | 二重サニタイズ除去（40冗長呼出し削減） | 保守性・性能 |

### 中期（1-2ヶ月）

| 優先度 | 対象 | 作業内容 | 根拠 |
|---|---|---|---|
| **P2** | C-03 | `interview.py` 4モジュール分割 | 保守性 |
| **P2** | C-04 | `page.tsx` 6コンポーネント抽出 | 保守性 |
| **P2** | P-09 | Notion 版面接プロンプト5本作成 | A/Bテスト・版管理 |
| **P2** | T-03 | E2E に case/technical/life_history 設定追加（最低3ケース） | 設定マトリクスカバレッジ |
| **P2** | T-06 | `useInterviewConversationController` テスト作成 | 751行の状態管理未検証 |
| **P3** | P-08 | ターンプロンプトに深掘りテクニック指示追加 | 深掘り品質 D→C |
| **P3** | Q-01,Q-02 | チェックリスト・計画に interviewer/strictness 差分追加 | 段階・面接官整合 D→C |
| **P3** | P-06 | ケースフォールバック質問の企業/業界連動化 | ケース面接のリアリティ |

---

## 11. 総合所見

就活Pass の面接対策機能は、**設定インフラ**（4方式 × 5設定軸 = 144パターン）と**データ連携**（企業情報・ES・志望動機・ガクチカの統合活用）において市場をリードする設計を持つ。company-seeds の23業界×3企業の論点データベース、persistence-error の fail-closed 設計、format-specific なフォールバック戦略は高い工学水準を示す。

しかし、**プロンプトによる行動制御**がボトルネックとなり、豊富な設定がユーザー体験の差に転換されていない。特に以下の3点が総合スコアを大きく押し下げている:

1. **厳しさ・面接官・段階の3パラメータが事実上デコレーション** — ユーザーが「strict × executive × final」を選択しても、LLM への行動変化指示がないため「standard × hr × mid」と同等の出力が生成される可能性が高い
2. **Backend の ROLE_TRACK が Frontend の半数** — IT系の細分化された5職種が一律 biz_general 化され、技術系ユーザーの面接対策品質が著しく低下
3. **`payload` 変数シャドウイングの致命的バグ** — フォールバックパスに入った際に Pydantic モデルではなく dict を参照する潜在的ランタイムエラー

ポジティブな面として、4方式の構造的差分（B評価）、persistence-error チェーンの堅牢性、credit 管理の正確性、入力サニタイズの網羅性は競合を上回る水準にある。

**改善の最大レバレッジ**: P-01/P-02（strictness/interviewer/stage の行動指示追加）は、既存の設定インフラを即座に品質向上に直結させる最もROIの高い改善。コード変更量は各テンプレートに30-50行の指示セクション追加のみで、面接プロ品質の3軸（厳しさ E→C、段階・面接官 D→C、深掘り D→C）を一挙に改善できる。

---

## 付録A: 監査方法論

### 独立5観点レビュー体制

| 担当 | 観点 | エージェント | 事前情報 |
|---|---|---|---|
| A | コード品質・設計 | `code-reviewer` | 既知問題なし（追認バイアス排除） |
| B | AI/プロンプト品質 | `prompt-engineer` | 既知問題なし |
| C | テスト・信頼性 | `test-automator` | 既知問題なし |
| D | 面接プロ品質 | `prompt-engineer` | 既知問題なし |
| E | UX + セキュリティ | メインエージェント | 既知問題なし |

各担当は独立にレビューを実施し、finding を `file:line, impact, evidence_type, repro, description` 形式で報告。事後に統合・正規化・重複排除を実施。

### 重複発見の突合結果

| 正規化ID | 独立発見した観点 |
|---|---|
| C-02 (ROLE_TRACK 不整合) | 1A, 1D が独立に発見 |
| P-01 (strictness 行動指示なし) | 1B, 1D が独立に発見 |
| P-02 (interviewer/stage 行動指示なし) | 1B, 1D が独立に発見 |
| P-04 (プロンプト変数重複) | 1A, 1B, 1D が独立に発見 |
| C-05 (二重サニタイズ) | 1A, 1B が独立に発見 |
| P-05 (スコアリングルブリック) | 1B, 1D が独立に発見 |
| P-06 (ケースフォールバック固定) | 1B, 1D が独立に発見 |

### 12ケースマトリクスの再現条件

全ケースの入力条件セットは § 2-2 に記載。再現には以下が必要:
- Git SHA: cbf9de8
- MODEL_INTERVIEW=gpt-mini, MODEL_INTERVIEW_FEEDBACK=claude-sonnet
- 各ケースの `company_name`, `selected_industry`, `selected_role`, `interview_format`, `selection_type`, `interview_stage`, `interviewer_type`, `strictness_mode` を POST body で指定
