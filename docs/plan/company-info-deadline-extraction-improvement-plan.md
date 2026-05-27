# 企業情報取得・締切抽出 — 品質・精度 & アーキテクチャ改善計画

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


作成日: 2026-05-05 JST
Codex Plan Review: NEEDS_REVISION → 7件反映済み

## 1. 目的

就活Pass の「企業情報取得」「締切抽出」機能群について、品質・精度とアーキテクチャの2軸で包括的改善を実施する。

本計画は5つの専門分析（LLM抽出精度 / URL発見・クロール / 重複検出・承認 / アーキテクチャ / パフォーマンス）の結果を統合し、Codex plan review のフィードバックを反映したものである。

ユーザー確認済みの方針:

- フェーズ分けはリスク・緊急度ベース
- 大規模リファクタリング（DB正規化、ジョブキュー化、Vector Store移行）もスコープに含む
- 本タスクの完了条件は計画書作成であり、コード実装は行わない

## 2. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/company-info-deadline-extraction-improvement-plan.md` に、5分野の分析結果、課題、改善策、フェーズ計画、タスク一覧が記録されている。
2. タスク一覧は `Status / Severity / Task / Owner / Evidence / Acceptance Criteria / Updated At` を持つ Markdown table で管理されている。
3. Critical / High の修正タスクがすべて洗い出され、実装者が着手可能な粒度になっている。
4. Codex plan review のフィードバック7件がすべて反映されている。

## 3. タスク状態更新ルール

本計画書を実装フェーズで使う場合、以下の反復で進める。

1. `Task Tracker` から未完了タスクを 1 件選ぶ。
2. 対象コードを読み、必要ならテストを先に追加する。
3. 実装または検証の進捗に合わせて `Status` と `Updated At` を更新する。
4. 受け入れ条件を満たしたら `Review`、レビューと検証が終わったら `Done` にする。
5. `Done` 以外が残っている場合は 1 に戻る。

Status は以下のみを使う。

- `Todo`: 未着手
- `In Progress`: 実装中
- `Blocked`: 外部判断または環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

## 4. Task Tracker

### Phase 0: Critical Bug Fixes（推定 3-5日）

| Status | Severity | Task | Owner | Evidence | Acceptance Criteria | Updated At |
|---|---:|---|---|---|---|---|
| Done | Critical | T-01: JST基準違反の一掃（5箇所） | code-reviewer | `deadline-status.ts:29`, `deadline-persistence.ts:67-73`, `fetch_schedule.py:732,787,820`, `company_info_candidate_scoring.py:84-89`; execution-order 2026-05-07 完了記録 | overdue判定・isSameDay・datetime計算がすべて JST 基準。`getJstDateKey()` / `ZoneInfo("Asia/Tokyo")` を使用。JST 0:00-8:59 の境界テストが通る。 | 2026-05-13 |
| Done | Critical | T-02: EXTRACTION_SYSTEM_PROMPT の KeyError crash 修正 | prompt-engineer | `company_info_llm_extraction.py` で `next_year` 注入済み | `{current_year + 1}` → `{next_year}` に変更。format() 呼び出し元に `next_year=current_year+1` を追加。extract_info_with_llm が正常動作するテストが通る。 | 2026-05-13 |
| Done | Critical | T-03: generateTasksForDeadline の冪等性保証 | nextjs-developer | `src/lib/server/task-generation.ts`; execution-order 2026-05-07 完了記録 | 既存 deadlineId のタスクの templateKey を先行取得し、重複をスキップ。isConfirmed false→true→false→true でタスクが1セットのみ存在するテストが通る。 | 2026-05-13 |
| Done | Critical | T-04: タスク巻き戻しバグ修正 | nextjs-developer | `src/app/api/deadlines/[id]/route.ts`; execution-order 2026-05-07 完了記録 | 完了解除時に `autoCompletedTaskIds` に含まれるタスクのみを open に戻す。手動完了タスクは巻き添えにならないテストが通る。 | 2026-05-13 |
| Done | Critical | T-05: HTML テーブル構造保持の前処理追加 | rag-engineer | `backend/tests/company_info/test_html_table_extraction.py` | `soup.get_text()` の前に `<table>` → Markdown/TSV 変換を実施。テーブル形式ページで列間関係が LLM に伝わることを抽出テストで確認。 | 2026-05-13 |

