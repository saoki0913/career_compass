"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/SidebarContext";

type DashboardViewer = {
  displayName: string;
  isGuest: boolean;
  companyLimitText: string;
};

type DashboardShellProps = {
  viewer: DashboardViewer;
  header: ReactNode;
  schedule: ReactNode;
  pipeline: ReactNode;
  tasks: ReactNode;
  deadlines: ReactNode;
};

export function DashboardShell({
  viewer,
  header,
  schedule,
  pipeline,
  tasks,
  deadlines,
}: DashboardShellProps) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="overflow-x-hidden bg-background">
      <main className={cn("mx-auto flex min-h-screen flex-col gap-3 overflow-x-hidden px-4 pb-3 pt-14 transition-[max-width] duration-200 ease-in-out sm:px-6 lg:h-dvh lg:min-h-0 lg:gap-2 lg:overflow-hidden lg:px-5 lg:py-3", isCollapsed ? "max-w-[1440px]" : "max-w-7xl")}>
        {header}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] lg:gap-2 lg:overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 lg:grid lg:grid-rows-[minmax(0,1.42fr)_minmax(0,1fr)] lg:gap-2 lg:overflow-hidden animate-fade-up">
            {schedule}
            {pipeline}
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)] gap-3 lg:gap-2 lg:overflow-hidden animate-fade-up delay-100">
            {tasks}
            {deadlines}
          </div>
        </div>

        {viewer.isGuest && (
          <div className="shrink-0 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 px-3 py-2 lg:py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">ゲストモードで利用中</h3>
                <p className="truncate text-xs text-muted-foreground">
                  登録企業は{viewer.companyLimitText}。ログインすると、データの保存やカレンダー連携が使えます
                </p>
              </div>
              <Button size="sm" className="shrink-0" asChild>
                <Link href="/login">ログインする</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
