---
name: ukarun:status
description: プロジェクト全体または特定機能の開発状況を確認
---

# Skill: /ukarun:status - 開発状況確認コマンド

## Description
プロジェクト全体および各機能の実装状況を確認する。

## Trigger
- `/ukarun:status` - 全体の開発状況を表示
- `/ukarun:status {feature}` - 特定機能の詳細状況を表示

## Workflow

### 1. Check Existing Specs
Scan `.kiro/specs/` directory for existing specifications.

### 2. Check Implementation Status
For each feature, check:
- Database schema exists
- API routes exist
- UI pages exist
- Tests exist

### 3. Generate Report

## Output Format

### Overall Status
```
# ウカルン 開発状況

## Completed Features
- [x] auth - 認証・アカウント (Basic setup)
- [x] stripe - Stripe連携 (Checkout, Webhooks)

## In Progress
- [ ] companies (spec: done, impl: 50%)
- [ ] dashboard (spec: in_progress)

## Not Started
- [ ] onboarding
- [ ] es-editor
- [ ] ai-review
- [ ] gakuchika
- [ ] calendar
- [ ] notifications

## Infrastructure
- [x] Next.js setup
- [x] Drizzle ORM + Turso
- [x] Better Auth
- [x] Stripe integration
- [x] Cloudflare R2
- [ ] FastAPI backend (AI features)

## Next Recommended
Based on dependencies: `onboarding` → `companies` → `dashboard`
```

### Feature Detail Status
```
# Feature: companies

## Specification Status
- spec.json: ✅
- requirements.md: ✅
- design.md: ✅
- tasks.md: ✅ (8/12 completed)

## Implementation Status

### Database
- [x] companies table
- [x] company relations
- [ ] indexes

### API Routes
- [x] GET /api/companies
- [x] POST /api/companies
- [ ] PUT /api/companies/[id]
- [ ] DELETE /api/companies/[id]

### UI Pages
- [x] /companies (list)
- [ ] /companies/new
- [ ] /companies/[id] (detail)

### Tests
- [ ] e2e/companies.spec.ts

## Blocking Issues
- None

## Next Steps
1. Implement company update API
2. Create company detail page
3. Add E2E tests
```

## Implementation

```typescript
// Check for files
const checkFeatureStatus = async (feature: string) => {
  const specPath = `.kiro/specs/${feature}`;
  const apiPath = `src/app/api/${feature}`;
  const pagePath = `src/app/${feature}`;
  const testPath = `e2e/${feature}.spec.ts`;

  return {
    hasSpec: await exists(specPath),
    hasApi: await exists(apiPath),
    hasPages: await exists(pagePath),
    hasTests: await exists(testPath),
  };
};
```
