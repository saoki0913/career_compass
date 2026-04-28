---
topic: es-review
plan_date: 2026-04-26
status: planned
based_on_review: user-provided ES review improvement audit
---

# ES添削 ロードマップ改善計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ES添削を、就活生が本番ESに安心して使える安全・高品質・運用可能な添削体験へ段階的に改善する。

**Architecture:** P0では、成功時のみクレジット消費、RAG信頼境界、入力境界、キャンセル、誤反映防止を固める。P1では出典・品質表示・テンプレート別ルーブリック・SSE契約を強化し、P2で履歴・複数案・面接接続などのプロダクト価値を伸ばす。

**Tech Stack:** Next.js App Router, React, TypeScript, FastAPI, Pydantic v2, Supabase/PostgreSQL, Drizzle ORM, SSE, Vitest, Playwright, pytest.

---

## 背景

既存のES添削は、設問テンプレート、企業RAG、SSE、クレジット予約、出典表示、反映UXを備えている。一方で、レビューにより以下の高優先リスクが確認された。

- サーバ側の本文長・`sectionCharLimit` 制約が弱く、フロント側バリデーションに寄っている。
- `hasCompanyRag` がクライアント由来値として下流に渡り、RAG可否の信頼境界が曖昧。
- 企業あり添削で業界・職種が一律必須になっており、ガクチカ・自己PRでは入力負荷が高い。
- `cancelReview` はhookに存在するが、UIとFastAPI task cancelまでの導線が不足している。
- 添削結果反映がタイトル/本文中心で、生成時の `sectionId` と本文スナップショット照合が不足している。
- `S/A/B/C` の品質スコアが、合格可能性や客観ランクとして誤読される可能性がある。

## 決定済み方針

| 論点 | 方針 |
|---|---|
| ES添削の利用条件 | ログイン必須を維持する。guest対応は今回の改善対象外 |
| 本文文字数 | 5文字以下は不可、1500字超は不可 |
| `sectionCharLimit` | `1..1500` に制限し、異常値はサーバ側で拒否 |
| 企業ありの業界/職種 | 志望系テンプレートだけ必須。ガクチカ・自己PR・価値観・basicでは任意 |
| AI出力品質 | P0では合否誤認防止の表示改善まで。テンプレート別ルーブリックとプロンプト改善はP1 |
| RAG可否 | ブラウザ由来の `hasCompanyRag` は実行判断に使わず、FastAPI側で再判定 |
| 課金 | `complete` を受信し、結果payloadが有効な場合だけ `confirmReservation` |

## P0: 安全性・課金・誤反映防止

### Task 1: サーバ側入力バリデーションを正本化する

**Files:**
- Modify: `backend/app/routers/es_review_models.py`
- Modify: `backend/app/routers/es_review.py`
- Modify: `src/app/api/documents/_services/handle-review-stream.ts`
- Test: `backend/tests/es_review/`
- Test: `src/app/api/documents/_services/handle-review-stream.test.ts`

- [ ] `ReviewRequest.content` に `min_length=6`, `max_length=1500` 相当の制約を入れる。
- [ ] `section_title` は必須扱いを維持し、空文字と過長値をFastAPIで拒否する。
- [ ] `section_char_limit` は `1..1500` の範囲に制限する。
- [ ] Next API側も同じ境界で早期に構造化エラーを返す。
- [ ] フロント側の既存5文字未満ブロックと文言を、サーバ境界と矛盾しない形に更新する。

**Verification:**
- `pytest backend/tests/es_review -k "validation or char_limit" -v`
- `npm run test:unit -- src/app/api/documents/_services/handle-review-stream.test.ts`

### Task 2: RAG信頼境界をサーバ側へ寄せる

**Files:**
- Modify: `src/hooks/useESReview.ts`
- Modify: `src/hooks/es-review/types.ts`
- Modify: `src/components/es/ReviewPanel.tsx`
- Modify: `src/app/api/documents/_services/handle-review-stream.ts`
- Modify: `backend/app/routers/es_review.py`
- Test: `backend/tests/es_review/`
- Test: `src/app/api/documents/_services/handle-review-stream.test.ts`

- [ ] ブラウザrequest bodyから `hasCompanyRag` を削除するか、UI表示用advisoryとしてのみ扱う。
- [ ] FastAPI側は `company_id` とテンプレート条件をもとに `has_company_rag(company_id)` を常に再判定する。
- [ ] `user_provided_corporate_urls` は所有済みcompany rowの `corporateInfoUrls` から、`blocked` 以外かつES添削に使えるものだけ渡す。
- [ ] `hasCompanyRag=true` 偽装で企業RAGあり扱いにならないテストを追加する。

**Verification:**
- `pytest backend/tests/es_review -k "rag or company_rag" -v`
- `npm run test:unit -- src/app/api/documents/_services/handle-review-stream.test.ts`

