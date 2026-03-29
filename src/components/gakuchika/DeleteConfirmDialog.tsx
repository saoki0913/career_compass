"use client";

import { DeleteConfirmDialog as SharedDeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  isDeleting: boolean;
}

export function DeleteConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  isDeleting,
}: DeleteConfirmDialogProps) {
  return (
    <SharedDeleteConfirmDialog
      isOpen={isOpen}
      title="ガクチカを削除しますか？"
      description={`「${title}」とその作成会話履歴が完全に削除されます。この操作は取り消せません。`}
      isDeleting={isDeleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
