# データベース設計

Career Compass（就活Pass）のデータベース構造とマイグレーション管理について説明します。

---

## 1. 技術スタック

| 技術 | 用途 |
|-----|------|
| **Supabase** | マネージド PostgreSQL |
| **Drizzle ORM** | TypeScript ORM |
| **drizzle-kit** | マイグレーション生成・管理 |

---

## 2. ディレクトリ構成

```
career_compass/
├── src/lib/db/
│   ├── schema.ts          # テーブル定義（Drizzle スキーマ）
│   └── index.ts           # DB クライアント初期化
│
├── drizzle_pg/            # マイグレーションファイル（PostgreSQL: 現行）
│   ├── 0000_*.sql         # 初期スキーマ
│   ├── 0001_*.sql         # 追加マイグレーション
│   ├── 0002_*.sql         # ...
│   └── meta/              # Drizzle メタデータ
│       ├── _journal.json  # マイグレーション履歴
│       └── 0000_snapshot.json
│
├── drizzle/               # (legacy) Turso/SQLite のマイグレーション（履歴保持）
│
└── drizzle.config.ts      # Drizzle 設定ファイル
```

---

## 3. マイグレーションコマンド

```bash
# スキーマからマイグレーションSQLを生成
npm run db:generate

# マイグレーションをDBに適用（推奨）
npm run db:migrate

# 空のDBに一気に反映したい場合（開発向け）
# npm run db:push

# Drizzle Studio（GUI）を起動
npm run db:studio
```

**注意:** 環境変数は `.env.local` から `dotenv-cli` 経由で読み込まれます。

---

## 4. スキーマ定義の場所

スキーマは `src/lib/db/schema.ts` で定義されています。

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
```

---

## 5. テーブル一覧

### 認証関連（Better Auth）

| テーブル | 用途 |
|---------|------|
| `users` | ユーザー情報 |
| `sessions` | セッション管理 |
| `accounts` | OAuth アカウント連携 |
| `verifications` | メール認証等 |
| `guest_users` | ゲストユーザー（デバイストークン） |
| `login_prompts` | ログイン促進の表示履歴 |

### ユーザープロファイル

| テーブル | 用途 |
|---------|------|
| `user_profiles` | プラン、オンボーディング情報 |
| `notification_settings` | 通知設定 |
| `calendar_settings` | Google カレンダー連携設定 |

### 企業・選考管理

| テーブル | 用途 |
|---------|------|
| `companies` | 企業情報 |
| `applications` | 選考（夏インターン、本選考等） |
| `job_types` | 職種（総合職、エンジニア等） |
| `deadlines` | 締切（ES提出、面接等） |
| `submission_items` | 提出物（履歴書、証明写真等） |

### ES・ドキュメント

| テーブル | 用途 |
|---------|------|
| `documents` | ES、Tips、企業分析 |
| `document_versions` | バージョン履歴 |
| `es_templates` | ESテンプレート |
| `template_likes` | テンプレートいいね |
| `template_favorites` | テンプレートお気に入り |

### ガクチカ

| テーブル | 用途 |
|---------|------|
| `gakuchika_contents` | ガクチカ本文 |
| `gakuchika_conversations` | 深掘りQ&A履歴 |

### AI・チャット

| テーブル | 用途 |
|---------|------|
| `ai_threads` | AI添削スレッド |
| `ai_messages` | AI添削メッセージ |

### タスク・通知

| テーブル | 用途 |
|---------|------|
| `tasks` | タスク管理 |
| `notifications` | 通知 |
| `calendar_events` | カレンダーイベント |

### 課金・クレジット

| テーブル | 用途 |
|---------|------|
| `subscriptions` | Stripe サブスクリプション |
| `credits` | クレジット残高 |
| `credit_transactions` | クレジット履歴 |
| `daily_free_usage` | 日次無料利用回数 |

---

## 6. ER図（主要テーブル）

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │───┬──▶│  companies  │───┬──▶│ applications│
└─────────────┘   │   └─────────────┘   │   └─────────────┘
                  │                     │          │
                  │   ┌─────────────┐   │          │
                  ├──▶│  documents  │───┤          ▼
                  │   └─────────────┘   │   ┌─────────────┐
                  │          │          │   │  deadlines  │
                  │          ▼          │   └─────────────┘
                  │   ┌─────────────┐   │          │
                  │   │  ai_threads │   │          │
                  │   └─────────────┘   │          ▼
                  │          │          │   ┌─────────────┐
                  │          ▼          │   │    tasks    │
                  │   ┌─────────────┐   │   └─────────────┘
                  │   │ ai_messages │   │
                  │   └─────────────┘   │
                  │                     │
                  │   ┌───────────────┐ │
                  ├──▶│gakuchika_    │◀┘
                  │   │   contents   │
                  │   └───────────────┘
                  │          │
                  │          ▼
                  │   ┌───────────────┐
                  │   │gakuchika_    │
                  │   │conversations │
                  │   └───────────────┘
                  │
                  │   ┌─────────────┐
                  └──▶│   credits   │
                      └─────────────┘
```

