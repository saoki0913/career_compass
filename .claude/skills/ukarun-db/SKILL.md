---
name: ukarun:db
description: データベース操作ガイド。Drizzle ORM + Turso
---

# Skill: ウカルン データベース操作

Use this skill when working with the database schema, migrations, or queries for the Career Compass (ウカルン) application.

## When to Use
- User asks to create/modify database tables
- User mentions "schema", "database", "migration"
- User wants to add new data models

## Context
- **ORM**: Drizzle ORM
- **Database**: Turso (libSQL/SQLite)
- **Schema Location**: `src/lib/db/schema.ts`
- **Client Location**: `src/lib/db/index.ts`

## Workflow

### 1. Schema Definition
Add tables to `src/lib/db/schema.ts` following Drizzle conventions:

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Table definition
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  industry: text('industry'),
  officialUrl: text('official_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Relations
export const companyRelations = relations(companies, ({ one, many }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id],
  }),
  applications: many(applications),
}));
```

### 2. Core Tables Reference

Based on SPEC.md, the app needs these tables:

#### Authentication (Better Auth managed)
- `users` - User accounts
- `accounts` - OAuth accounts
- `sessions` - User sessions

#### Business Logic
- `companies` - 企業登録
- `applications` - 応募枠
- `deadlines` - 締切
- `documents` - ES/Tips/企業分析
- `document_versions` - 編集履歴
- `tasks` - タスク
- `templates` - ESテンプレ
- `gakuchika_materials` - ガクチカ素材
- `ai_threads` - AIチャットスレッド
- `ai_messages` - AIチャット履歴

#### Credits & Subscriptions
- `credits` - クレジット残高
- `credit_transactions` - 消費履歴
- `subscriptions` - サブスクリプション

#### Notifications
- `notifications` - 通知

### 3. Type Inference
Export types from schema:
```typescript
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
```

### 4. Migration Commands
```bash
npm run db:generate  # Generate migration files
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio for debugging
```

### 5. Query Patterns

#### Basic CRUD
```typescript
import { db } from '@/lib/db';
import { companies, eq } from '@/lib/db/schema';

// Select
const company = await db.query.companies.findFirst({
  where: eq(companies.id, companyId),
  with: { applications: true }
});

// Insert
await db.insert(companies).values({
  id: generateId(),
  userId: user.id,
  name: '株式会社Example'
});

// Update
await db.update(companies)
  .set({ name: newName, updatedAt: new Date() })
  .where(eq(companies.id, companyId));

// Delete
await db.delete(companies).where(eq(companies.id, companyId));
```

#### Soft Delete Pattern (for ES documents)
```typescript
// Use deletedAt field instead of hard delete
await db.update(documents)
  .set({ deletedAt: new Date() })
  .where(eq(documents.id, docId));

// Query excluding deleted
const docs = await db.query.documents.findMany({
  where: isNull(documents.deletedAt)
});

// Auto-cleanup after 30 days (cron job)
await db.delete(documents)
  .where(lt(documents.deletedAt, thirtyDaysAgo));
```

### 6. Indexes
Add indexes for frequently queried columns:
```typescript
export const companies = sqliteTable('companies', {
  // ... columns
}, (table) => ({
  userIdIdx: index('company_user_id_idx').on(table.userId),
  nameIdx: index('company_name_idx').on(table.name),
}));
```

### 7. JST Considerations
Always store timestamps in UTC, convert to JST for display:
```typescript
// Store as UTC
createdAt: integer('created_at', { mode: 'timestamp' })

// Display as JST
const jstDate = new Date(utcDate.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
```

## Validation
After schema changes:
1. Run `npm run db:generate`
2. Review generated migration
3. Run `npm run db:push`
4. Test with `npm run db:studio`