### Phase 1: 構造改善 + 品質基盤（推定 7-10日）

**前半: 構造改善（hotspot ファイルへの追加前に分離）**

| Status | Severity | Task | Owner | Evidence | Acceptance Criteria | Updated At |
|---|---:|---|---|---|---|---|
| Todo | High | T-26: BFF 共通ルートコンテキスト抽出 | architect | 5ファイルに `getAuthenticatedUser()` / `verifyCompanyAccess()` がコピペ。`src/bff/identity/owner-access.ts` の canonical パターン未使用 | `resolveCompanyRouteContext(request, params)` → `{ identity, company, plan, requestId }` を 8 ルートで使用。guest/user 境界が明示され、fetch-corporate の user-only 制約が保持されるテストが通る。 | 2026-05-05 |
| Todo | High | T-27: エラーハンドリング統一（24箇所） | nextjs-developer | 6ルートファイルで raw `NextResponse.json({ error })` が 24 箇所 | 全エンドポイントが `createApiErrorResponse()` を使用。search-pages のモックフォールバックを構造化 503 に置換。 | 2026-05-05 |
| Todo | High | T-28: FastAPI プロキシパターン統一 | nextjs-developer | fetch-info は `fetchFastApiInternal()`、fetch-corporate は `fetchFastApiWithPrincipal()`。使い分けポリシーなし | 全 company-info ルートが `fetchFastApiWithPrincipal()` を使用。 | 2026-05-05 |
| Todo | High | T-29: fetch_schedule_response Strategy 分割 | architect | `fetch_schedule.py:509-826` が 317 行 5 段ネスト | `FirecrawlScheduleStrategy` / `DirectLlmScheduleStrategy` に分割。各 <150 行。既存テストが通る。 | 2026-05-05 |
| Todo | High | T-30: グローバル依存→DI 化 | architect | `fetch_schedule.py:46-113` で 20+ グローバル変数を `configure_dependencies()` で初期化 | `ScheduleExtractionContext` dataclass に依存集約。並列テストが安全に動作。 | 2026-05-05 |
| Todo | Medium | T-12: DeadlineType SSOT 化 | code-reviewer | 3ファイルに独立宣言 | `schema.ts` 推論型を SSOT として export。他は import。 | 2026-05-05 |

**後半: 品質改善（Strategy 分割後に実施）**

| Status | Severity | Task | Owner | Evidence | Acceptance Criteria | Updated At |
|---|---:|---|---|---|---|---|
| Todo | High | T-06: Few-shot examples の追加 | prompt-engineer | SCHEDULE_SYSTEM_PROMPT に入出力例なし | 2例（公式ページ / アグリゲーター）の入出力ペアを追加。type マッピングと日付形式の一貫性が向上。 | 2026-05-05 |
| Todo | High | T-07: confidence 定義の明確化 | prompt-engineer | confidence セクションが 6 単語のみ | 具体的な境界定義を追加。`_cap_schedule_confidence` との二重ペナルティを解消。 | 2026-05-05 |
| Todo | Medium | T-08: 曖昧日付ルール拡充 | prompt-engineer | 「上旬/中旬/下旬」の 3 パターンのみ | 「月末」「月頃」「GW明け」「春頃」「予定」の変換ルール追加。曖昧表現→confidence 自動降格。 | 2026-05-05 |
| Todo | High | T-09: due_date フォーマット検証 | prompt-engineer | JSON Schema に pattern 制約なし | `"pattern": "^\\d{4}-\\d{2}-\\d{2}$"` 追加 + パース後正規化。 | 2026-05-05 |
| Todo | High | T-10: normalizeTitle NFKC 正規化 + 序数拡張 | code-reviewer | 全角/半角未変換、序数 `[一二三四五1-5]` に限定 | `.normalize("NFKC")` 追加。「ＥＳ提出」=「ES提出」のテストが通る。 | 2026-05-05 |
| Todo | High | T-11: 重複検出アルゴリズム統一 | code-reviewer | 保存時 exact day (UTC) vs 警告時 ±1 day (ms) | 両方を JST 日付ベース ±1 日に統一。`isSameDayJst()` を使用。 | 2026-05-05 |
| Todo | Medium | T-13: テキスト圧縮コンテキストウィンドウ拡大 | prompt-engineer | コンテキスト 2 行でヘッダと日付の間を捉えられない | 通常 2→4 行、極大 3→5 行。英語キーワード追加。 | 2026-05-05 |
| Todo | Medium | T-14: 年推定の明示ルール追加 | prompt-engineer | 明示年との conflict resolution なし | 「ページに明示年がある場合は優先」の指示追加。 | 2026-05-05 |

