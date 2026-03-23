---
name: dev-continue
description: 開発を開始/再開する。プロジェクト状態を自動判定し、進行中タスクの再開または次の機能を提案。
user-invocable: true
---

# Skill: /dev-continue - 開発継続コマンド

## Description
開発を適切に開始または再開するためのコマンド。プロジェクトの状態を自動判定し、次のアクションを提案・実行する。

## Trigger
- `/dev-continue` - 開発を開始/再開
- `/dev-continue {feature}` - 特定機能の開発を再開

## Workflow

### Step 1: Load Project Context
```
1. Read CLAUDE.md (プロジェクト設定)
2. Read .kiro/steering/*.md (Steering設定)
3. Read docs/SPEC.md (機能仕様)
```

### Step 2: Check Current State

#### 2.1 Check for In-Progress Specs
```
Scan .kiro/specs/*/tasks.md for:
- [ ] Incomplete tasks (未完了タスク)
- [x] Completed tasks (完了タスク)
```

#### 2.2 Check Git Status
```bash
git status
git log -3 --oneline
```

#### 2.3 Check Development Environment
```bash
# Node modules
ls node_modules/.package-lock.json

# Environment variables
cat .env.local 2>/dev/null || echo "No .env.local found"

# Database status
npm run db:studio --help 2>/dev/null
```

### Step 3: Determine Action

```
IF in-progress spec exists:
  → Resume that feature implementation

ELIF uncommitted changes exist:
  → Show changes, ask user what to do

ELIF recent commit is WIP:
  → Resume from that point

ELSE:
  → Suggest next feature based on dependency order
```

### Step 4: Execute Action

#### Resume In-Progress Feature
```
1. Load spec from .kiro/specs/{feature}/
2. Show progress summary
3. List remaining tasks
4. Start next incomplete task
```

#### Start New Feature
```
1. Check implementation order
2. Verify dependencies are complete
3. Initialize spec if needed
4. Begin implementation
```

---

## Implementation Order (Dependencies)

```
Phase 1: Foundation
  ├── auth (認証) ← 最優先
  ├── plans (プラン管理)
  └── credits (クレジット)

Phase 2: Core Features
  ├── onboarding (オンボーディング)
  ├── companies (企業登録)
  └── dashboard (ダッシュボード)

Phase 3: Business Logic
  ├── company-info (企業情報取得)
  ├── applications (応募枠)
  ├── deadlines (締切)
  └── notifications (通知)

Phase 4: Main Features
  ├── tasks (タスク管理)
  ├── es-editor (ESエディタ)
  ├── ai-review (AI添削)
  └── gakuchika (ガクチカ)

Phase 5: Integration
  ├── calendar (カレンダー)
  └── templates (テンプレ共有)
```

---

## Output Format

### When Resuming
```markdown
# 🔄 開発再開: {feature}

## 現在の進捗
- 完了: 5/12 タスク (42%)
- 残り: 7 タスク

## 直近の作業
- [x] データベーススキーマ作成
- [x] API基本ルート作成
- [ ] ← **次のタスク**: 企業一覧API実装

## 次のアクション
企業一覧APIを実装します。

---
続行しますか？ (y/n)
```

### When Starting New
```markdown
# 🚀 新規開発開始

## プロジェクト状況
- 完了済み: auth, plans
- 未着手: credits, onboarding, companies...

## 推奨: `credits` (クレジット機能)

### 理由
- `plans` が完了済み（依存関係クリア）
- 他の多くの機能が依存している
- SPEC.md Section 4 に詳細仕様あり

## 次のアクション
クレジット機能の仕様作成を開始します。

```bash
/kiro:spec-init "クレジット機能の実装"
```

---
続行しますか？ (y/n)
```

---

## Feature Status Detection

### Database Check
```typescript
// Check if table exists in schema
const schemaContent = await readFile('src/lib/db/schema.ts');
const hasTable = schemaContent.includes(`export const ${feature}s`);
```

### API Check
```typescript
// Check if API route exists
const apiExists = await exists(`src/app/api/${feature}/route.ts`);
```

### UI Check
```typescript
// Check if page exists
const pageExists = await exists(`src/app/${feature}/page.tsx`);
```

### Test Check
```typescript
// Check if test exists
const testExists = await exists(`e2e/${feature}.spec.ts`);
```

---

## Quick Resume Commands

After running `/dev-continue`, you can use:

```bash
# Continue with suggested action
y または Enter

# Skip to specific task
/kiro:spec-impl {feature} --task {task-number}

# Check full status
/ukarun:status {feature}

# View spec details
/ukarun:spec {section}
```

---

## Environment Validation

Before starting development, verify:

```bash
# 1. Dependencies installed?
npm list --depth=0

# 2. Environment configured?
Required vars in .env.local:
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- BETTER_AUTH_SECRET
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- STRIPE_SECRET_KEY

# 3. Database accessible?
npm run db:studio

# 4. Dev server working?
npm run dev
```

If any check fails, show fix instructions.

---

## Error Recovery

### Missing Dependencies
```
⚠️ node_modules not found

Fix: npm install
```

### Missing Environment
```
⚠️ .env.local not found

Fix:
1. cp .env.example .env.local
2. Fill in required values
3. See docs/setup/DEVELOPMENT_AND_ENV.md for details
```

### Database Not Synced
```
⚠️ Schema changes detected

Fix: npm run db:push
```

---

## Integration with Other Commands

`/dev-continue` internally uses:
- `/ukarun:status` - 状況確認
- `/ukarun:spec` - 仕様確認
- `/kiro:spec-status` - Spec進捗
- `/kiro:spec-impl` - 実装継続
