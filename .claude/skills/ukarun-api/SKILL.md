---
name: ukarun:api
description: API開発ガイド。Next.js App Router
---

# Skill: ウカルン API開発

Use this skill when creating or modifying API endpoints for the Career Compass (ウカルン) application.

## When to Use
- User asks to create API endpoints
- User mentions "API", "endpoint", "route"
- User wants to add backend functionality

## Context
- **Framework**: Next.js App Router API Routes
- **Authentication**: Better Auth
- **Database**: Drizzle ORM + Turso
- **Location**: `src/app/api/`

## API Route Structure

### Basic Route Template
```typescript
// src/app/api/{resource}/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { resources, eq } from '@/lib/db/schema';

// GET - List or single resource
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await db.query.resources.findMany({
      where: eq(resources.userId, session.user.id),
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Create resource
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create resource
    const [newResource] = await db.insert(resources).values({
      id: generateId(),
      userId: session.user.id,
      name: body.name,
    }).returning();

    return NextResponse.json({ data: newResource }, { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### Dynamic Route Template
```typescript
// src/app/api/{resource}/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  // ... fetch single resource
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  // ... update resource
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  // ... delete resource
}
```

## Key API Patterns

### 1. Credit Check Pattern
```typescript
import { checkCredits, consumeCredits } from '@/lib/credits';

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  // Calculate cost
  const body = await request.json();
  const cost = Math.ceil(body.text.length / 800);  // ES review cost

  // Check credits before operation
  const creditCheck = await checkCredits(session.user.id, cost);
  if (!creditCheck.sufficient) {
    return NextResponse.json({
      error: 'INSUFFICIENT_CREDITS',
      required: cost,
      available: creditCheck.balance,
    }, { status: 402 });
  }

  // Perform operation
  const result = await performAIReview(body.text);

  // Only consume on success
  if (result.success) {
    await consumeCredits(session.user.id, cost, 'ES_REVIEW');
  }

  return NextResponse.json({ data: result });
}
```

### 2. Free Usage Check Pattern
```typescript
import { checkFreeUsage, consumeFreeUsage } from '@/lib/credits';

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  // Check free usage first (3/day for logged in, 2/day for guest)
  const freeUsage = await checkFreeUsage(session.user.id, 'COMPANY_UPDATE');

  let usedFree = false;
  let creditCost = 0;

  if (freeUsage.remaining > 0) {
    usedFree = true;
  } else {
    creditCost = 1;
    const creditCheck = await checkCredits(session.user.id, creditCost);
    if (!creditCheck.sufficient) {
      return NextResponse.json({
        error: 'INSUFFICIENT_CREDITS',
        freeUsageExhausted: true,
      }, { status: 402 });
    }
  }

  // Perform operation
  const result = await fetchCompanyInfo(body.url);

  // Only consume on success
  if (result.success) {
    if (usedFree) {
      await consumeFreeUsage(session.user.id, 'COMPANY_UPDATE');
    } else {
      await consumeCredits(session.user.id, creditCost, 'COMPANY_UPDATE');
    }
  }

  return NextResponse.json({
    data: result,
    creditConsumed: result.success ? creditCost : 0,
    usedFreeUsage: result.success && usedFree,
  });
}
```

### 3. Plan Limit Check Pattern
```typescript
import { checkPlanLimit } from '@/lib/plans';

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  // Check plan limits (e.g., Free = 5 companies max)
  const limitCheck = await checkPlanLimit(session.user.id, 'COMPANY_COUNT');
  if (!limitCheck.allowed) {
    return NextResponse.json({
      error: 'PLAN_LIMIT_REACHED',
      limit: limitCheck.limit,
      current: limitCheck.current,
      upgradeRequired: true,
    }, { status: 403 });
  }

  // Proceed with creation
  // ...
}
```

### 4. Async Operation Pattern
```typescript
// For long-running operations, return immediately and notify later
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const body = await request.json();

  // Create notification for started
  await createNotification(session.user.id, {
    type: 'COMPANY_FETCH_STARTED',
    message: '企業情報を取得中...',
    targetId: body.companyId,
  });

  // Queue background job (or use edge function)
  await queueJob('fetchCompanyInfo', {
    userId: session.user.id,
    companyId: body.companyId,
    url: body.url,
  });

  return NextResponse.json({ status: 'processing' });
}
```

### 5. Deadline Extraction Response
```typescript
// Return deadlines as candidates, not confirmed
return NextResponse.json({
  data: {
    companyId: body.companyId,
    extractedData: {
      deadlines: extractedDeadlines.map(d => ({
        ...d,
        status: 'CANDIDATE',  // Not yet approved
        confidence: d.confidence,  // HIGH/MEDIUM/LOW
        sourceUrl: d.sourceUrl,
        initiallyChecked: d.confidence !== 'LOW',  // LOW = unchecked
      })),
      // Other fields auto-applied with source info
      positions: extractedPositions.map(p => ({
        ...p,
        sourceUrl: p.sourceUrl,
        confidence: p.confidence,
      })),
    },
    partial: !extractedDeadlines.length,  // Partial success
    creditCost: extractedDeadlines.length ? 1 : 0.5,
  }
});
```

## Response Format Standards

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "creditsConsumed": 2,
    "usedFreeUsage": false,
    "remainingCredits": 28
  }
}
```

### Error Response
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": { ... }
}
```

### Paginated Response
```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "perPage": 20,
    "hasMore": true
  }
}
```

## Testing
Create corresponding tests in `e2e/api/{resource}.spec.ts` or unit tests.
