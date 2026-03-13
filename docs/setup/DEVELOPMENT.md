# Development Guide - 就活Compass (シューパス)

## 🚀 開発を始める/再開する

```
/dev-continue
```

**これだけでOK！** このコマンドが自動で:
1. プロジェクトの現在状態を確認
2. 進行中のタスクがあれば再開
3. なければ次に取り組むべき機能を提案
4. 必要なコンテキストをロード

---

## Quick Start

### 1. 環境セットアップ

> 📖 詳細は [ENV_SETUP.md](./ENV_SETUP.md) を参照

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env.local
# .env.local を編集して必要な値を設定
# → 詳細: docs/ENV_SETUP.md

# データベースセットアップ（→ 詳細: docs/setup/DB_OPERATIONS.md）
npm run db:push

# 開発サーバー起動
npm run dev
```

### 2. バックエンド (FastAPI) セットアップ

```bash
cd backend

# 仮想環境作成
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係インストール
pip install -r requirements.txt

# 開発サーバー起動
uvicorn app.main:app --reload --port 8000
```

---

## Claude Code カスタムコマンド

このプロジェクトでは開発効率化のためのカスタムコマンド（Skills）を用意しています。

### 最重要コマンド
```
/dev-continue             # 開発を開始/再開（自動判定）
/dev-continue {feature}   # 特定機能の開発を再開
```

### 仕様確認
```
/ukarun:spec {section}    # SPEC.mdの特定セクションを表示
/ukarun:spec list         # 全セクション一覧
/ukarun:spec search {kw}  # キーワード検索
```

### 開発状況確認
```
/ukarun:status            # 全体の開発状況
/ukarun:status {feature}  # 特定機能の詳細
```

### 機能実装
```
/ukarun:impl {feature}    # 機能実装を開始
```

### クイックコマンド
```
/ukarun:dev               # npm run dev
/ukarun:build             # npm run build
/ukarun:test              # npm run test
/ukarun:db:push           # npm run db:push
/ukarun:db:studio         # npm run db:studio
```

---

## Kiro Spec-Driven Development

新機能の実装は Kiro ワークフローに従います。

### Phase 1: Specification

```bash
# 1. 仕様初期化
/kiro:spec-init "企業登録機能の実装"

# 2. 要件定義
/kiro:spec-requirements companies

# 3. 設計
/kiro:spec-design companies

# 4. タスク分解
/kiro:spec-tasks companies
```

### Phase 2: Implementation

```bash
# 実装開始
/kiro:spec-impl companies

# 進捗確認
/kiro:spec-status companies
```

### Phase 3: Validation

```bash
# 実装検証
/kiro:validate-impl companies
```

---

## 機能一覧と依存関係

```
auth (認証)
  └── plans (プラン)
        └── credits (クレジット)

onboarding (オンボーディング)
  └── dashboard (ダッシュボード)
        ├── notifications (通知)
        └── tasks (タスク)

companies (企業登録)
  └── company-info (企業情報取得)
        └── applications (応募枠)
              └── deadlines (締切)
                    └── calendar (カレンダー)

es-editor (ESエディタ)
  └── ai-review (AI添削)
        └── templates (テンプレ)

gakuchika (ガクチカ)
```

### 推奨実装順序

1. **auth** - Better Auth 設定（完了）
2. **plans** - プラン管理
3. **credits** - クレジットシステム
4. **onboarding** - オンボーディング
5. **companies** - 企業登録
6. **dashboard** - ダッシュボード
7. **notifications** - 通知
8. **company-info** - 企業情報取得
9. **applications** - 応募枠
10. **deadlines** - 締切承認
11. **tasks** - タスク管理
12. **es-editor** - ESエディタ
13. **ai-review** - AI添削
14. **gakuchika** - ガクチカ深掘り
15. **calendar** - カレンダー連携
16. **templates** - テンプレ共有

---

## コーディング規約

### TypeScript/React

```typescript
// コンポーネント: Named export + 関数コンポーネント
export function CompanyCard({ company }: Props) {
  return <div>...</div>;
}

// 型定義: PascalCase
type CompanyData = {
  id: string;
  name: string;
};

// Server Action
'use server';
export async function createCompany(data: FormData) {
  // ...
}
```

### データベース

```typescript
// テーブル名: snake_case (複数形)
export const companies = sqliteTable('companies', {
  // カラム名: snake_case
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }),
});
```

### API レスポンス

```typescript
// 成功
{ data: {...}, meta?: {...} }

// エラー
{ error: 'ERROR_CODE', message: '...' }

// ページネーション
{ data: [...], pagination: { total, page, perPage, hasMore } }
```

---

## テスト

### E2E テスト実行

```bash
npm run test              # ヘッドレス実行
npm run test:ui           # UI付きで実行
npm run test:headed       # ブラウザ表示

# 特定テスト
npx playwright test companies
```

### テストファイル構造

```
e2e/
├── fixtures/
│   └── auth.ts           # 認証フィクスチャ
├── pages/
│   └── DashboardPage.ts  # Page Object
├── companies/
│   └── registration.spec.ts
└── credits/
    └── consumption.spec.ts
```

---

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `DATABASE_URL` | Supabase Postgres 接続URL（推奨: Pooler/6543） | ✅ |
| `DIRECT_URL` | Supabase Postgres 直通URL（5432, マイグレーション推奨） | 🔶 |
| `BETTER_AUTH_SECRET` | 認証シークレット | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth ID | ✅ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | ✅ |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook シークレット | ✅ |

---

## トラブルシューティング

### よくある問題

**Q: データベース接続エラー**
```bash
# 接続確認（psql が入っている場合）
psql \"$DIRECT_URL\"
```

**Q: Stripe Webhookが受信できない**
```bash
# Stripe CLIでローカル転送
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Q: 型エラーが出る**
```bash
# 型生成
npm run db:generate

# TypeScript再起動
# VSCode: Cmd+Shift+P > TypeScript: Restart TS Server
```

---

## 参考リンク

- [SPEC.md](../SPEC.md) - 機能仕様書
- [DB_OPERATIONS.md](./DB_OPERATIONS.md) - DB 運用ガイド（ローカル/本番切り替え）
- [ENV_SETUP.md](./ENV_SETUP.md) - 環境設定ガイド
- [MCP_SETUP.md](./MCP_SETUP.md) - MCPサーバー設定
- [Next.js Docs](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Better Auth Docs](https://www.better-auth.com/)
- [Stripe Docs](https://stripe.com/docs)
