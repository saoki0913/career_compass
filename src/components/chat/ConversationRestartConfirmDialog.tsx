"use client";

import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConversationRestartConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
}

export function ConversationRestartConfirmDialog({
  isOpen,
  title = "会話をやり直しますか？",
  description = "新しい作成セッションを開始します。進行中の会話はセッション履歴に残りますが、いまのセッションからは切り替わります。",
  confirmLabel = "新しい会話を始める",
  onCancel,
  onConfirm,
  isConfirming = false,
}: ConversationRestartConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isConfirming && onCancel()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
            キャンセル
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming} className="inline-flex items-center gap-2">
            {isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                開始中...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