### Phase 2: パフォーマンス & 信頼性（推定 10-14日）

| Status | Severity | Task | Owner | Evidence | Acceptance Criteria | Updated At |
|---|---:|---|---|---|---|---|
| Todo | High | T-15: saveExtractedDeadlines の N+1 解消 | database-engineer | 締切ごとに SELECT + INSERT（5件→10往復） | 一括 SELECT → Map → バッチ INSERT で 2 往復。 | 2026-05-05 |
| Todo | Medium | T-16: getOrCreateMonthlyUsage の UPSERT 化 | database-engineer | SELECT → INSERT → SELECT の 3 往復 | `onConflictDoUpdate` で 1 往復。 | 2026-05-05 |
| Todo | High | T-17: Firecrawl AsyncClient シングルトン + リトライ | fastapi-developer | 毎回 AsyncClient 生成破棄。リトライなし | モジュールレベル AsyncClient。指数バックオフ 3 回リトライ。Semaphore(5) で同時実行制限。 | 2026-05-05 |
| Todo | High | T-18: URL 結果キャッシュ（24h TTL） | nextjs-developer | 同一 URL で毎回 Firecrawl + LLM | **[Codex反映]** キャッシュキー: `companyId + userId + normalizedUrl + graduationYear + selectionType + getJstDateKey(now)`。他社・他ユーザーのキャッシュを返さない。 | 2026-05-05 |
| Todo | High | T-19: TOCTOU 排他制御（Redis lock） | nextjs-developer | 並行リクエストで重複 deadline 挿入 | Redis `SET NX EX` で `fetch-in-progress:{companyId}` ロック。409 返却。 | 2026-05-05 |
| Todo | High | T-20: バッチ承認 API 新設 | nextjs-developer | N 個の PUT リクエスト。部分失敗ロールバック不可 | **[Codex反映]** `POST /api/companies/:id/deadlines/confirm-batch`。1 トランザクション。CSRF・owner 検証・`createApiErrorResponse()` 使用。部分失敗ロールバック。 | 2026-05-05 |
| Todo | Medium | T-21: ゾンビ締切の管理 | nextjs-developer | isConfirmed=false に TTL なし | **[Codex反映]** soft delete（非表示 + 復元可能）。30日超で非表示。daily cron。 | 2026-05-05 |
| Todo | Medium | T-22: RAG crawl チャンクサイズ修正 | rag-engineer | `build_rag_source.py:856` でハードコード 500 | `get_chunk_settings(content_type)` に修正。再インデックスガイド追加。 | 2026-05-05 |
| Todo | Medium | T-23: confidence スコアリング dead branch 修正 | search-quality-engineer | `company_info_candidate_scoring.py:337-361` が collapsed | sourceType 別に meaningful discrimination。テスト追加。 | 2026-05-05 |
| Todo | Medium | T-24: crawl_corporate_pages_impl 並列化 | fastapi-developer | シリアル + `asyncio.sleep(1)` | **[Codex反映]** `asyncio.gather + Semaphore(3)`。vector store 書き込み並行安全性確保。billing units は全 URL 完了後に一括集計。 | 2026-05-05 |
| Todo | Medium | T-25: (company_id, type) 複合インデックス追加 | database-engineer | 複合インデックスなし | `deadlines_company_type_idx` 追加。`db:generate` → `db:push`。 | 2026-05-05 |

### Phase 3: インフラ & 評価基盤（推定 14-21日）

