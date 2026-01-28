"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Application,
  ApplicationType,
  ApplicationStatus,
  APPLICATION_TYPE_LABELS,
  APPLICATION_STATUS_LABELS,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "@/hooks/useApplications";
import { SubmissionsList } from "@/components/submissions/SubmissionsList";
import { cn } from "@/lib/utils";

interface ApplicationModalProps {
  isOpen: boolean;
  application?: Application;
  onClose: () => void;
  onSubmit: (data: CreateApplicationInput | UpdateApplicationInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

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

const applicationTypes: ApplicationType[] = [
  "summer_intern",
  "fall_intern",
  "winter_intern",
  "early",
  "main",
  "other",
];

const applicationStatuses: ApplicationStatus[] = ["active", "completed", "withdrawn"];

const statusColors: Record<ApplicationStatus, { bg: string; text: string }> = {
  active: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
  withdrawn: { bg: "bg-gray-100", text: "text-gray-600" },
};

type PhaseTemplate = "main_selection" | "internship" | "custom";

const PHASE_TEMPLATES: Record<
  PhaseTemplate,
  { label: string; phases: string[] }
> = {
  main_selection: {
    label: "本選考",
    phases: ["ES提出", "1次面接", "2次面接", "最終面接", "内定"],
  },
  internship: {
    label: "インターン",
    phases: ["ES提出", "GD", "面接", "参加"],
  },
  custom: {
    label: "カスタム",
    phases: [],
  },
};

export function ApplicationModal({
  isOpen,
  application,
  onClose,
  onSubmit,
  onDelete,
}: ApplicationModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ApplicationType>("main");
  const [status, setStatus] = useState<ApplicationStatus>("active");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PhaseTemplate>("custom");
  const [phases, setPhases] = useState<string[]>([]);

  const isEditing = !!application;

  useEffect(() => {
    if (application) {
      setName(application.name);
      setType(application.type);
      setStatus(application.status);
      setPhases(application.phase || []);
      setSelectedTemplate("custom");
    } else {
      setName("");
      setType("main");
      setStatus("active");
      setPhases([]);
      setSelectedTemplate("custom");
    }
    setError(null);
    setShowDeleteConfirm(false);
  }, [application, isOpen]);

  const handleTemplateChange = (template: PhaseTemplate) => {
    setSelectedTemplate(template);
    if (template !== "custom") {
      setPhases(PHASE_TEMPLATES[template].phases);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("応募枠名を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        await onSubmit({ name: name.trim(), type, status, phase: phases });
      } else {
        await onSubmit({ name: name.trim(), type, phase: phases });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
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
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className={cn("w-full my-8", isEditing ? "max-w-2xl" : "max-w-md")}>
        <CardHeader>
          <CardTitle>{isEditing ? "応募枠を編集" : "応募枠を追加"}</CardTitle>
        </CardHeader>
        <CardContent>
          {showDeleteConfirm ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                「{application?.name}」を削除しますか？関連する締切や職種も削除されます。
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
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
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">応募枠名 *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="夏インターン2025"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>種類 *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {applicationTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                        type === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                      )}
                    >
                      {APPLICATION_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-2">
                  <Label>選考フェーズテンプレート</Label>
                  <div className="flex gap-2">
                    {(Object.keys(PHASE_TEMPLATES) as PhaseTemplate[]).map((template) => (
                      <button
                        key={template}
                        type="button"
                        onClick={() => handleTemplateChange(template)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                          selectedTemplate === template
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                        )}
                      >
                        {PHASE_TEMPLATES[template].label}
                      </button>
                    ))}
                  </div>
                  {phases.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-2">フェーズ:</p>
                      <div className="flex flex-wrap gap-2">
                        {phases.map((phase, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700"
                          >
                            {phase}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isEditing && (
                <div className="space-y-2">
                  <Label>ステータス</Label>
                  <div className="flex gap-2">
                    {applicationStatuses.map((s) => {
                      const colors = statusColors[s];
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(s)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                            status === s ? "ring-2 ring-primary ring-offset-2" : "",
                            colors.bg,
                            colors.text
                          )}
                        >
                          {APPLICATION_STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submissions section - only shown when editing */}
              {isEditing && application && (
                <div className="pt-4 border-t">
                  <SubmissionsList applicationId={application.id} />
                </div>
              )}

              <div className="flex justify-between pt-4">
                <div>
                  {isEditing && onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      削除
                    </Button>
                  )}
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
