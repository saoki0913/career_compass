"use client";

import { useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const LoadingSpinner = () => <Loader2 className="h-5 w-5 animate-spin" />;

const taskTypes: TaskType[] = [
  "es",
  "web_test",
  "self_analysis",
  "gakuchika",
  "video",
  "other",
];

type TaskSortKey = "priority" | "due_asc" | "created_desc";

const taskFilterTabs = [
  { key: "all", label: "すべて" },
  { key: "open", label: "未完了" },
  { key: "done", label: "完了" },
];

const taskSortOptions = [
  { value: "priority", label: "優先度順" },
  { value: "due_asc", label: "期限が近い順" },
  { value: "created_desc", label: "作成日 (新しい順)" },
];

const typeColors: Record<
  TaskType,
  { bg: string; text: string; border: string }
> = {
  es: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  web_test: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
  },
  self_analysis: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  gakuchika: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  video: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  other: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  },
};

type TaskGroupKey = "overdue" | "today" | "upcoming" | "noDue" | "done";

const TASK_GROUPS: { key: TaskGroupKey; label: string; description: string }[] =
  [
    { key: "overdue", label: "期限切れ", description: "先に確認" },
    { key: "today", label: "今日まで", description: "今日の集中枠" },
    { key: "upcoming", label: "今後", description: "期限が近い順" },
    { key: "noDue", label: "期限なし", description: "余裕がある時" },
    { key: "done", label: "完了", description: "完了済み" },
  ];

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateFromTaskDueDate(dueDate: string | null) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDaysLeft(dueDate: string | null) {
  const date = dateFromTaskDueDate(dueDate);
  if (!date) return null;
  const today = startOfToday();
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.ceil(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function getTaskGroup(task: Task): TaskGroupKey {
  if (task.status === "done") return "done";
  const daysLeft = getDaysLeft(task.dueDate);
  if (daysLeft == null) return "noDue";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  return "upcoming";
}

function getDueLabel(task: Task) {
  const dueDate = dateFromTaskDueDate(task.dueDate);
  if (!dueDate) return "期限なし";
  const daysLeft = getDaysLeft(task.dueDate);
  const formattedDate = dueDate.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  if (task.status === "done") return formattedDate;
  if (daysLeft == null) return formattedDate;
  if (daysLeft < 0) return `${formattedDate} / ${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return `${formattedDate} / 今日`;
  if (daysLeft === 1) return `${formattedDate} / 明日`;
  return `${formattedDate} / あと${daysLeft}日`;
}

function sortTasksByPriority(a: Task, b: Task) {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  const aDate =
    dateFromTaskDueDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDate =
    dateFromTaskDueDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDate !== bDate) return aDate - bDate;
  return a.sortOrder - b.sortOrder;
}

function sortTasks(a: Task, b: Task, sortBy: TaskSortKey) {
  if (sortBy === "created_desc") {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  if (sortBy === "due_asc") {
    const aDate =
      dateFromTaskDueDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDate =
      dateFromTaskDueDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;
  }

  return sortTasksByPriority(a, b);
}

function matchesTaskQuery(task: Task, query: string) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return [
    task.title,
    task.description,
    task.company?.name,
    task.deadline?.title,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

function TaskTypePill({ type }: { type: TaskType }) {
  const colors = typeColors[type];
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
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [type, setType] = useState<TaskType>(task?.type || "es");
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
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
              <p className="text-sm text-muted-foreground">
                「{task?.title}」を削除しますか？
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  キャンセル
                </Button>
                <Button
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
                <Label htmlFor="title">タイトル *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="ES下書き作成"
                  autoFocus
                />
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
                          "rounded-lg border px-2 py-1.5 text-xs font-medium transition-all",
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
                <Label htmlFor="dueDate">期限</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
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

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskGroupKey, Task[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      noDue: [],
      done: [],
    };
    for (const task of filteredTasks) {
      groups[getTaskGroup(task)].push(task);
    }
    return groups;
  }, [filteredTasks]);

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
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">タスク</h1>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {tasks.length}件
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              締切に近いものから片付けられるように、未完了タスクを期限別に整理します
            </p>
          </div>
          <div className="flex gap-2 sm:self-start">
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
          </div>
        </div>

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
          extraFilter={
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as TaskType | "all")
              }
            >
              <SelectTrigger className="w-40" aria-label="種類で絞り込み">
                <span className="min-w-0 flex-1 truncate text-left">
                  {typeFilter === "all" ? "種類: すべて" : TASK_TYPE_LABELS[typeFilter]}
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
                { key: "kanban", icon: <LayoutGrid className="h-4 w-4" />, label: "ボード表示" },
                { key: "list", icon: <List className="h-4 w-4" />, label: "リスト表示" },
              ]}
              activeKey={viewMode}
              onChange={(key) => setViewMode(key as "kanban" | "list")}
            />
          }
          clearAction={
            hasFilters
              ? {
                  label: "クリア",
                  onClear: () => {
                    setStatusFilter("all");
                    setTypeFilter("all");
                    setSearchQuery("");
                  },
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
          <TasksPageSkeleton />
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
            <Button
              variant="outline"
              onClick={() => {
                setTypeFilter("all");
                setSearchQuery("");
              }}
            >
              <X className="h-4 w-4" />
              条件をクリア
            </Button>
          </div>
        ) : viewMode === "kanban" ? (
          <TaskKanbanBoard
            groupedTasks={groupedTasks}
            onToggleComplete={(id) => void toggleComplete(id)}
            onEditTask={(task) => {
              setEditingTask(task);
              setShowModal(true);
            }}
          />
        ) : (
          <div className="space-y-6">
            {TASK_GROUPS.map((group) => {
              const groupTasks = groupedTasks[group.key];
              if (groupTasks.length === 0) return null;
              return (
                <section key={group.key} aria-labelledby={`tasks-${group.key}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2
                        id={`tasks-${group.key}`}
                        className="text-sm font-semibold text-foreground"
                      >
                        {group.label}
                      </h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {groupTasks.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {group.description}
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    {groupTasks.map((task) => {
                      const isCompleted = task.status === "done";
                      const taskGroup = getTaskGroup(task);
                      const isOverdue = taskGroup === "overdue";
                      const isToday = taskGroup === "today";

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-start gap-4 rounded-2xl border p-4 shadow-sm transition-colors",
                            isCompleted
                              ? "border-border/50 bg-muted/25 opacity-70"
                              : isOverdue
                                ? "border-destructive/25 bg-destructive/5"
                                : isToday
                                  ? "border-primary/25 bg-primary/5"
                                  : "border-border/60 bg-background hover:bg-muted/30",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => void toggleComplete(task.id)}
                            className={cn(
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                              isCompleted
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40 hover:border-primary",
                            )}
                            aria-label={
                              isCompleted
                                ? "タスクを未完了に戻す"
                                : "タスクを完了にする"
                            }
                          >
                            {isCompleted ? <Check className="h-4 w-4" /> : null}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <TaskTypePill type={task.type} />
                              {task.company ? (
                                <Link
                                  href={`/companies/${task.company.id}`}
                                  onClick={(event) => event.stopPropagation()}
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
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTask(task);
                                setShowModal(true);
                              }}
                              className="block w-full text-left"
                            >
                              <p
                                className={cn(
                                  "mt-2 font-medium leading-snug",
                                  isCompleted && "line-through",
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
                            </button>
                          </div>
                          {isCompleted ? (
                            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
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
