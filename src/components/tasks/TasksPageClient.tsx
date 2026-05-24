"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TodayPriorityTaskCard } from "@/components/tasks/TodayPriorityTaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { AppUiError, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { notifyError } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { ListPageFilterBar } from "@/components/shared/ListPageFilterBar";
import { ProductPageHeader } from "@/components/shared/ProductPageHeader";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { TaskKanbanBoard } from "@/components/tasks/TaskKanbanBoard";
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
import {
  TASK_GROUPS,
  buildGroupedTasks,
  getDueLabel,
  getTaskGroup,
  matchesTaskQuery,
  sortTasks,
  taskFilterTabs,
  taskSortOptions,
  taskTypeStyles,
  taskTypes,
  type TaskSortKey,
} from "@/components/tasks/task-display";

const LoadingSpinner = () => <Loader2 className="h-5 w-5 animate-spin" />;

function TaskTypePill({ type }: { type: TaskType }) {
  const colors = taskTypeStyles[type];
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium",
        colors.bg,
        colors.text,
        colors.border,
      )}
    >
      {TASK_TYPE_LABELS[type]}
    </span>
  );
}

interface TaskModalProps {
  isOpen: boolean;
  task?: Task;
  onClose: () => void;
  onSubmit: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function TaskModal({
  isOpen,
  task,
  onClose,
  onSubmit,
  onDelete,
}: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("es");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!task;
  const isBusy = isSubmitting || isDeleting;
  const dialogTitle = showDeleteConfirm
    ? "タスクを削除"
    : isEditing
      ? "タスクを編集"
      : "タスクを追加";
  const dialogDescription = showDeleteConfirm
    ? "この操作は取り消せません。削除するタスクを確認してください。"
    : "タスク名、種類、期限を入力して保存します。";

  useEffect(() => {
    if (!isOpen) return;
    setTitle(task?.title || "");
    setDescription(task?.description || "");
    setType(task?.type || "es");
    setDueDate(
      task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
    );
    setShowDeleteConfirm(false);
    setError(null);
  }, [
    isOpen,
    task?.description,
    task?.dueDate,
    task?.id,
    task?.title,
    task?.type,
  ]);

  const handleRequestClose = () => {
    if (isBusy) return;
    setShowDeleteConfirm(false);
    setError(null);
    onClose();
  };

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
      const ui = toAppUiError(
        err,
        {
          code: "TASKS_MODAL_SUBMIT_FAILED",
          userMessage: "タスクを保存できませんでした。",
        },
        "TasksPageClient:submitTask",
      );
      notifyError({ title: ui.message, description: ui.action });
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
      const ui = toAppUiError(
        err,
        {
          code: "TASKS_MODAL_DELETE_FAILED",
          userMessage: "タスクを削除できませんでした。",
        },
        "TasksPageClient:deleteTask",
      );
      notifyError({ title: ui.message, description: ui.action });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleRequestClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {showDeleteConfirm ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              「{task?.title}」を削除しますか？
            </p>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
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
              <Label htmlFor="task-title">タイトル *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="ES下書き作成"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">詳細</Label>
              <textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="詳細を入力..."
                className="min-h-[80px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label>種類 *</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {taskTypes.map((taskType) => {
                  const colors = taskTypeStyles[taskType];
                  return (
                    <button
                      key={taskType}
                      type="button"
                      onClick={() => setType(taskType)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs font-medium transition-all",
                        type === taskType
                          ? "ring-2 ring-primary ring-offset-1"
                          : "",
                        colors.bg,
                        colors.text,
                        colors.border,
                      )}
                    >
                      {TASK_TYPE_LABELS[taskType]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due-date">期限</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
              <div>
                {isEditing && onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSubmitting}
                  >
                    削除
                  </Button>
                ) : null}
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRequestClose}
                  disabled={isSubmitting}
                >
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
      </DialogContent>
    </Dialog>
  );
}

interface TaskListSectionsProps {
  groupedTasks: ReturnType<typeof buildGroupedTasks>;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
}

