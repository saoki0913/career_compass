---
name: ukarun:ui
description: UI開発ガイド。React + Tailwind + shadcn/ui
---

# Skill: ウカルン UI開発

Use this skill when creating user interfaces for the Career Compass (ウカルン) application.

## When to Use
- User asks to create UI components or pages
- User mentions "画面", "コンポーネント", "UI"
- User wants to build frontend features

## Context
- **Framework**: Next.js App Router
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui (Radix primitives)
- **Icons**: Lucide React
- **Timezone**: JST (Asia/Tokyo) for all displays

## UI Structure

### Page Layout Pattern
```tsx
// src/app/{feature}/page.tsx
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function FeaturePage() {
  const session = await auth.api.getSession();
  if (!session) redirect('/login');

  return (
    <div className="container mx-auto py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">ページタイトル</h1>
      </header>

      <Suspense fallback={<LoadingSkeleton />}>
        <FeatureContent userId={session.user.id} />
      </Suspense>
    </div>
  );
}
```

### Client Component Pattern
```tsx
// src/components/features/{feature}/FeatureComponent.tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function FeatureComponent({ data }: Props) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleAction = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/feature', {
          method: 'POST',
          body: JSON.stringify({ ... }),
        });

        if (!response.ok) {
          const error = await response.json();
          if (error.error === 'INSUFFICIENT_CREDITS') {
            toast({
              title: 'クレジット不足',
              description: `${error.required}クレジット必要です`,
              variant: 'destructive',
            });
            return;
          }
          throw new Error(error.message);
        }

        const result = await response.json();
        toast({
          title: '成功',
          description: '処理が完了しました',
        });
      } catch (error) {
        toast({
          title: 'エラー',
          description: '処理に失敗しました',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Button onClick={handleAction} disabled={isPending}>
      {isPending ? '処理中...' : '実行'}
    </Button>
  );
}
```

## Key UI Patterns

### 1. Loading States
```tsx
// Always show loading state for async operations
{isLoading ? (
  <div className="flex items-center gap-2">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>処理中...</span>
  </div>
) : (
  <Content />
)}
```

### 2. Credit Display
```tsx
// Dashboard credit display
<div className="rounded-lg border p-4">
  <div className="flex items-baseline gap-2">
    <span className="text-2xl font-bold">{credits}</span>
    <span className="text-muted-foreground">クレジット</span>
  </div>
  <div className="mt-2 text-sm text-muted-foreground">
    次回付与日: {formatJST(nextRefreshDate, 'M/d')}
  </div>
  <div className="mt-1 text-sm">
    企業更新無料回数: {freeUsageRemaining}/3
  </div>
</div>
```

### 3. Deadline Warning
```tsx
// Deadline urgency display
const getDeadlineUrgency = (deadline: Date) => {
  const hoursUntil = differenceInHours(deadline, new Date());
  if (hoursUntil <= 24) return 'critical';   // 24時間以内
  if (hoursUntil <= 72) return 'warning';    // 3日以内
  return 'normal';
};

<Badge variant={getDeadlineUrgency(deadline.dueAt)}>
  {urgency === 'critical' && '24時間以内'}
  {urgency === 'warning' && '3日以内'}
  {formatJST(deadline.dueAt, 'M/d HH:mm')}
</Badge>
```

### 4. Approval Modal (締切承認)
```tsx
// Deadline approval modal
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>締切を承認</DialogTitle>
      <DialogDescription>
        承認する締切にチェックを入れてください
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-3">
      {deadlines.map((deadline) => (
        <div key={deadline.id} className="flex items-center gap-3">
          <Checkbox
            checked={selected.includes(deadline.id)}
            onCheckedChange={(checked) => toggleSelect(deadline.id)}
            // LOW confidence = initially unchecked
            defaultChecked={deadline.confidence !== 'LOW'}
          />
          <div className="flex-1">
            <div className="font-medium">{deadline.title}</div>
            <div className="text-sm text-muted-foreground">
              {formatJST(deadline.dueAt, 'yyyy/M/d HH:mm')}
            </div>
          </div>
          <ConfidenceBadge level={deadline.confidence} />
          <a href={deadline.sourceUrl} target="_blank" className="text-xs">
            根拠
          </a>
        </div>
      ))}
    </div>

    <DialogFooter>
      <Button
        onClick={handleApprove}
        disabled={selected.length === 0}
      >
        {selected.length === 0
          ? '少なくとも1件は承認してください'
          : `${selected.length}件を承認`}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 5. Today's Most Important Task
```tsx
// Dashboard main task display
<Card className="border-primary">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Target className="h-5 w-5" />
      今日の最重要タスク
    </CardTitle>
  </CardHeader>
  <CardContent>
    {task ? (
      <div className="space-y-4">
        <div>
          <div className="font-medium">{task.title}</div>
          <div className="text-sm text-muted-foreground">
            {task.company.name} / {task.application.name}
          </div>
        </div>
        <Button asChild className="w-full">
          <Link href={task.actionUrl}>開始する</Link>
        </Button>
      </div>
    ) : (
      <div className="text-muted-foreground">
        現在タスクはありません
      </div>
    )}
  </CardContent>
</Card>
```

### 6. Notification List
```tsx
// Notification display (max 5 + "他○件")
<div className="space-y-2">
  {notifications.slice(0, 5).map((n) => (
    <NotificationItem
      key={n.id}
      notification={n}
      onClick={() => handleNotificationClick(n)}
    />
  ))}
  {notifications.length > 5 && (
    <Button variant="ghost" onClick={showAllNotifications}>
      他{notifications.length - 5}件
    </Button>
  )}
</div>
```

### 7. ES Editor Layout (Left-Right Split)
```tsx
// ES editor with AI chat
<div className="flex h-screen">
  {/* Left: Document Editor */}
  <div className="flex-1 border-r overflow-y-auto">
    <ESEditor
      document={document}
      onChange={handleChange}
    />
  </div>

  {/* Right: AI Chat */}
  <div className="w-96 flex flex-col">
    <AIChatPanel
      documentId={document.id}
      threads={threads}
      activeThread={activeThread}
    />
  </div>
</div>
```

## JST Date Formatting

```tsx
// lib/utils/date.ts
export function formatJST(date: Date, format: string) {
  return formatInTimeZone(date, 'Asia/Tokyo', format, { locale: ja });
}

// Usage in components
import { formatJST } from '@/lib/utils/date';

<span>{formatJST(deadline.dueAt, 'yyyy年M月d日 HH:mm')}</span>
```

## Accessibility
- Use semantic HTML
- Include proper ARIA labels
- Ensure keyboard navigation
- Maintain color contrast

## Responsive Design
- Mobile-first approach
- Use Tailwind breakpoints (sm, md, lg, xl)
- Test on common device sizes