### Task 3: テンプレート別の業界・職種必須条件にする

**Files:**
- Modify: `src/components/es/review-panel-validation.ts`
- Modify: `src/components/es/ReviewPanel.tsx`
- Modify: `src/app/api/documents/_services/handle-review-stream.ts`
- Test: `src/components/es/review-panel-validation.test.ts`
- Test: `src/app/api/documents/_services/handle-review-stream.test.ts`

- [ ] `company_motivation`, `post_join_goals`, `role_course_reason` は業界・職種必須にする。
- [ ] `intern_reason`, `intern_goals` は業界必須、職種は推奨または任意にする。
- [ ] `gakuchika`, `self_pr`, `work_values`, `basic` は企業ありでも業界・職種を任意にする。
- [ ] UI文言は「企業接続を強めるには職種を選択」など、任意入力として自然に見せる。
- [ ] Next API側でも同じテンプレート別判定を行い、フロントだけに依存しない。

**Verification:**
- `npm run test:unit -- src/components/es/review-panel-validation.test.ts`
- `npm run test:unit -- src/app/api/documents/_services/handle-review-stream.test.ts`

### Task 4: キャンセルと成功時のみ消費を固定する

**Files:**
- Modify: `src/components/es/ReviewPanel.tsx`
- Modify: `src/components/es/MobileReviewPanel.tsx`
- Modify: `src/hooks/useESReview.ts`
- Modify: `src/lib/fastapi/sse-proxy.ts`
- Modify: `backend/app/routers/es_review.py`
- Test: `src/lib/fastapi/sse-proxy.test.ts`
- Test: `src/hooks/es-review/transport.test.ts`
- Test: `backend/tests/es_review/`

- [ ] 添削中はデスクトップ/モバイル両方に「中止」ボタンを出す。
- [ ] 中止中は `isCancelling` を使って「中止しています」状態を表示する。
- [ ] ブラウザの `AbortController` によりNext SSE proxyの `onFinally` が必ず走ることをテストで固定する。
- [ ] FastAPI generator cancellation時に `review_task.cancel()` を呼び、LLM処理とqueue処理を終了する。
- [ ] `complete` 未受信、HTTP非2xx、FastAPI `error`、ブラウザ切断、`onComplete` hook失敗はすべて予約cancelにする。
- [ ] `complete` を受信し、result payloadが有効な場合だけ `confirmReservation` する。

**Verification:**
- `npm run test:unit -- src/lib/fastapi/sse-proxy.test.ts`
- `npm run test:unit -- src/hooks/es-review/transport.test.ts`
- `pytest backend/tests/es_review -k "cancel or stream" -v`

### Task 5: 誤反映防止を生成時スナップショットで守る

**Files:**
- Modify: `src/components/es/ESEditorPageClient.tsx`
- Modify: `src/components/es/ReviewPanel.tsx`
- Modify: `src/components/es/ReflectModal.tsx`
- Test: relevant `src/components/es/**/*.test.tsx`

- [ ] セクション添削requestに `sectionId` を含める。
- [ ] 添削開始時に `sectionId`, `sectionTitle`, `originalTextHash`, `templateType`, `companyId`, `roleName` を保持する。
- [ ] 反映前に現在の `sectionId` と本文hashを照合する。
- [ ] 本文・設問・会社・職種が変わっている場合は、ReflectModalでstale警告を出し、明示確認なしに反映しない。
- [ ] 既存のBefore/After差分UIは維持し、変更点の視認性は落とさない。

**Verification:**
- `npm run test:unit -- src/components/es`
- `npm run test:ui:review -- <ES editor route>`

### Task 6: 合否誤認を避ける品質表示へ変更する

**Files:**
- Modify: `src/components/es/StreamingReviewResponse.tsx`
- Test: `src/components/es/streaming-review-response.regression.test.ts`

- [ ] 「品質スコア」という見出しを「提出前チェック」または「改善観点」に変更する。
- [ ] `S/A/B/C` は廃止し、「確認済み」「要確認」「根拠不足」のような行動ラベルにする。
- [ ] `weak_evidence_notice` と `evidence_coverage_level` は、品質点ではなく根拠制約として別表示する。
- [ ] `degraded` / `soft_ok` の注意文を、提出前に何を確認すべきかへ寄せる。

**Verification:**
- `npm run test:unit -- src/components/es/streaming-review-response.regression.test.ts`
- `npm run lint:ui:guardrails`

## P1: 透明性・品質・契約の強化

### Task 7: `roleSelectionSource` をFastAPIまで型付きで渡す

**Files:**
- Modify: `src/app/api/documents/_services/handle-review-stream.ts`
- Modify: `src/hooks/useESReview.ts`
- Modify: `backend/app/routers/es_review_models.py`
- Modify: `backend/app/routers/es_review_pipeline.py`

