"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useSubmissions,
  SubmissionItem,
  SUBMISSION_TYPES,
  SUBMISSION_STATUS,
} from "@/hooks/useSubmissions";

// Icons
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const CircleIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

interface SubmissionsListProps {
  applicationId: string;
}

export function SubmissionsList({ applicationId }: SubmissionsListProps) {
  const {
    submissions,
    isLoading,
    error,
    createSubmission,
    updateSubmission,
    deleteSubmission,
  } = useSubmissions(applicationId);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newItem, setNewItem] = useState({
    type: "es" as SubmissionItem["type"],
    name: "",
    isRequired: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) {
      setFormError("名前を入力してください");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await createSubmission({
        type: newItem.type,
        name: newItem.name.trim(),
        isRequired: newItem.isRequired,
      });
      setNewItem({ type: "es", name: "", isRequired: false });
      setShowNewForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (item: SubmissionItem) => {
    const statusOrder: SubmissionItem["status"][] = ["not_started", "in_progress", "completed"];
    const currentIndex = statusOrder.indexOf(item.status);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];

    try {
      await updateSubmission(item.id, { status: nextStatus });
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubmission(id);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const getStatusIcon = (status: SubmissionItem["status"]) => {
    switch (status) {
      case "completed":
        return <CheckIcon />;
      case "in_progress":
        return <ClockIcon />;
      default:
        return <CircleIcon />;
    }
  };

  const getStatusColor = (status: SubmissionItem["status"]) => {
    switch (status) {
      case "completed":
        return "text-emerald-600 bg-emerald-100";
      case "in_progress":
        return "text-amber-600 bg-amber-100";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  const requiredItems = submissions.filter((s) => s.isRequired);
  const optionalItems = submissions.filter((s) => !s.isRequired);
  const completedCount = submissions.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">提出物</h3>
          <p className="text-xs text-muted-foreground">
            {completedCount}/{submissions.length} 完了
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNewForm(true)}>
          <PlusIcon />
          <span className="ml-1">追加</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* New Item Form */}
      {showNewForm && (
        <Card>
          <CardContent className="py-4">
            <form onSubmit={handleCreate} className="space-y-4">
              {formError && (
                <div className="p-2 rounded bg-red-50 border border-red-200">
                  <p className="text-xs text-red-800">{formError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <select
                  value={newItem.type}
                  onChange={(e) =>
                    setNewItem({ ...newItem, type: e.target.value as SubmissionItem["type"] })
                  }
                  className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                >
                  {Object.entries(SUBMISSION_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="名前（例: 志望動機ES）"
                  className="flex-1"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isRequired"
                  checked={newItem.isRequired}
                  onChange={(e) => setNewItem({ ...newItem, isRequired: e.target.checked })}
                  className="rounded border-input"
                />
                <Label htmlFor="isRequired" className="text-sm">
                  必須項目
                </Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewForm(false)}
                >
                  キャンセル
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? <LoadingSpinner /> : "追加"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          提出物がありません
        </p>
      ) : (
        <div className="space-y-4">
          {/* Required Items */}
          {requiredItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">必須</p>
              {requiredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-background"
                >
                  <button
                    onClick={() => handleStatusChange(item)}
                    className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full transition-colors",
                      getStatusColor(item.status)
                    )}
                  >
                    {getStatusIcon(item.status)}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", item.status === "completed" && "line-through text-muted-foreground")}>
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SUBMISSION_TYPES[item.type]}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      getStatusColor(item.status)
                    )}
                  >
                    {SUBMISSION_STATUS[item.status]}
                  </span>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Optional Items */}
          {optionalItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">任意</p>
              {optionalItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-background"
                >
                  <button
                    onClick={() => handleStatusChange(item)}
                    className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full transition-colors",
                      getStatusColor(item.status)
                    )}
                  >
                    {getStatusIcon(item.status)}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", item.status === "completed" && "line-through text-muted-foreground")}>
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SUBMISSION_TYPES[item.type]}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      getStatusColor(item.status)
                    )}
                  >
                    {SUBMISSION_STATUS[item.status]}
                  </span>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