| Status | Severity | Task | Owner | Evidence | Acceptance Criteria | Updated At |
|---|---:|---|---|---|---|---|
| Todo | High | T-31: 課金状態の型安全化 | nextjs-developer | 5+4 変数がルーズに管理 | `ScheduleFetchBillingState` / `RagCrawlBillingAccumulator` 型を作成。 | 2026-05-05 |
| Todo | High | T-32: ChromaDB HTTPServer 分離準備と共有サーバー運用化 | rag-engineer | PersistentClient がマルチワーカー非対応 | 既存 RAG API / collection 名 / `tenant_key + company_id` 絞り込み / private material metadata / URL・会社単位削除 / BM25 更新 / Redis cache 無効化を維持したまま、設定で PersistentClient と ChromaDB HTTP client を切替可能にする。Qdrant は実装対象外とし、長期検討条件だけ文書化する。 | 2026-05-26 |
| Todo | High | T-33: fetch-corporate 非同期ジョブキュー化 | architect | Vercel タイムアウト衝突リスク | **[Codex反映]** RFC 先行: CorporateFetchJob 状態遷移、課金確定タイミング（crawl成功+DB永続化成功後のみ）、status polling の auth/owner。RFC 承認後に実装。 | 2026-05-05 |
| Todo | Critical | T-34: 抽出精度評価基盤 | prompt-engineer | golden dataset なし、eval なし、prompt versioning なし | `backend/evals/schedule_extraction/` に golden dataset 20-30 件 + eval runner。`SCHEDULE_PROMPT_VERSION` 導入。 | 2026-05-05 |
| Todo | Medium | T-35: コンテンツ分類 multi-match 解決 | rag-engineer | `content_classifier.py:98-103` で multi-match → None | priority ordering で解決。LLM fallback 50% 以上削減。 | 2026-05-05 |

## 5. フェーズ間の依存関係

```
Phase 0 ─→ Phase 1 ─→ Phase 2 ─→ Phase 3
  │           │           │           │
  │  JST修正   │  構造改善   │  性能改善   │  インフラ
  │  バグ修正   │  品質改善   │  信頼性    │  評価基盤
  │           │           │           │
  └─ T-01     ├─ T-26*    ├─ T-15     ├─ T-31
     T-02     │  T-27     │  T-16     │  T-32
     T-03     │  T-28     │  T-17     │  T-33(RFC先行)
     T-04     │  T-29*    │  T-18     │  T-34
     T-05     │  T-30*    │  T-19     │  T-35
              │  T-12     │  T-20     │
              │  T-06-T-08│  T-21     │
              │  T-09-T-11│  T-22-T-25│
              │  T-13-T-14│           │
              │           │           │
  * = Codex review で前倒し
```

Phase 内の順序制約:
- Phase 1: T-26/T-28 → T-27 → T-29/T-30 → T-06〜T-14（hotspot 分離後に品質改善）
- Phase 2: T-15 は T-10/T-11 完了後（正規化ロジック変更がバッチ化に影響）
- Phase 3: T-30(DI) → T-29(Strategy)。T-32 は中期の ChromaDB HTTPServer 分離であり、T-33 の RFC 先行判断や公開前 gate の前提にはしない
- T-32 は複数 worker / 複数 replica、RAG 主要導線化、staging での lock・破損・OOM、削除 receipt 不安定が出た時点で公開前必須へ昇格する
- Qdrant は T-32 の実装対象外。検索遅延、RAG データ量、削除保証、運用費、移行 rehearsal が揃った段階で別 RFC として検討する

## 6. 分析サマリー

### 6.1 LLM 抽出精度（prompt-engineer 分析）— 12件

