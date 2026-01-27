---
name: ukarun:quick
description: よく使うコマンドのショートカット集
---

# Skill: /ukarun:quick - クイックスタートコマンド

## Description
よく使う操作のショートカットコマンド集。

## Commands

### Development
| Command | Description | Action |
|---------|-------------|--------|
| `/ukarun:dev` | 開発サーバー起動 | `npm run dev` |
| `/ukarun:build` | ビルド | `npm run build` |
| `/ukarun:lint` | Lint実行 | `npm run lint` |
| `/ukarun:test` | テスト実行 | `npm run test` |

### Database
| Command | Description | Action |
|---------|-------------|--------|
| `/ukarun:db:push` | スキーマをDBに反映 | `npm run db:push` |
| `/ukarun:db:gen` | マイグレーション生成 | `npm run db:generate` |
| `/ukarun:db:studio` | Drizzle Studio起動 | `npm run db:studio` |

### Backend (FastAPI)
| Command | Description | Action |
|---------|-------------|--------|
| `/ukarun:api` | FastAPI起動 | `cd backend && uvicorn app.main:app --reload` |

### Stripe
| Command | Description | Action |
|---------|-------------|--------|
| `/ukarun:stripe:listen` | Webhook転送 | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` |

### Specification
| Command | Description | Action |
|---------|-------------|--------|
| `/ukarun:spec {section}` | 仕様確認 | See ukarun-spec.md |
| `/ukarun:impl {feature}` | 機能実装 | See ukarun-impl.md |
| `/ukarun:status` | 状況確認 | See ukarun-status.md |

## Quick Feature Implementation

### New Feature Checklist
```
/ukarun:impl {feature}
```
This triggers:
1. Spec loading from SPEC.md
2. Kiro specification workflow
3. Implementation with checklist
4. Validation

### Add Database Table
```
1. Edit src/lib/db/schema.ts
2. /ukarun:db:gen
3. /ukarun:db:push
4. /ukarun:db:studio (verify)
```

### Add API Endpoint
```
1. Create src/app/api/{feature}/route.ts
2. Add auth check
3. Add credit check (if needed)
4. Test with curl/Postman
```

### Add UI Page
```
1. Create src/app/{feature}/page.tsx
2. Create components in src/components/features/{feature}/
3. Add loading states
4. Test on mobile
```

## Workflow Shortcuts

### Start New Feature
```bash
# Full workflow
/kiro:spec-init "{feature}"
/kiro:spec-requirements {feature}
/kiro:spec-design {feature}
/kiro:spec-tasks {feature}
/kiro:spec-impl {feature}
```

### Continue Existing Feature
```bash
/kiro:spec-status {feature}
/kiro:spec-impl {feature}
```

### Validate Implementation
```bash
/kiro:validate-impl {feature}
```
