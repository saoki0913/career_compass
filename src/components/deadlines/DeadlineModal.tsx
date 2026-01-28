"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeadlineForm } from "./DeadlineForm";
import {
  Deadline,
  CreateDeadlineInput,
  UpdateDeadlineInput,
} from "@/hooks/useCompanyDeadlines";

interface DeadlineModalProps {
  isOpen: boolean;
  deadline?: Deadline;
  onClose: () => void;
  onSubmit: (data: CreateDeadlineInput | UpdateDeadlineInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function DeadlineModal({
  isOpen,
  deadline,
  onClose,
  onSubmit,
  onDelete,
}: DeadlineModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (data: CreateDeadlineInput | UpdateDeadlineInput) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      onClose();
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
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isSubmitting && !isDeleting && onClose()}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{deadline ? "締切を編集" : "締切を追加"}</CardTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            disabled={isSubmitting || isDeleting}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </CardHeader>
        <CardContent>
          {showDeleteConfirm ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                この締切を削除してもよろしいですか？この操作は取り消せません。
              </p>
              <div className="flex justify-end gap-2">
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
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                      削除中...
                    </>
                  ) : (
                    "削除する"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DeadlineForm
                deadline={deadline}
                onSubmit={handleSubmit}
                onCancel={onClose}
                isSubmitting={isSubmitting}
              />

              {deadline && onDelete && (
                <div className="mt-4 pt-4 border-t">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSubmitting}
                  >
                    この締切を削除
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
