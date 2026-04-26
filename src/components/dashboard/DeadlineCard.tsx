"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Deadline } from "@/hooks/useDeadlines";
import { cn } from "@/lib/utils";

function getDaysLeftColor(daysLeft: number) {
  if (daysLeft <= 3) return "text-red-600 bg-red-50";
  if (daysLeft <= 7) return "text-orange-600 bg-orange-50";
  return "text-emerald-600 bg-emerald-50";
}

function getDaysLeftDisplay(daysLeft: number) {
  if (daysLeft === 0) return "今日!";
  if (daysLeft === 1) return "明日!";
  if (daysLeft <= 3) return `あと${daysLeft}日!`;
  if (daysLeft <= 7) return `あと${daysLeft}日`;
  return `${daysLeft}日後`;
}

const EmptyIcon = () => (
  <svg className="w-6 h-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

interface DeadlineCardProps {
  deadlines: Deadline[];
}

export function DeadlineCard({ deadlines }: DeadlineCardProps) {
  const visible = deadlines.slice(0, 3);

  return (
    <Card className="border-border/50 py-2 gap-1.5">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">締切</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendar">すべて見る</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-2 text-center">
            <EmptyIcon />
            <p className="text-sm text-muted-foreground">今週の締切はありません</p>
          </div>
        ) : (
          <div className="space-y-1">
            {visible.map((dl) => {
              const due = new Date(dl.dueDate);
              const color = getDaysLeftColor(dl.daysLeft);
              return (
                <Link
                  key={dl.id}
                  href={`/companies/${dl.companyId}`}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-[10px] font-medium leading-none">
                    <span>{due.getMonth() + 1}/{due.getDate()}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{dl.company}</p>
                    <p className="truncate text-xs text-muted-foreground">{dl.title}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      color,
                    )}
                  >
                    {getDaysLeftDisplay(dl.daysLeft)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
