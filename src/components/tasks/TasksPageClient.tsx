"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppUiError, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { cn } from "@/lib/utils";
import {
  useTasks,
  useTodayTask,
  Task,
  TaskType,
  TaskStatus,
  TASK_TYPE_LABELS,
  CreateTaskInput,
  UpdateTaskInput,
  TodayTask,
} from "@/hooks/useTasks";
import { TasksPageSkeleton } from "@/components/skeletons/TasksPageSkeleton";

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const StarIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const taskTypes: TaskType[] = ["es", "web_test", "self_analysis", "gakuchika", "video", "other"];

const typeColors: Record<TaskType, { bg: string; text: string }> = {
  es: { bg: "bg-blue-100", text: "text-blue-700" },
  web_test: { bg: "bg-purple-100", text: "text-purple-700" },
  self_analysis: { bg: "bg-emerald-100", text: "text-emerald-700" },
  gakuchika: { bg: "bg-amber-100", text: "text-amber-700" },
  video: { bg: "bg-pink-100", text: "text-pink-700" },
  other: { bg: "bg-gray-100", text: "text-gray-700" },
};

interface TaskModalProps {
  isOpen: boolean;
  task?: Task;
  onClose: () => void;
  onSubmit: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function TaskModal({ isOpen, task, onClose, onSubmit, onDelete }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [type, setType] = useState<TaskType>(task?.type || "es");
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!task;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        dueDate: dueDate || undefined,
      });
      onClose();
    } catch (err) {
      setError(
        toAppUiError(
          err,
          {
            code: "TASKS_MODAL_SUBMIT_FAILED",
            userMessage: "タスクを保存できませんでした。",
          },
          "TasksPageClient:submitTask",
        ).message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(
        toAppUiError(
          err,
          {
            code: "TASKS_MODAL_DELETE_FAILED",
            userMessage: "タスクを削除できませんでした。",
          },
          "TasksPageClient:deleteTask",
        ).message,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isEditing ? "タスクを編集" : "タスクを追加"}</CardTitle>
        </CardHeader>
        <CardContent>
          {showDeleteConfirm ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">「{task?.title}」を削除しますか？</p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                  キャンセル
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">削除中...</span>
                    </>
                  ) : (
                    "削除する"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="title">タイトル *</Label>
                <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ES下書き作成" autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">詳細</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="詳細を入力..."
                  className="min-h-[80px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label>種類 *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {taskTypes.map((taskType) => {
                    const colors = typeColors[taskType];
                    return (
                      <button
                        key={taskType}
                        type="button"
                        onClick={() => setType(taskType)}
                        className={cn(
                          "rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                          type === taskType ? "ring-2 ring-primary ring-offset-1" : "",
                          colors.bg,
                          colors.text
                        )}
                      >
                        {TASK_TYPE_LABELS[taskType]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">期限</Label>
                <Input id="dueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
              <div className="flex justify-between pt-4">
                <div>
                  {isEditing && onDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      削除
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                    キャンセル
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">保存中...</span>
                      </>
                    ) : isEditing ? (
                      "保存"
                    ) : (
                      "追加"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TasksPageClient({
  initialTasks,
  initialTodayTask,
}: {
  initialTasks?: Task[];
  initialTodayTask?: TodayTask;
}) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [exportingDeadlines, setExportingDeadlines] = useState(false);
  const { tasks, isLoading, createTask, updateTask, deleteTask, toggleComplete } = useTasks({
    status: statusFilter,
    initialData: statusFilter === "all" ? initialTasks : undefined,
  });
  const todayTask = useTodayTask(initialTodayTask ? { initialData: initialTodayTask } : {});

  const openTasks = tasks.filter((task) => task.status === "open");
  const doneTasks = tasks.filter((task) => task.status === "done");

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTask(undefined);
  };

  const handleExportDeadlinesCsv = async () => {
    setExportingDeadlines(true);
    try {
      const response = await fetch("/api/deadlines/export", { credentials: "include" });
      if (!response.ok) throw new Error("export failed");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "deadlines.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      notifyUserFacingAppError(
        new AppUiError("締切CSVを出力できませんでした。", {
          code: "DEADLINES_EXPORT_FAILED",
          action: "時間を置いて、もう一度お試しください。",
        }),
      );
    } finally {
      setExportingDeadlines(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">タスク</h1>
            <p className="mt-1 text-muted-foreground">やることを管理しましょう</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={exportingDeadlines} onClick={() => void handleExportDeadlinesCsv()} className="min-h-11">
              <Download className="h-4 w-4 shrink-0" />
              <span className="ml-1.5">締切をCSV</span>
            </Button>
            <Button onClick={() => setShowModal(true)} className="min-h-11">
              <PlusIcon />
              <span className="ml-1.5">タスクを追加</span>
            </Button>
          </div>
        </div>

        {todayTask.task ? (
          <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary">
                <StarIcon />
                <span className="text-sm font-medium">
                  今日の最重要タスク
                  {todayTask.mode === "DEADLINE" && " - 締切優先"}
                  {todayTask.mode === "DEEP_DIVE" && " - 深掘り優先"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => void todayTask.markComplete()}
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary transition-colors hover:bg-primary/10"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", typeColors[todayTask.task.type].bg, typeColors[todayTask.task.type].text)}>
                      {TASK_TYPE_LABELS[todayTask.task.type]}
                    </span>
                    {todayTask.task.company ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <BuildingIcon />
                        {todayTask.task.company.name}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-lg font-medium">{todayTask.task.title}</p>
                  {todayTask.task.deadline ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <ClockIcon />
                      {new Date(todayTask.task.deadline.dueDate).toLocaleDateString("ja-JP", {
                        month: "long",
                        day: "numeric",
                      })}
                      まで
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingTask(todayTask.task ?? undefined);
                    setShowModal(true);
                  }}
                >
                  編集
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="mb-6 flex gap-2">
          {(["all", "open", "done"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                statusFilter === status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {status === "all" ? "すべて" : status === "open" ? "未完了" : "完了"}
              <span className="ml-1.5 opacity-70">
                ({status === "all" ? tasks.length : status === "open" ? openTasks.length : doneTasks.length})
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <TasksPageSkeleton />
        ) : tasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <CheckIcon />
              </div>
              <h3 className="mb-2 text-lg font-medium">タスクがありません</h3>
              <p className="mb-6 text-muted-foreground">右上の「タスクを追加」ボタンから新しいタスクを作成できます</p>
              <Button variant="outline" onClick={() => setShowModal(true)}>
                <PlusIcon />
                <span className="ml-1.5">タスクを追加</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const isCompleted = task.status === "done";
              const dueDate = task.dueDate ? new Date(task.dueDate) : null;
              const now = new Date();
              const isOverdue = !isCompleted && dueDate && dueDate < now;
              const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const colors = typeColors[task.type];

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-4 rounded-xl p-4 transition-colors",
                    isCompleted ? "bg-muted/30 opacity-60" : isOverdue ? "border border-red-200 bg-red-50" : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void toggleComplete(task.id)}
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isCompleted ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
                    )}
                  >
                    {isCompleted ? <CheckIcon /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(task);
                      setShowModal(true);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", colors.bg, colors.text)}>
                        {TASK_TYPE_LABELS[task.type]}
                      </span>
                      {task.company ? (
                        <Link
                          href={`/companies/${task.company.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <BuildingIcon />
                          {task.company.name}
                        </Link>
                      ) : null}
                    </div>
                    <p className={cn("mt-1 font-medium", isCompleted && "line-through")}>{task.title}</p>
                    {dueDate ? (
                      <p className={cn("mt-1 text-sm", isOverdue ? "text-red-600" : "text-muted-foreground")}>
                        {dueDate.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" })}
                        {!isCompleted && daysLeft !== null ? (
                          <span className="ml-2">
                            {isOverdue ? "（期限切れ）" : daysLeft === 0 ? "（今日）" : daysLeft === 1 ? "（明日）" : `（あと${daysLeft}日）`}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {task.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p> : null}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <TaskModal
          isOpen={showModal}
          task={editingTask}
          onClose={handleCloseModal}
          onSubmit={async (data) => {
            if (editingTask) {
              const updated = await updateTask(editingTask.id, data as UpdateTaskInput);
              if (!updated) {
                throw new Error("タスクを更新できませんでした。");
              }
              return;
            }
            const created = await createTask(data as CreateTaskInput);
            if (!created) {
              throw new Error("タスクを作成できませんでした。");
            }
          }}
          onDelete={
            editingTask
              ? async () => {
                  const deleted = await deleteTask(editingTask.id);
                  if (!deleted) {
                    throw new Error("タスクを削除できませんでした。");
                  }
                }
              : undefined
          }
        />
      </main>
    </div>
  );
}
