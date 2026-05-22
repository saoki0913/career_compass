"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { DASHBOARD_ASSETS } from "@/lib/assets/image-registry";
import type { Deadline } from "@/hooks/useDeadlines";
import { cn } from "@/lib/utils";

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
    <Card className="h-full min-h-[220px] overflow-hidden rounded-2xl border-border/50 py-4 gap-3 lg:min-h-0 lg:rounded-xl lg:py-1.5 lg:gap-1" data-testid="dashboard-deadline-card">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-5 lg:px-5">
        <CardTitle className="text-xl font-semibold tracking-tight lg:text-base">締切</CardTitle>
        <CardAction>
          <Link
            href="/calendar"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            すべて見る
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden px-5 lg:px-5">
        {visible.length === 0 ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center px-4 py-2 text-center">
            <Image
              src={DASHBOARD_ASSETS.emptyDeadline}
              alt=""
              width={1254}
              height={1254}
              className="h-20 w-20 object-contain"
            />
            <p className="mt-1 text-sm font-semibold">今週の締切はありません</p>
            <p className="mt-0.5 text-xs text-muted-foreground">この調子で進めましょう</p>
          </div>
        ) : (
          <div className="space-y-0.5 overflow-hidden pb-1">
            {visible.map((dl) => {
              const due = new Date(dl.dueDate);
              const isUrgent = dl.daysLeft <= 3;
              return (
                <Link
                  key={dl.id}
                  href={`/companies/${dl.companyId}`}
                  className="group flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted/40 lg:min-h-8"
                >
                  <span className="w-10 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
                    {due.getMonth() + 1}/{due.getDate()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{dl.company}</p>
                    <p className="truncate text-xs text-muted-foreground">{dl.title}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs lg:text-[11px]",
                      isUrgent ? "font-medium text-destructive" : "text-muted-foreground",
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