---

## 7. 主要テーブル詳細

### users テーブル

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER,          -- boolean
  image TEXT,
  created_at INTEGER NOT NULL,     -- timestamp
  updated_at INTEGER NOT NULL      -- timestamp
);
```

### companies テーブル

```sql
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  guest_id TEXT REFERENCES guest_users(id),
  name TEXT NOT NULL,
  industry TEXT,
  recruitment_url TEXT,            -- 採用ページURL
  corporate_url TEXT,              -- 企業サイトURL
  corporate_info_urls TEXT,        -- JSON: 複数URLとタイプ
  notes TEXT,
  status TEXT DEFAULT 'interested',
  sort_order INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  info_fetched_at INTEGER,         -- 情報取得日時
  corporate_info_fetched_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (guest_id) REFERENCES guest_users(id) ON DELETE CASCADE
);
```

### documents テーブル

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  guest_id TEXT REFERENCES guest_users(id),
  company_id TEXT REFERENCES companies(id),
  application_id TEXT REFERENCES applications(id),
  job_type_id TEXT REFERENCES job_types(id),
  type TEXT NOT NULL,              -- 'es' | 'tips' | 'company_analysis'
  title TEXT NOT NULL,
  content TEXT,                    -- JSON: Notion-style blocks
  status TEXT DEFAULT 'draft',     -- 'draft' | 'published' | 'deleted'
  deleted_at INTEGER,              -- ゴミ箱（30日）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### deadlines テーブル

```sql
CREATE TABLE deadlines (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  application_id TEXT REFERENCES applications(id),
  job_type_id TEXT REFERENCES job_types(id),
  type TEXT NOT NULL,              -- 'es_submission' | 'interview_1' | ...
  title TEXT NOT NULL,
  description TEXT,
  memo TEXT,
  due_date INTEGER NOT NULL,       -- timestamp
  is_confirmed INTEGER DEFAULT 0,  -- ユーザー承認済みか
  confidence TEXT,                 -- 'high' | 'medium' | 'low'
  source_url TEXT,
  completed_at INTEGER,
  auto_completed_task_ids TEXT,    -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### credits テーブル

```sql
CREATE TABLE credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0,
  monthly_allocation INTEGER NOT NULL DEFAULT 30,
  partial_credit_accumulator INTEGER NOT NULL DEFAULT 0,
  last_reset_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 8. 型エクスポート

Drizzle ORM では、スキーマから TypeScript 型を自動生成できます。

```typescript
// schema.ts
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

// 使用例
const user: User = await db.query.users.findFirst();
```

---

## 9. マイグレーション履歴

- PostgreSQL（現行）: `drizzle_pg/` と `drizzle_pg/meta/_journal.json`
- legacy（Turso/SQLite）: `drizzle/`（履歴保持。新規変更は `drizzle_pg/` に追加）

---

## 10. データベース接続

```typescript
// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, {
  // Supabase pooler (transaction mode) では prepare を無効化
  prepare: false,
  ssl: "require",
});

export const db = drizzle(client, { schema });
```

---

## 11. クエリ例

### 基本的なクエリ

```typescript
import { db } from "@/lib/db";
import { companies, documents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// 全企業取得
const allCompanies = await db.query.companies.findMany({
  where: eq(companies.userId, userId),
  orderBy: [desc(companies.updatedAt)],
});

// 企業とドキュメントを結合
const companyWithDocs = await db.query.companies.findFirst({
  where: eq(companies.id, companyId),
  with: {
    documents: true,
    applications: {
      with: {
        deadlines: true,
      },
    },
  },
});
```

### 挿入・更新

```typescript
// 挿入
const newCompany = await db.insert(companies).values({
  id: crypto.randomUUID(),
  userId,
  name: "株式会社〇〇",
  industry: "IT",
}).returning();

// 更新
await db.update(companies)
  .set({ status: "applied", updatedAt: new Date() })
  .where(eq(companies.id, companyId));
```

---

## 関連ドキュメント

- [DB_OPERATIONS.md](../setup/DB_OPERATIONS.md) - DB 運用ガイド（ローカル/本番の切り替え・トラブルシューティング）
- [ARCHITECTURE.md](./ARCHITECTURE.md) - システムアーキテクチャ
- [TECH_STACK.md](./TECH_STACK.md) - 使用技術一覧
- [ENV_SETUP.md](../setup/ENV_SETUP.md) - 環境変数設定