function TaskListSections({
  groupedTasks,
  onToggleComplete,
  onEditTask,
}: TaskListSectionsProps) {
  return (
    <div className="space-y-6">
      {TASK_GROUPS.map((group) => {
        const groupTasks = groupedTasks[group.key];
        if (groupTasks.length === 0) return null;
        return (
          <section key={group.key} aria-labelledby={`tasks-${group.key}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2
                  id={`tasks-${group.key}`}
                  className="text-base font-semibold text-foreground md:text-sm"
                >
                  {group.label}
                </h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground md:px-2 md:py-0.5">
                  {groupTasks.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {group.description}
              </p>
            </div>
            <div className="space-y-3 md:space-y-2.5">
              {groupTasks.map((task) => {
                const isCompleted = task.status === "done";
                const taskGroup = getTaskGroup(task);
                const isOverdue = taskGroup === "overdue";
                const isToday = taskGroup === "today";

                return (
                  <article
                    key={task.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-2xl border p-3.5 shadow-sm transition-colors md:gap-4 md:p-4",
                      isCompleted
                        ? "border-border/50 bg-muted/25"
                        : isOverdue
                          ? "border-destructive/25 bg-destructive/5"
                          : isToday
                            ? "border-primary/25 bg-primary/5"
                            : "border-border/60 bg-background hover:bg-muted/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleComplete(task.id)}
                      className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10 sm:w-10"
                      aria-label={
                        isCompleted
                          ? `${task.title}を未完了に戻す`
                          : `${task.title}を完了にする`
                      }
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors sm:h-6 sm:w-6",
                          isCompleted
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40 group-hover:border-primary",
                        )}
                      >
                        {isCompleted ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : null}
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TaskTypePill type={task.type} />
                        {task.company ? (
                          <Link
                            href={`/companies/${task.company.id}`}
                            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          >
                            <Building2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {task.company.name}
                            </span>
                          </Link>
                        ) : null}
                        {isToday ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            今日
                          </span>
                        ) : null}
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onEditTask(task)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onEditTask(task);
                          }
                        }}
                        className="block w-full cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`${task.title}を編集`}
                      >
                        <p
                          className={cn(
                            "mt-2 text-base font-medium leading-snug md:text-sm",
                            isCompleted && "line-through opacity-70",
                          )}
                        >
                          {task.title}
                        </p>
                        <p
                          className={cn(
                            "mt-1 flex items-center gap-1.5 text-sm",
                            isOverdue
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          <CalendarClock className="h-4 w-4 shrink-0" />
                          {getDueLabel(task)}
                        </p>
                        {task.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {task.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {isCompleted ? (
                      <CheckCircle2 className="mt-3 h-5 w-5 shrink-0 text-success" />
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
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
  const [typeFilter, setTypeFilter] = useState<TaskType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<TaskSortKey>("priority");
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [exportingDeadlines, setExportingDeadlines] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const {
    tasks,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    toggleComplete,
  } = useTasks({
    status: "all",
    initialData: initialTasks,
  });
  const todayTask = useTodayTask(
    initialTodayTask ? { initialData: initialTodayTask } : {},
  );

  const filteredTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) => statusFilter === "all" || task.status === statusFilter,
        )
        .filter((task) => typeFilter === "all" || task.type === typeFilter)
        .filter((task) => matchesTaskQuery(task, searchQuery.trim()))
        .sort((a, b) => sortTasks(a, b, sortBy)),
    [searchQuery, sortBy, statusFilter, tasks, typeFilter],
  );

  const groupedTasks = useMemo(
    () => buildGroupedTasks(filteredTasks),
    [filteredTasks],
  );

  const hasFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    searchQuery.trim().length > 0;

  const tabCounts = useMemo(
    () => ({
      all: tasks.length,
      open: tasks.filter((task) => task.status === "open").length,
      done: tasks.filter((task) => task.status === "done").length,
    }),
    [tasks],
  );

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTask(undefined);
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setSearchQuery("");
  };

  const handleExportDeadlinesCsv = async () => {
    setExportingDeadlines(true);
    try {
      const response = await fetch("/api/deadlines/export", {
        credentials: "include",
      });
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
      <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-10">
        <ProductPageHeader
          title="タスク"
          description="やることを期限順に整理できます"
          backLink={{ href: "/dashboard", label: "ダッシュボードへ戻る" }}
          badge={
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {tasks.length}件
            </span>
          }
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={exportingDeadlines}
                onClick={() => void handleExportDeadlinesCsv()}
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="ml-1.5">締切をCSV</span>
              </Button>
              <Button type="button" onClick={() => setShowModal(true)}>
                <Plus className="h-5 w-5" />
                <span className="ml-1.5">タスクを追加</span>
              </Button>
            </>
          }
        />

        <ListPageFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="タスク・企業を検索..."
          filterTabs={taskFilterTabs}
          activeFilter={statusFilter}
          onFilterChange={(key) => setStatusFilter(key as TaskStatus | "all")}
          tabCounts={tabCounts}
          sortOptions={taskSortOptions}
          sortBy={sortBy}
          onSortChange={(value) => setSortBy(value as TaskSortKey)}
          density="tasks"
          extraFilter={
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as TaskType | "all")
              }
            >
              <SelectTrigger
                className="h-12 w-full rounded-xl lg:h-9 lg:w-40 xl:w-[220px]"
                aria-label="種類で絞り込み"
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {typeFilter === "all"
                    ? "種類: すべて"
                    : TASK_TYPE_LABELS[typeFilter]}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種類</SelectItem>
                {taskTypes.map((taskType) => (
                  <SelectItem key={taskType} value={taskType}>
                    {TASK_TYPE_LABELS[taskType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          viewToggle={
            <ViewToggle
              options={[
                {
                  key: "kanban",
                  icon: <LayoutGrid className="h-4 w-4" />,
                  label: "ボード表示",
                },
                {
                  key: "list",
                  icon: <List className="h-4 w-4" />,
                  label: "リスト表示",
                },
              ]}
              activeKey={viewMode}
              onChange={(key) => setViewMode(key as "kanban" | "list")}
            />
          }
          clearAction={
            hasFilters
              ? {
                  label: "クリア",
                  onClear: handleClearFilters,
                }
              : undefined
          }
          activeFilters={[
            statusFilter !== "all"
              ? `状態: ${statusFilter === "open" ? "未完了" : "完了"}`
              : "",
            typeFilter !== "all" ? `種類: ${TASK_TYPE_LABELS[typeFilter]}` : "",
            searchQuery.trim() ? `検索: ${searchQuery.trim()}` : "",
          ].filter(Boolean)}
        />

        {todayTask.task ? (
          <TodayPriorityTaskCard
            todayTask={{
              task: todayTask.task,
              mode: todayTask.mode ?? "",
              markComplete: todayTask.markComplete,
            }}
            onEdit={(task) => {
              setEditingTask(task);
              setShowModal(true);
            }}
          />
        ) : null}

        {isLoading ? (
          <TasksPageSkeleton embedded />
        ) : tasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Check className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-medium">タスクがありません</h3>
              <p className="mb-6 text-muted-foreground">
                右上の「タスクを追加」ボタンから新しいタスクを作成できます
              </p>
              <Button variant="outline" onClick={() => setShowModal(true)}>
                <Plus className="h-5 w-5" />
                <span className="ml-1.5">タスクを追加</span>
              </Button>
            </CardContent>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-background shadow-sm">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium">
              条件に一致するタスクはありません
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              検索語や種類、完了状態のフィルタを変えて確認してください。
            </p>
            <Button variant="outline" onClick={handleClearFilters}>
              <X className="h-4 w-4" />
              条件をクリア
            </Button>
          </div>
        ) : (
          <>
            <div className="md:hidden">
              <TaskListSections
                groupedTasks={groupedTasks}
                onToggleComplete={(id) => void toggleComplete(id)}
                onEditTask={(task) => {
                  setEditingTask(task);
                  setShowModal(true);
                }}
              />
            </div>
            <div className="hidden md:block">
              {viewMode === "kanban" ? (
                <TaskKanbanBoard
                  groupedTasks={groupedTasks}
                  onToggleComplete={(id) => void toggleComplete(id)}
                  onEditTask={(task) => {
                    setEditingTask(task);
                    setShowModal(true);
                  }}
                />
              ) : (
                <TaskListSections
                  groupedTasks={groupedTasks}
                  onToggleComplete={(id) => void toggleComplete(id)}
                  onEditTask={(task) => {
                    setEditingTask(task);
                    setShowModal(true);
                  }}
                />
              )}
            </div>
          </>
        )}

        <TaskModal
          isOpen={showModal}
          task={editingTask}
          onClose={handleCloseModal}
          onSubmit={async (data) => {
            if (editingTask) {
              const updated = await updateTask(
                editingTask.id,
                data as UpdateTaskInput,
              );
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
