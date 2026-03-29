"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_ICONS,
  type NotificationsResponse,
} from "@/hooks/useNotifications";
import { NotificationsListSkeleton } from "@/components/skeletons/NotificationsPageSkeleton";

const BellIcon = () => (
  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

export function NotificationsPageClient({
  initialData,
}: {
  initialData?: NotificationsResponse;
}) {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
  } = useNotifications({
    limit: 50,
    initialData,
  });

  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "昨日";
    } else if (days < 7) {
      return `${days}日前`;
    } else {
      return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">通知</h1>
            <p className="mt-1 text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount}件の未読があります` : "すべて既読です"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" onClick={() => void markAllAsRead()}>
                すべて既読にする
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDeleteAllOpen(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                すべて削除
              </Button>
            )}
          </div>
        </div>

        <Dialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>すべての通知を削除しますか？</DialogTitle>
              <DialogDescription>一覧から通知が消えます。この操作は取り消せません。</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmDeleteAllOpen(false)}>
                キャンセル
              </Button>
              <Button
                variant="destructive"
                disabled={isDeletingAll}
                onClick={async () => {
                  setIsDeletingAll(true);
                  await deleteAllNotifications();
                  setIsDeletingAll(false);
                  setConfirmDeleteAllOpen(false);
                }}
              >
                {isDeletingAll ? "削除中…" : "削除する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <NotificationsListSkeleton />
        ) : notifications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BellIcon />
              </div>
              <h3 className="mb-2 text-lg font-medium">通知はありません</h3>
              <p className="text-muted-foreground">
                締切のリマインドやES添削完了などの通知がここに表示されます
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted/50",
                  !notification.isRead && "border-primary/30 bg-primary/5"
                )}
                onClick={() => {
                  if (!notification.isRead) {
                    void markAsRead(notification.id);
                  }
                }}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 text-2xl">
                      {NOTIFICATION_TYPE_ICONS[notification.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={cn("font-medium", !notification.isRead && "text-primary")}>
                            {notification.title}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {NOTIFICATION_TYPE_LABELS[notification.type]}
                          </span>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(notification.createdAt)}
                          </span>
                          {!notification.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label="この通知を削除"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteNotification(notification.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{notification.message}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </main>
  );
}
