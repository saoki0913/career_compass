---
name: ukarun:feature
description: 機能開発の総合ガイド。実装パターン、チェックリスト
---

# Skill: ウカルン機能開発

Use this skill when implementing new features for the Career Compass (ウカルン) application. This skill provides context-aware guidance for feature development following the project's specifications.

## When to Use
- User asks to implement a new feature from SPEC.md
- User mentions feature names like "企業登録", "ES添削", "ガクチカ", etc.
- User wants to add functionality to the app

## Workflow

### 1. Feature Context Loading
First, load the relevant context:
```
1. Read /docs/SPEC.md for full specification
2. Read .kiro/steering/*.md for project context
3. Check .kiro/specs/ for existing specifications
```

### 2. Specification-Driven Development
Follow the Kiro workflow:
```
Phase 1 (Specification):
  /kiro:spec-init "{feature-description}"
  /kiro:spec-requirements {feature}
  /kiro:spec-design {feature}
  /kiro:spec-tasks {feature}

Phase 2 (Implementation):
  /kiro:spec-impl {feature}
```

### 3. Implementation Guidelines

#### Database Changes
1. Add schema to `src/lib/db/schema.ts`
2. Run `npm run db:generate` then `npm run db:push`
3. Create indexes for frequently queried fields

#### API Endpoints
1. Create route in `src/app/api/{feature}/route.ts`
2. Use proper HTTP methods (GET, POST, PUT, DELETE)
3. Implement proper error handling
4. Check authentication with Better Auth
5. Validate credits before consuming

#### UI Components
1. Create feature components in `src/components/features/{feature}/`
2. Use shadcn/ui components from `src/components/ui/`
3. Follow JST timezone for all date displays
4. Implement loading states for async operations

#### AI Features (Python Backend)
1. Create router in `backend/app/routers/{feature}.py`
2. Use async/await for I/O operations
3. Implement retry logic with exponential backoff
4. Return structured responses with confidence scores

### 4. Key Patterns

#### Credit Consumption
```typescript
// Always check credits BEFORE operation
const cost = calculateCost(operation);
if (user.credits < cost) {
  return { error: 'INSUFFICIENT_CREDITS', required: cost };
}

// Only consume on SUCCESS
const result = await performOperation();
if (result.success) {
  await consumeCredits(user.id, cost);
}
```

#### Async Operations with Notifications
```typescript
// Start operation
await createNotification({
  type: 'OPERATION_STARTED',
  message: '処理中...'
});

// Complete operation
await createNotification({
  type: 'OPERATION_COMPLETED',
  success: result.success,
  creditsConsumed: cost,
  freeUsageUsed: usedFreeQuota
});
```

#### Deadline Approval Pattern
```typescript
// Deadlines require explicit user approval
const extractedDeadlines = await extractDeadlines(companyUrl);
// Present to user, don't auto-apply
// LOW confidence = initial checkbox OFF
```

### 5. Testing Requirements
- Add E2E tests in `e2e/{feature}.spec.ts`
- Test happy path and error cases
- Test credit consumption scenarios
- Test async notification flow

## Related Commands
- `/kiro:spec-status {feature}` - Check progress
- `/kiro:validate-impl {feature}` - Validate implementation