| Severity | 課題 | 対象 |
|---|---|---|
| Critical | `{current_year + 1}` KeyError crash | `company_info_prompts.py:19` |
| Critical | golden dataset・eval 基盤なし | `backend/evals/` |
| High | Few-shot examples 完全欠如 | `company_info_prompts.py:96-117` |
| High | confidence 定義が 6 単語のみ | `company_info_prompts.py` |
| High | HTML テーブル構造崩壊 | `http_fetch.py:117` |
| High | `_get_graduation_year()` がサーバーローカル時間 | `company_info_candidate_scoring.py:84-89` |
| High | due_date フォーマット検証なし | `company_info_config.py` |
| High | コンテキストウィンドウ 2 行が不十分 | `fetch_schedule.py:144-189` |
| High | マージ時の dedup key が厳格すぎ | `fetch_schedule.py:472-506` |
| Medium | 曖昧日付ルール不足（3 パターンのみ） | `company_info_prompts.py:99` |
| Medium | 除外ルールが選考体験記等を未カバー | `company_info_prompts.py` |
| Medium | 英語スケジュールヘッダ未対応 | `company_info_config.py` |

### 6.2 URL 発見・クロール品質（rag-engineer 分析）— 15件

| Severity | 課題 | 対象 |
|---|---|---|
| High | confidence 閾値の dead branch | `company_info_candidate_scoring.py:337-361` |
| High | RAG crawl に JS レンダリング未対応 | `build_rag_source.py` |
| High | OCR 予算が制限的（MAX_OCR_CALLS=1） | `fetch_schedule.py` |
| High | RAG crawl のチャンクサイズがハードコード | `build_rag_source.py:856` |
| High | 分類で multi-match → LLM fallback | `content_classifier.py:98-103` |
| Medium | DuckDuckGo レート制限が暗黙 | `web_search.py` |
| Medium | mypage negative keyword の過剰フィルタ | `fetch_schedule.py:339` |
| Medium | source compliance login signal false positive | `source-compliance.ts` |
| Medium | compliance チェックが順次処理 | `source-compliance.ts` |
| Medium | re-crawl 時のチャンク重複排除なし | `vector_store.py` |
| Medium | chunk overlap 100 chars が小さい（20%） | `text_chunker.py` |
| Medium | RAG crawl テキスト品質が schedule より低い | `build_rag_source.py` |
| Low | embedding truncation がサイレント | `embeddings.py` |
| Low | Hybrid vs Legacy スコアリング尺度不統一 | `company_info_candidate_scoring.py` |
| Low | 短い社名ガードが ASCII のみ | `web_search.py` |

### 6.3 重複検出・承認フロー（code-reviewer 分析）— 14件

| Severity | 課題 | 対象 |
|---|---|---|
| Critical | タスク自動生成に冪等性なし | `task-generation.ts` |
| Critical | overdue 判定が UTC 基準 | `deadline-status.ts:29` |
| Critical | isSameDay() が UTC 基準 | `deadline-persistence.ts:67-73` |
| High | 保存時と警告時のアルゴリズム不一致 | `deadline-persistence.ts` |
| High | ゾンビ締切の放置 | DB 全体 |
| High | 承認 N+1 API 呼び出し | `DeadlineApprovalModal.tsx` |
| High | タスク巻き戻しバグ | `deadlines/[id]/route.ts:275` |
| High | normalizeTitle 全角/半角未変換 | `deadline-persistence.ts:56-62` |
| Medium | dueDate=null プレースホルダ誤マッチ | `deadline-persistence.ts:238-239` |
| Medium | 承認取消し UI なし | `DeadlineApprovalModal.tsx` |
| Medium | Calendar 同期 race condition | `sync-immediate.ts` |
| Medium | 企業削除時の Calendar イベント残存 | CASCADE 設計 |
| Medium | DeadlineType 3 ファイル重複定義 | 3 ファイル |
| Low | useEffect 依存配列のインライン計算 | `DeadlineApprovalModal.tsx` |

### 6.4 アーキテクチャ（architect 分析）— 23件

