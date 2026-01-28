"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Deadline,
  DeadlineType,
  CreateDeadlineInput,
  UpdateDeadlineInput,
  DEADLINE_TYPE_LABELS,
} from "@/hooks/useCompanyDeadlines";

interface DeadlineFormProps {
  deadline?: Deadline;
  onSubmit: (data: CreateDeadlineInput | UpdateDeadlineInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DEADLINE_TYPES: DeadlineType[] = [
  "es_submission",
  "web_test",
  "aptitude_test",
  "interview_1",
  "interview_2",
  "interview_3",
  "interview_final",
  "briefing",
  "internship",
  "offer_response",
  "other",
];

function formatDateForInput(dateString: string | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function DeadlineForm({
  deadline,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DeadlineFormProps) {
  const [type, setType] = useState<DeadlineType>(deadline?.type || "es_submission");
  const [title, setTitle] = useState(deadline?.title || "");
  const [dueDate, setDueDate] = useState(formatDateForInput(deadline?.dueDate));
  const [memo, setMemo] = useState(deadline?.memo || "");
  const [sourceUrl, setSourceUrl] = useState(deadline?.sourceUrl || "");
  const [error, setError] = useState<string | null>(null);

  // Update title when type changes (for new deadlines only)
  useEffect(() => {
    if (!deadline && !title) {
      setTitle(DEADLINE_TYPE_LABELS[type]);
    }
  }, [type, deadline, title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }

    if (!dueDate) {
      setError("締切日時を入力してください");
      return;
    }

    const data: CreateDeadlineInput | UpdateDeadlineInput = {
      type,
      title: title.trim(),
      dueDate: new Date(dueDate).toISOString(),
      memo: memo.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
    };

    try {
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="type">種類</Label>
        <select
          id="type"
          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={type}
          onChange={(e) => setType(e.target.value as DeadlineType)}
          disabled={isSubmitting}
        >
          {DEADLINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DEADLINE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: ES提出 (一次締切)"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dueDate">締切日時</Label>
        <Input
          id="dueDate"
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="memo">メモ（任意）</Label>
        <textarea
          id="memo"
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="補足メモを入力"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sourceUrl">参照URL（任意）</Label>
        <Input
          id="sourceUrl"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          disabled={isSubmitting}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          キャンセル
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              保存中...
            </>
          ) : deadline ? (
            "更新"
          ) : (
            "追加"
          )}
        </Button>
      </div>
    </form>
  );
}
