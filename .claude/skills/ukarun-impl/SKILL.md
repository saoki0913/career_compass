---
name: ukarun:impl
description: 指定機能の実装を開始。Kiroワークフローに従う。/ukarun:impl companies など
---

# Skill: /ukarun:impl - 機能実装コマンド

## Description
ウカルンの機能をSpec-Driven Developmentで実装するコマンド。SPEC.mdから仕様を読み込み、Kiroワークフローに従って開発を進める。

## Trigger
- `/ukarun:impl {feature-name}` - 指定機能の実装を開始
- `/ukarun:impl` - 実装可能な機能一覧を表示

## Available Features
Based on SPEC.md sections:
- `auth` - 認証・アカウント (Section 2)
- `plans` - 料金・プラン・制限 (Section 3)
- `credits` - クレジット仕様 (Section 4)
- `onboarding` - オンボーディング (Section 6)
- `dashboard` - ダッシュボード (Section 7)
- `companies` - 企業登録 (Section 8)
- `company-info` - 企業情報取得/更新 (Section 9)
- `applications` - 応募枠 (Section 10)
- `deadlines` - 締切承認UX (Section 11)
- `notifications` - 通知 (Section 12)
- `tasks` - タスク・進捗管理 (Section 13)
- `calendar` - カレンダー連携 (Section 14)
- `es-editor` - ESエディタ (Section 15)
- `ai-review` - AI添削 (Section 16)
- `gakuchika` - ガクチカ深掘りBot (Section 17)
- `templates` - ESテンプレ (Section 16.9)

## Workflow

### Step 1: Load Context
```
1. Read docs/SPEC.md
2. Read .kiro/steering/*.md
3. Check .kiro/specs/{feature}/ if exists
```

### Step 2: Create/Update Specification
If spec doesn't exist:
```
/kiro:spec-init "{feature} implementation based on SPEC.md Section X"
/kiro:spec-requirements {feature}
/kiro:spec-design {feature}
/kiro:spec-tasks {feature}
```

If spec exists, check status:
```
/kiro:spec-status {feature}
```

### Step 3: Implementation
```
/kiro:spec-impl {feature}
```

### Step 4: Validation
```
/kiro:validate-impl {feature}
```

## Implementation Checklist

For each feature, ensure:

### Database
- [ ] Schema defined in `src/lib/db/schema.ts`
- [ ] Migrations generated (`npm run db:generate`)
- [ ] Schema pushed (`npm run db:push`)

### API
- [ ] Routes created in `src/app/api/{feature}/`
- [ ] Authentication checks in place
- [ ] Credit/limit checks where needed
- [ ] Error handling implemented
- [ ] Response format matches spec

### UI
- [ ] Pages created in `src/app/{feature}/`
- [ ] Components in `src/components/features/{feature}/`
- [ ] Loading states implemented
- [ ] JST timezone for date displays
- [ ] Mobile responsive

### Tests
- [ ] E2E tests in `e2e/{feature}.spec.ts`
- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Credit consumption tested

## Example Usage

```
User: /ukarun:impl companies