| Severity | 課題 | 対象 |
|---|---|---|
| Critical | Identity/Access 検証 4 パターン重複 | BFF 5 ファイル |
| High | GET ハンドラによる副作用書き込み | `fetch-corporate/route.ts:584-592` |
| High | プロキシパターン不一致 | 3 ルート |
| High | `company_info.py` 再エクスポートブロック | `company_info.py:74-148` |
| High | `fetch_schedule_response()` 317 行 5 段ネスト | `fetch_schedule.py:509-826` |
| High | 生 JSON エラー 24 箇所 | 6 ルートファイル |
| High | ExtractedDeadline 二重フィールド名 | `deadline-persistence.ts:225` |
| High | 課金状態がルーズ変数 | 2 ファイル |
| High | 抽出対象追加に 6+ ファイル協調変更 | 全体 |
| Medium | ソースメタデータ正規化 POST/GET 重複 | `fetch-corporate/route.ts` |
| Medium | スタブリダイレクトファイル 6 個 | FastAPI 層 |
| Medium | FastAPI エラー detail 不統一 | FastAPI 層 |
| Medium | GET RAG ステータス サイレント失敗 | `fetch-corporate/route.ts:494` |
| Medium | search-pages モックフォールバック | `search-pages/route.ts:151-202` |
| Medium | monkeypatch がファサード上 | テスト層 |
| Medium | 締切重複判定の境界テスト不足 | テスト層 |
| Medium | 課金 precheck→confirm 統合テスト不在 | テスト層 |
| Medium | JST 日付処理の散在 | 複数ファイル |
| Medium | corporateInfoUrls JSON ブロブ格納 | `schema.ts` |
| Medium | 課金ロジック 3 パターン分散 | 3 ファイル |
| Medium | コンテンツタイプ拡張がハードコード依存 | 5+ ファイル |
| Medium | Firecrawl 依存の深い埋め込み | `fetch_schedule.py:553-692` |
| Medium | `configure_dependencies()` グローバル可変状態 | `fetch_schedule.py:46-113` |

### 6.5 パフォーマンス・スケーラビリティ（backend-architect 分析）— 15件

| Severity | 課題 | 対象 |
|---|---|---|
| Critical | ChromaDB PersistentClient マルチワーカー競合 | `vector_store.py` |
| Critical | E2E レイテンシ 25-35 秒 | `fetch-info` 全体 |
| High | ユーザーフィードバックなし | `fetch-info`, `fetch-corporate` |
| High | userProfiles 二重クエリ | `fetch-info/route.ts:269-275` |
| High | LLM 結果キャッシュなし | `fetch-info` 全体 |
| High | Firecrawl 接続プーリングなし | `firecrawl.py` |
| High | Firecrawl リトライなし | `firecrawl.py` |
| High | saveExtractedDeadlines N+1 | `deadline-persistence.ts` |
| High | getOrCreateMonthlyUsage 3 往復 | `usage.ts` |
| High | TOCTOU 競合 | `fetch-info` → `saveExtractedDeadlines` |
| Medium | crawl シリアル + 1 秒スリープ | `build_rag_source.py:965-990` |
| Medium | 複合インデックス欠如 | `schema.ts` |
| Medium | applyCompanyRagUsage ループ内 DB 往復 | `fetch-corporate/route.ts` |
| Medium | rate limit サイレント無効化 | `rate-limit.ts` |
| Medium | embedding 単一プロバイダー | `embeddings.py` |

## 7. Codex Plan Review フィードバック（全7件反映済み）

| # | Severity | 指摘内容 | 対応 |
|---|---|---|---|
| 1 | High | T-18 キャッシュキーに companyId/userId/graduationYear/selectionType が未定義 | T-18 に完全なキャッシュキー仕様を明記 |
| 2 | High | T-33 非同期ジョブ化で「成功時のみ消費」ルール破壊リスク | T-33 に RFC 先行を前提条件追加 |
| 3 | Medium | T-26 の共通化で guest principal を誤許可するリスク | T-26 に user-only 制約保持テスト追加 |
| 4 | Medium | T-20 の batch API に CSRF/owner/transaction 方針未定義 | T-20 に設計要件を明記 |
| 5 | Medium | T-13/T-17 が hotspot への先行追加。T-29/T-30 分割が後回し | T-29/T-30 を Phase 1 に前倒し |
| 6 | Medium | T-24 の並列化で vector store 書き込み安全性未記載 | T-24 に並行安全性要件追加 |
| 7 | Low | プロンプト改修検証が T-34 まで遅延 | Phase 1 後半に配置、手動検証を推奨 |

## 8. 対象 Hotspot ファイル一覧

