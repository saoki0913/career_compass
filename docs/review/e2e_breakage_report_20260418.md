# E2E 破損レポート — 2026-04-18

## 概要

ローカル開発環境で全 AI 機能の動作検証を実施した。
**4つの主要 AI 機能のうち、3機能（ES添削・ガクチカ・志望動機）がローカルで完全に動作不能**。
面接対策のみ旧認証方式を使用しているため暫定的に動作可能。

---

## 1. クリティカル: `CAREER_PRINCIPAL_HMAC_SECRET` 未設定による全面停止

### 原因

commit `516de9f` ([security] 認証境界とペイロードガードの体系整備) で導入された `fetchFastApiWithPrincipal()` が、新しい環境変数 `CAREER_PRINCIPAL_HMAC_SECRET` を必須とする。この変数が `.env.local` に未設定のため、BFF → FastAPI 呼び出しが即座に例外を投げる。

### エラーメッセージ

```
Error: CAREER_PRINCIPAL_HMAC_SECRET is not configured
    at createCareerPrincipalHeader (src/lib/fastapi/career-principal.ts:92:11)
```

### 影響範囲

| 機能 | 呼び出し元ファイル | 使用関数 | 結果 |
|------|-------------------|---------|------|
| **ES添削** | `src/app/api/documents/_services/handle-review-stream.ts:429` | `fetchFastApiWithPrincipal` | **500 Internal Server Error** |
| **ガクチカ stream** | `src/app/api/gakuchika/fastapi-stream.ts:206` | `fetchFastApiWithPrincipal` | **500 Internal Server Error** |
| **志望動機 stream** | `src/app/api/motivation/[companyId]/conversation/stream/route.ts:209` | `fetchFastApiWithPrincipal` | **503** (graceful error handling あり) |
| **企業RAG取得** | `src/app/api/companies/[id]/fetch-corporate/route.ts:207` | `fetchFastApiWithPrincipal` | **500** |
| **企業RAGアップロード** | `src/app/api/companies/[id]/fetch-corporate-upload/route.ts:314` | `fetchFastApiWithPrincipal` | **500** |
| **企業RAG削除** | `src/app/api/companies/[id]/delete-corporate-urls/route.ts:184` | `fetchFastApiWithPrincipal` | **500** |
| **企業RAG見積** | `src/app/api/companies/[id]/fetch-corporate/estimate/route.ts:470` | `fetchFastApiWithPrincipal` | **500** |

### 安全な機能（旧方式 `fetchFastApiInternal` を使用）

| 機能 | ファイル | 使用関数 | 状態 |
|------|---------|---------|------|
| **面接対策** | `src/app/api/companies/[id]/interview/stream-utils.ts:169` | `fetchFastApiInternal` | 動作可能 |

### バックエンド側の二重ガード

FastAPI 側でも `require_career_principal()` 依存が各ルーターに追加されているため、仮に BFF 側で secret を設定しても、FastAPI 側の `.env` にも同じ secret が必要:

- `backend/app/routers/es_review.py:1190` — `require_career_principal("ai-stream")`
- `backend/app/routers/gakuchika.py:867` — `require_career_principal("ai-stream")`
- `backend/app/routers/motivation.py:3193` — `require_career_principal("ai-stream")`
- `backend/app/routers/company_info.py` — 9箇所で `require_career_principal("company")`

### 修正に必要なアクション

1. 32文字以上のランダム文字列を生成
2. **フロントエンド** `.env.local` に `CAREER_PRINCIPAL_HMAC_SECRET=<値>` を追加
3. **バックエンド** `.env` に `CAREER_PRINCIPAL_HMAC_SECRET=<同じ値>` を追加
4. 両サーバーを再起動

---

## 2. Vitest 単体テスト失敗 — 3件

### 2a. `src/app/api/gakuchika/[id]/generate-es-draft/route.test.ts`

**エラー:** `TypeError: db.select(...).from(...).where(...).limit is not a function`
**場所:** `route.ts:160`
**原因:** Drizzle ORM の `select().from().where().limit()` チェーンでモックが `.limit()` を提供していない。実コードでは `gakuchikaContents` テーブルからの取得で `.limit(1)` を呼んでおり、テストモックが追随できていない。
**影響:** ガクチカ ES 下書き生成 API がテストで検証不能。

### 2b. `src/app/api/companies/[id]/fetch-info/route.test.ts` — 2件