- [ ] `RoleContext.source` の許容値を `application_job_type`, `company_doc`, `document_job_type`, `custom`, `none` などに固定する。
- [ ] Next側でUI由来の `roleSelectionSource` をそのまま `user_input` に丸めず、意味のあるsourceとして渡す。
- [ ] 未知sourceはFastAPIで422にする。
- [ ] `review_meta.role_source` はUI表示に使える監査値として返す。

### Task 8: 出典表示をカテゴリ分けする

**Files:**
- Modify: `src/hooks/es-review/types.ts`
- Modify: `src/hooks/es-review/playback.ts`
- Modify: `src/components/es/StreamingReviewResponse.tsx`
- Modify: `backend/app/routers/es_review.py`

- [ ] 出典を「企業情報」「ユーザー情報」「同一ES文脈」「注意が必要な情報」に分類する。
- [ ] プロフィール/ガクチカ/他設問は、外部企業情報と同じ見た目で並べない。
- [ ] 公式サイト、採用サイト、IR、求人媒体、ユーザー追加URLの種別を表示する。
- [ ] 根拠が弱い場合は「企業固有表現を控えめにしています」と明示する。

### Task 9: SSEイベント契約を明文化して堅牢化する

**Files:**
- Modify: `src/hooks/es-review/transport.ts`
- Modify: `src/lib/fastapi/sse-proxy.ts`
- Modify: `backend/app/routers/es_review.py`
- Test: `src/hooks/es-review/transport.test.ts`
- Test: `src/lib/fastapi/sse-proxy.test.ts`

- [ ] SSE parserはblockを空行で分割し、複数 `data:` 行を結合する。
- [ ] `event:`, `id:`, comment lineを破壊せず扱う。
- [ ] `complete` eventには `schemaVersion`, `requestId`, `result`, `creditCost` を含める。
- [ ] unknown eventはログしつつ無視する。
- [ ] `internal_telemetry` がブラウザへ出ない回帰テストを追加する。

### Task 10: テンプレート別ルーブリックと改善説明を構造化する

**Files:**
- Modify: `backend/app/prompts/es_templates.py`
- Modify: `backend/app/routers/es_review_explanation.py`
- Modify: `backend/app/routers/es_review_validation.py`
- Test: `backend/tests/es_review/test_es_review_quality_rubric.py`
- Test: `backend/tests/es_review/test_es_review_final_quality_cases.py`
- Test: `backend/tests/es_review/test_es_review_template_repairs.py`

- [ ] テンプレート別に必須要素、減点条件、根拠必要度、AI臭リスクをSSOT化する。
- [ ] 弱い根拠は「添削品質」ではなく「企業固有情報の制限」として扱う。
- [ ] 改善説明に「評価軸」「改善理由」「根拠の強さ」「提出前注意」を含める。
- [ ] `gakuchika` の定型学び、`self_pr` の抽象強み、志望動機の企業説明化をテンプレート別に抑制する。
- [ ] プロンプト編集後はAI出力品質レビューを実施し、`docs/review/feature/es_review_quality_audit_*.md` に残す。

## P2: プロダクト価値向上

- [ ] 複数案生成: 安全案、攻めた案、短縮案を `variants` としてUI表示する。
- [ ] 面接深掘り質問: 添削後に「このESなら聞かれそうな質問」を提示する。
- [ ] 添削履歴: `documentId`, `sectionId`, `originalTextHash`, `rewrite`, `template`, `model`, `sourcesSnapshot` を保存する。
- [ ] 反映履歴/Undo履歴: どの添削結果を反映し、戻したかを追えるようにする。
- [ ] モデルUX: モデル名ではなく「自然さ重視」「バランス重視」「情報整理重視」「節約」などの説明を前面に出す。
- [ ] 観測指標: 完了率、中断率、first token latency、apply率、copy率、undo率、rerun率、weak evidence率、未確定予約率を取る。

## UI変更ワークフロー

`src/components/**`, `src/app/**/(page|layout|loading).tsx`, `src/components/skeletons/**` を変更する場合は、以下を必ず実行する。

1. 事前: `npm run ui:preflight -- <route> --surface=product --auth=none|guest`
2. 変更中: `npm run lint:ui:guardrails`
3. 事後: `npm run test:ui:review -- <route>`

## 全体検証コマンド

```bash
npm run test:unit -- src/hooks/es-review/transport.test.ts
npm run test:unit -- src/lib/fastapi/sse-proxy.test.ts
npm run test:unit -- src/app/api/documents/_services/handle-review-stream.test.ts
npm run test:unit -- src/components/es
pytest backend/tests/es_review -v
npx tsc --noEmit
npm run lint
```

## 参考

- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [Pydantic v2: Fields](https://docs.pydantic.dev/latest/concepts/fields/)
