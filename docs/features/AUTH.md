# 認証・ユーザー管理

Better Auth + Google OAuth による認証と、ゲストユーザーシステムを含むユーザー管理機能。

**参照実装**:
- `src/lib/auth/` — 認証設定（クライアント・サーバー・ゲスト）
- `src/app/(auth)/` — ログイン・オンボーディングページ
- `src/app/api/auth/` — 認証API
- `src/components/auth/` — 認証UIコンポーネント

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **認証フレームワーク** | Better Auth（TypeScript） |
| **OAuthプロバイダー** | Google |
| **ゲストユーザー** | デバイストークンベース（7日間有効） |
| **オンボーディング** | プラン選択 → プロフィール入力 |
| **データ分離** | `userId` / `guestId` のXOR制約 |

---

## 2. ユーザータイプ

| タイプ | 認証方法 | 有効期限 | 機能制限 |
|--------|---------|---------|---------|
| **認証ユーザー** | Google OAuth | 無期限（セッション管理） | プラン準拠 |
| **ゲストユーザー** | デバイストークン（`localStorage`） | 7日間 | 無料プラン以下 |

---

## 3. 認証フロー

### 3.1 Google OAuthログイン

```
ログインページ（/(auth)/login）
  ↓
GoogleSignInButton クリック
  → Better Auth OAuth フロー
  → Google認証画面にリダイレクト
  ↓
認証成功
  → users テーブルにユーザー作成/更新
  → accounts テーブルにOAuthアカウント保存
  → sessions テーブルにセッション作成
  ↓
オンボーディング判定
  → userProfiles.onboardingCompleted === false の場合
  → /(auth)/onboarding にリダイレクト
  → プラン選択 → プロフィール入力
  ↓
ダッシュボードにリダイレクト
```

### 3.2 ゲストユーザーフロー

```
初回アクセス（未ログイン）
  ↓
デバイストークンを自動生成（localStorage保存）
  → POST /api/auth/guest
  → guestUsers テーブルにレコード作成
  → expiresAt = 7日後
  ↓
ゲストとして機能利用
  → x-device-token ヘッダーで認証
  → 各テーブルの guestId に紐づけ
  ↓
ログイン時のデータ移行
  → POST /api/guest/migrate
  → ゲストデータを認証ユーザーに移行
  → guestUsers.migratedToUserId にユーザーID記録
```

---

## 4. ログインプロンプト管理

ゲストユーザーに対し、機能ごとに1回限りのログイン促進ダイアログを表示する。

```
ゲストが機能初回利用
  ↓
loginPrompts テーブルをチェック
  → 該当 feature が未表示ならダイアログ表示
  → 表示後に loginPrompts にレコード追加（再表示しない）
```

**対象機能例**: `calendar`, `ai_review`, `settings`, `notifications`

---

## 5. オンボーディング

### プラン選択（PlanSelectionCard）

| プラン | 説明 |
|--------|------|
| Free | 基本機能、月3回のES添削 |
| Standard | 全機能、月次クレジット付与 |
| Pro | 全機能＋上限緩和、優先サポート |

### プロフィール入力

| フィールド | 説明 |
|-----------|------|
| `university` | 大学名 |
| `faculty` | 学部・学科 |
| `graduationYear` | 卒業年度 |
| `targetIndustries` | 志望業界（JSON配列） |
| `targetJobTypes` | 志望職種（JSON配列） |

---

## 6. DBテーブル

### Better Auth管理テーブル

| テーブル | 説明 |
|----------|------|
| `users` | ユーザー基本情報（id, name, email, image） |
| `sessions` | セッション管理（token, expiresAt, ipAddress, userAgent） |
| `accounts` | OAuthアカウント（providerId, accountId, accessToken） |
| `verifications` | メール/電話認証（identifier, value, expiresAt） |

### アプリ固有テーブル

#### `guestUsers`

| カラム | 型 | 説明 |
|--------|-----|------|
| `deviceToken` | `text (UNIQUE)` | デバイストークン |
| `expiresAt` | `timestamptz` | 有効期限（7日間） |
| `migratedToUserId` | `text (FK)` | 移行先ユーザーID |

#### `userProfiles`（1ユーザー1レコード）

| カラム | 型 | 説明 |
|--------|-----|------|
| `plan` | `"free" \| "standard" \| "pro"` | 選択プラン |
| `planSelectedAt` | `timestamptz` | プラン選択日時 |
| `onboardingCompleted` | `boolean` | オンボーディング完了フラグ |
| `university` | `text` | 大学名 |
| `faculty` | `text` | 学部・学科 |
| `graduationYear` | `integer` | 卒業年度 |
| `targetIndustries` | `text (JSON)` | 志望業界 |
| `targetJobTypes` | `text (JSON)` | 志望職種 |

#### `loginPrompts`

| カラム | 型 | 説明 |
|--------|-----|------|
| `guestId` | `text (FK, NOT NULL)` | ゲストユーザーID |
| `feature` | `text` | 機能名（`calendar`, `ai_review`等） |
| `shownAt` | `timestamptz` | 表示日時 |

**一意制約**: `(guestId, feature)` — 機能ごとに1回のみ

---

## 7. データ分離（XOR制約）

各テーブルで `userId` と `guestId` はXOR制約により排他的:

```sql
CHECK ((user_id IS NULL) <> (guest_id IS NULL))
```

**対象テーブル**: `companies`, `documents`, `tasks`, `notifications`, `gakuchikaContents`, `dailyFreeUsage`, `esTemplates`

---

## 8. APIルート

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| ALL | `/api/auth/[...all]` | Better Auth ハンドラ（ログイン、ログアウト、セッション管理） |
| POST | `/api/auth/guest` | ゲストセッション作成 |
| POST | `/api/auth/onboarding` | オンボーディング完了処理 |
| POST | `/api/auth/plan` | プラン選択 |
| POST | `/api/guest/migrate` | ゲスト → 認証ユーザーへのデータ移行 |

---

## 9. セキュリティ

- **セッショントークン**: Better Authの安全なトークン管理
- **OAuthトークン**: Google OAuth アクセス/リフレッシュトークンはDB保存
- **デバイストークン**: `crypto.randomUUID()` で生成、`localStorage` に保存
- **XOR制約**: ユーザーデータの意図しない混在を防止
- **IP/UserAgent記録**: セッションにアクセス元情報を保存

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/lib/auth/index.ts` | サーバーサイド認証設定 |
| `src/lib/auth/client.ts` | クライアントサイド認証フック |
| `src/lib/auth/device-token.ts` | デバイストークン管理 |
| `src/lib/auth/guest.ts` | ゲストユーザーユーティリティ |
| `src/app/(auth)/login/page.tsx` | ログインページ |
| `src/app/(auth)/onboarding/page.tsx` | オンボーディングページ |
| `src/app/api/auth/[...all]/route.ts` | Better Auth APIハンドラ |
| `src/app/api/auth/guest/route.ts` | ゲスト認証API |
| `src/app/api/auth/onboarding/route.ts` | オンボーディングAPI |
| `src/app/api/guest/migrate/route.ts` | ゲストデータ移行API |
| `src/components/auth/AuthProvider.tsx` | 認証コンテキストプロバイダー |
| `src/components/auth/GoogleSignInButton.tsx` | Googleログインボタン |
| `src/components/auth/PlanSelectionCard.tsx` | プラン選択UI |
| `src/lib/db/schema.ts` | DBスキーマ（`users`, `sessions`, `accounts`, `guestUsers`, `userProfiles`, `loginPrompts`） |