**エラー:** `expected 500 to be 400`
**テスト名:**
- `returns 400 for login-required URLs`
- `returns 400 without calling backend when the url resolves to a private address`
**原因:** URL バリデーション（ログイン必須 URL / プライベートアドレス）が 400 ではなく 500 を返すようになった。バリデーションロジック内で未処理例外が発生している可能性。
**影響:** 企業情報取得 API のセキュリティバリデーションが 500 でクラッシュ。

---

## 3. Backend pytest 失敗 — 2件

### 3a. `test_upload_pdf_uses_high_accuracy_ocr_for_standard_ir_materials`

**エラー:** `assert ['high_accuracy'] == ['default', 'high_accuracy']`
**原因:** PDF アップロード時の OCR モード選択ロジックが変更され、`default` モードの呼び出しがスキップされるようになった。
**影響:** 企業 PDF の OCR 処理が期待通りのマルチパスで動作していない。

### 3b. `test_scenario2_same_focus_blocked_after_two_attempts`

**エラー:** `STAR ループ防止: same focus streak must be <= 3, got 6. Focus sequence: ['task', 'task', 'task', 'task', 'task', 'task']`
**原因:** ガクチカの質問生成で同じ STAR フォーカス（task）が6回連続している。ループ防止ロジックが機能していない。
**影響:** ガクチカ深掘り会話で同じ種類の質問が繰り返され、ユーザー体験が低下。

---

## 4. TypeScript 型エラー — 152件（全てテストファイル）

**本番コードの型エラー: 0件** — ビルドは正常に通る。

テストファイルのみで型エラーが発生。主な原因:
- `TS2304` (57件): `expect`, `describe`, `it` などの Vitest グローバル型が解決できない（tsconfig のテスト設定不足）
- `TS2582` (23件): 同様の問題
- `TS2322` (23件): 型不一致

これらはテスト実行自体には影響しない（Vitest が独自に型を注入するため）。

---

## 5. 動作確認済みテスト — パスした項目

| テストスイート | 結果 | 詳細 |
|-------------|------|------|
| Guest major E2E | **1/1 パス** | ゲストコア機能（企業・ES一覧・タスク等）正常 |
| Auth boundary E2E | **3/3 パス** | ゲストセッション永続化・クリア正常 |
| Regression bugs E2E | **7/7 パス** | 業界自動反映・ES作成・クレジット表示等正常 |
| Motivation mock E2E | **4/4 パス** | ゲスト制限・デスクトップ/モバイル表示・ストリーム失敗復旧正常 |
| Backend deterministic | **1088/1090 パス** | AI 機能の構造テスト正常 |
| Vitest unit | **609/612 パス** | 大部分の API ルートテスト正常 |
| ES Review staging live | **8/8 パス** | staging 環境では正常動作 |

---

## 6. 機能別破損サマリー

| 機能 | ローカル動作 | 根本原因 | 緊急度 |
|------|------------|---------|-------|
| **ES添削** | 完全停止 (500) | `CAREER_PRINCIPAL_HMAC_SECRET` 未設定 | CRITICAL |
| **ガクチカ stream** | 完全停止 (500) | `CAREER_PRINCIPAL_HMAC_SECRET` 未設定 | CRITICAL |
| **ガクチカ ES下書き** | テスト失敗 | Drizzle `.limit()` モック不整合 | HIGH |
| **ガクチカ STAR ループ** | ロジック不備 | 同一フォーカス繰り返し制御が非機能 | MEDIUM |
| **志望動機 stream** | エラー (503) | `CAREER_PRINCIPAL_HMAC_SECRET` 未設定（graceful handling あり） | CRITICAL |
| **面接対策** | 動作可能 | 旧認証方式 `fetchFastApiInternal` 使用中 | OK（暫定） |
| **企業RAG全般** | 完全停止 (500) | `CAREER_PRINCIPAL_HMAC_SECRET` 未設定 | CRITICAL |
| **企業情報URL検証** | 500 クラッシュ | URL バリデーション内で未処理例外 | HIGH |
| **企業PDF OCR** | ロジック不備 | マルチパスOCR のデフォルトモードスキップ | MEDIUM |

---

## 7. 修正優先度

### 最優先（全 AI 機能の復旧）
1. `.env.local`（フロントエンド + バックエンド）に `CAREER_PRINCIPAL_HMAC_SECRET` を設定

### 高（テスト・ロジック修正）
2. 企業情報 URL バリデーション — 500 → 400 に修正
3. ガクチカ ES 下書き — Drizzle モック修正
4. ガクチカ STAR ループ防止ロジック修正

### 中（テスト基盤）
5. PDF OCR マルチパスロジック修正
6. テストファイルの tsconfig 型設定整理（152件の型エラー解消）
