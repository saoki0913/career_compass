"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
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

interface DeadlineCardProps {
  deadlines: Deadline[];
  maxVisible?: number;
}

export function DeadlineCard({ deadlines, maxVisible = 3 }: DeadlineCardProps) {
  const visible = deadlines.filter((deadline) => deadline.isConfirmed).slice(0, maxVisible);

  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1" data-testid="dashboard-deadline-card">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 lg:px-5">
        <CardTitle className="text-lg">締切</CardTitle>
        <CardAction>
          <Link
            href="/calendar"
            className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            すべて見る
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden px-4 lg:px-5">
        {visible.length === 0 ? (
          <div className="flex h-full min-h-[150px] flex-col items-center justify-center px-4 py-2 text-center">
            <Image
              src="/dashboard/assets/image_05.png"
              alt=""
              width={1254}
              height={1254}
              className="h-24 w-24 object-contain"
            />
            <p className="mt-1 text-sm font-semibold">今週の締切はありません</p>
            <p className="mt-0.5 text-xs text-muted-foreground">この調子で進めましょう</p>
          </div>
        ) : (
          <div className="space-y-1 overflow-hidden pb-1">
            {visible.map((dl) => {
              const due = new Date(dl.dueDate);
              const color = getDaysLeftColor(dl.daysLeft);
              return (
                <Link
                  key={dl.id}
                  href={`/companies/${dl.companyId}`}
                  className="group flex min-h-10 items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 text-[10px] font-bold leading-none text-blue-700">
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