| ファイル | 行数 | Phase |
|---|---|---|
| `src/app/api/companies/[id]/fetch-info/route.ts` | 563 | P0, P1, P2 |
| `src/app/api/companies/[id]/fetch-corporate/route.ts` | 623 | P1, P2, P3 |
| `backend/app/services/company_info/fetch_schedule.py` | 826 | P0, P1 |
| `backend/app/services/company_info/build_rag_source.py` | 1005 | P2 |
| `src/lib/company-info/deadline-persistence.ts` | ~300 | P0, P1, P2 |
| `backend/app/prompts/company_info_prompts.py` | ~120 | P0, P1 |
| `backend/app/routers/company_info_candidate_scoring.py` | 1014 | P0, P2 |
| `backend/app/rag/vector_store.py` | 1792 | P3 |
| `src/lib/db/schema.ts` | 1041 | P2 |

## 9. 推定工数

| Phase | タスク数 | 推定工数 | 前提条件 |
|---|---|---|---|
| Phase 0: Critical Bug Fixes | 5 | 3-5 日 | なし |
| Phase 1: 構造改善 + 品質基盤 | 14 | 7-10 日 | Phase 0 完了 |
| Phase 2: パフォーマンス & 信頼性 | 11 | 10-14 日 | Phase 1 完了 |
| Phase 3: インフラ & 評価基盤 | 5 | 14-21 日 | Phase 2 完了 |
| **合計** | **35** | **34-50 日** | |

## 10. リスクと注意事項

1. **500行超ファイルの並行変更**: Phase 1 の構造改善（分割・共通化）を確実に先行させること。
2. **回帰テスト**: vertical slice 単位（fetch-info 全体、fetch-corporate 全体）で billing → FastAPI → DB の連動を含めテストすること。
3. **プロンプト変更の品質検証**: Phase 1 完了時に手動 5-10 ケース検証を実施。T-34（eval 基盤）は Phase 3 だが golden dataset 準備は早期着手が望ましい。
4. **ChromaDB HTTPServer 分離**: T-32 は中期タスクとして扱い、接続生成だけを差し替える。検索順位改善、プロンプト変更、Qdrant 準備を同時に混ぜない。Qdrant は長期検討であり、未完了の必須タスクには残さない。
5. **非同期ジョブキュー化**: T-33 は最大のアーキテクチャ変更。RFC 承認後、段階的に移行（fetch-corporate のみ先行）。

## Appendix A: 計画書作成プロセス

### 完了条件

以下のすべてを満たしたとき、本計画書は完了とする:

1. **現状分析が完了している**: 5つの分析領域（LLM抽出精度、URL発見・クロール、重複検出・承認、アーキテクチャ、パフォーマンス）すべてで課題が特定され、根拠付きで記述されている ✅
2. **改善提案が設計されている**: 各課題に対して具体的な改善策が設計され、実装方針（変更対象ファイル、アルゴリズム変更、DB マイグレーション等）が明記されている ✅
3. **優先度が付与されている**: ROI（ユーザーインパクト × 実装コスト）で評価され、フェーズ分けされている ✅
4. **ユーザーとの合意が取れている**: 方向性・優先度・スコープについて確認済み ✅
5. **最終計画書が docs/plan/ に出力されている**: 実装チームが着手可能な粒度で記述されている ✅

### オーケストレーションタスク

| # | タスク | 状態 | 担当 | ブロック |
|---|--------|------|------|----------|
| 1 | タスクリスト・完了条件の定義 | completed | orchestrator | - |
| 2 | LLM抽出精度の深層分析 | completed | prompt-engineer | - |
| 3 | URL発見・クロール品質の深層分析 | completed | rag-engineer | - |
| 4 | 重複検出・承認フローの品質分析 | completed | code-reviewer | - |
| 5 | アーキテクチャ課題の包括分析 | completed | architect | - |
| 6 | パフォーマンス・スケーラビリティ分析 | completed | backend-architect | - |
| 7 | 改善提案の設計・優先度付け | completed | orchestrator | 2,3,4,5,6 |
| 8 | 計画書ドキュメントの執筆 | completed | orchestrator | 7 |
| 9 | ユーザーとの方向性合意・最終レビュー | completed | orchestrator | 8 |

完了日: 2026-05-05
