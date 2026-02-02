"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useIncompleteItems, hasIncompleteItems } from "@/hooks/useIncompleteItems";

/**
 * IncompleteTasksCard Component
 * UX Psychology: Zeigarnik Effect - Highlights incomplete tasks to encourage completion
 *
 * This component displays draft ES documents and in-progress Gakuchika sessions
 * to remind users of their unfinished work.
 */

// Icons
const PencilIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

const BookOpenIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

interface IncompleteTasksCardProps {
  className?: string;
  compactMode?: boolean;
  maxItems?: number;
}

// Task item component for reuse in card and modal
function TaskItem({
  href,
  icon,
  label,
  count,
  preview,
  compactMode = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  preview?: string;
  compactMode?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block p-3 rounded-lg bg-white/50 hover:bg-white transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-lg bg-amber-100 flex items-center justify-center text-amber-700",
              compactMode ? "w-7 h-7" : "w-8 h-8"
            )}
          >
            {icon}
          </div>
          <span className={cn("font-medium", compactMode ? "text-xs" : "text-sm")}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-700 border-amber-200 text-xs"
          >
            {count}件
          </Badge>
          <ChevronRightIcon />
        </div>
      </div>
      {preview && (
        <p className="text-xs text-muted-foreground mt-2 truncate pl-10">
          {preview}
        </p>
      )}
    </Link>
  );
}

const CheckCircleIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

export function IncompleteTasksCard({
  className,
  compactMode = false,
  maxItems = 3,
}: IncompleteTasksCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data, isLoading } = useIncompleteItems();

  // Show loading state
  if (isLoading) {
    return (
      <Card className={cn("border-border/50 animate-pulse", className)}>
        <CardContent className="py-8">
          <div className="h-4 bg-muted rounded w-24 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  // Empty state - UX Psychology: Positive reinforcement when tasks are complete
  if (!hasIncompleteItems(data)) {
    return (
      <Card className={cn("border-emerald-200 bg-gradient-to-br from-emerald-50 to-transparent", className)}>
        <CardContent className={cn("py-6 text-center", compactMode && "py-4")}>
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3 text-emerald-600">
            <CheckCircleIcon />
          </div>
          <p className={cn("font-medium text-emerald-700", compactMode ? "text-sm" : "text-base")}>
            すべて完了！
          </p>
          <p className="text-xs text-emerald-600/70 mt-1">
            作業途中のタスクはありません
          </p>
          <div className="mt-4 pt-3 border-t border-emerald-200/50">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <SparklesIcon />
              <span>この調子で頑張りましょう！</span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { draftES, draftESCount, inProgressGakuchika, inProgressGakuchikaCount } = data!;
  const totalCount = draftESCount + inProgressGakuchikaCount;

  // Build task list
  const allTasks: Array<{
    type: "es" | "gakuchika";
    href: string;
    icon: React.ReactNode;
    label: string;
    count: number;
    preview?: string;
  }> = [];

  if (draftESCount > 0) {
    allTasks.push({
      type: "es",
      href: "/es?status=draft",
      icon: <PencilIcon />,
      label: "下書き中のES",
      count: draftESCount,
      preview: draftES[0]
        ? `${draftES[0].title}${draftES[0].company ? ` - ${draftES[0].company}` : ""}${draftESCount > 1 ? ` 他${draftESCount - 1}件` : ""}`
        : undefined,
    });
  }

  if (inProgressGakuchikaCount > 0) {
    allTasks.push({
      type: "gakuchika",
      href: "/gakuchika",
      icon: <BookOpenIcon />,
      label: "中断中のガクチカ",
      count: inProgressGakuchikaCount,
      preview: inProgressGakuchika[0]
        ? `${inProgressGakuchika[0].title}${inProgressGakuchikaCount > 1 ? ` 他${inProgressGakuchikaCount - 1}件` : ""}`
        : undefined,
    });
  }

  const visibleTasks = allTasks.slice(0, maxItems);
  const hasMore = allTasks.length > maxItems;

  return (
    <>
      <Card
        className={cn(
          "border-amber-200 bg-gradient-to-br from-amber-50 to-transparent transition-all duration-200",
          compactMode && "shadow-sm",
          className
        )}
      >
        <CardHeader className={cn("pb-3", compactMode && "pb-2")}>
          <div className="flex items-center gap-2 text-amber-700">
            <PencilIcon />
            <span className={cn("font-medium", compactMode ? "text-xs" : "text-sm")}>
              作業途中のタスク
            </span>
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-700 border-amber-200 text-xs"
            >
              {totalCount}件
            </Badge>
          </div>
        </CardHeader>

        <CardContent className={cn("space-y-2 pt-0", compactMode && "pb-4")}>
          {visibleTasks.map((task) => (
            <TaskItem
              key={task.type}
              href={task.href}
              icon={task.icon}
              label={task.label}
              count={task.count}
              preview={compactMode ? undefined : task.preview}
              compactMode={compactMode}
            />
          ))}

          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-amber-700 hover:text-amber-800 hover:bg-amber-100/50"
              onClick={() => setIsModalOpen(true)}
            >
              全て表示 ({totalCount}件)
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Modal for all tasks */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <PencilIcon />
              作業途中のタスク ({totalCount}件)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {allTasks.map((task) => (
              <TaskItem
                key={task.type}
                href={task.href}
                icon={task.icon}
                label={task.label}
                count={task.count}
                preview={task.preview}
                compactMode={false}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default IncompleteTasksCard;
