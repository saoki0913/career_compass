import type { Task, TaskStatus, TaskType } from "@/hooks/useTasks";
import { startOfJstDayAsUtc } from "@/lib/datetime/jst";

export type TaskSortKey = "priority" | "due_asc" | "created_desc";
export type TaskGroupKey = "overdue" | "today" | "upcoming" | "noDue" | "done";

export const taskTypes: TaskType[] = [
  "es",
  "web_test",
  "self_analysis",
  "gakuchika",
  "video",
  "other",
];

export const taskFilterTabs = [
  { key: "all", label: "すべて" },
  { key: "open", label: "未完了" },
  { key: "done", label: "完了" },
];

export const taskSortOptions = [
  { value: "priority", label: "優先度順" },
  { value: "due_asc", label: "期限が近い順" },
  { value: "created_desc", label: "作成日 (新しい順)" },
];

export const taskTypeStyles: Record<
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

export const TASK_GROUPS: {
  key: TaskGroupKey;
  label: string;
  description: string;
}[] = [
  { key: "overdue", label: "期限切れ", description: "先に確認" },
  { key: "today", label: "今日まで", description: "今日の集中枠" },
  { key: "upcoming", label: "今後", description: "期限が近い順" },
  { key: "noDue", label: "期限なし", description: "余裕がある時" },
  { key: "done", label: "完了", description: "完了済み" },
];

export const TASK_KANBAN_COLUMNS: {
  key: TaskGroupKey;
  label: string;
  emptyLabel: string;
  accentClass: string;
  headerBorderClass: string;
}[] = [
  {
    key: "overdue",
    label: "期限切れ",
    emptyLabel: "期限切れのタスクはありません",
    accentClass: "text-destructive",
    headerBorderClass: "border-destructive/55",
  },
  {
    key: "today",
    label: "今日まで",
    emptyLabel: "今日までのタスクはありません",
    accentClass: "text-primary",
    headerBorderClass: "border-primary/55",
  },
  {
    key: "upcoming",
    label: "今後",
    emptyLabel: "今後のタスクはありません",
    accentClass: "text-slate-700",
    headerBorderClass: "border-slate-400/70",
  },
  {
    key: "noDue",
    label: "期限なし",
    emptyLabel: "期限なしのタスクはありません",
    accentClass: "text-slate-700",
    headerBorderClass: "border-slate-400/70",
  },
  {
    key: "done",
    label: "完了",
    emptyLabel: "完了したタスクはありません",
    accentClass: "text-success",
    headerBorderClass: "border-success/55",
  },
];

export function dateFromTaskDueDate(dueDate: string | null) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDaysLeft(dueDate: string | null, baseDate = new Date()) {
  const date = dateFromTaskDueDate(dueDate);
  if (!date) return null;
  const today = startOfJstDayAsUtc(baseDate);
  const dueDay = startOfJstDayAsUtc(date);
  return Math.ceil(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function getTaskGroup(task: Task, baseDate = new Date()): TaskGroupKey {
  if (task.status === "done") return "done";
  const daysLeft = getDaysLeft(task.dueDate, baseDate);
  if (daysLeft == null) return "noDue";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  return "upcoming";
}

export function getDueLabel(task: Task, baseDate = new Date()) {
  const dueDate = dateFromTaskDueDate(task.dueDate);
  if (!dueDate) return "期限なし";
  const daysLeft = getDaysLeft(task.dueDate, baseDate);
  const formattedDate = dueDate.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
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

export function getDaysLeftLabel(daysLeft: number | null, status: TaskStatus) {
  if (status === "done") return "完了";
  if (daysLeft == null) return "期限なし";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return "今日";
  if (daysLeft === 1) return "明日";
  return `あと${daysLeft}日`;
}

export function getDaysLeftColor(daysLeft: number | null, status: TaskStatus) {
  if (status === "done") return "text-success";
  if (daysLeft == null) return "text-muted-foreground";
  if (daysLeft < 0) return "text-destructive font-medium";
  if (daysLeft < 3) return "text-destructive";
  if (daysLeft < 7) return "text-warning-foreground";
  return "text-muted-foreground";
}

export function formatDueDate(dueDate: string) {
  const date = new Date(dueDate);
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
  });
}

export function sortTasksByPriority(a: Task, b: Task) {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  const aDate =
    dateFromTaskDueDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDate =
    dateFromTaskDueDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDate !== bDate) return aDate - bDate;
  return a.sortOrder - b.sortOrder;
}

export function sortTasks(a: Task, b: Task, sortBy: TaskSortKey) {
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

export function matchesTaskQuery(task: Task, query: string) {
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

export function buildGroupedTasks(tasks: Task[], baseDate = new Date()) {
  const groups: Record<TaskGroupKey, Task[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    noDue: [],
    done: [],
  };
  for (const task of tasks) {
    groups[getTaskGroup(task, baseDate)].push(task);
  }
  return groups;
}
