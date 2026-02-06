"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>本当に削除しますか?</DialogTitle>
          <DialogDescription>
            「{title}」とそのすべての深掘り会話履歴が完全に削除されます。
            <br />
            この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
