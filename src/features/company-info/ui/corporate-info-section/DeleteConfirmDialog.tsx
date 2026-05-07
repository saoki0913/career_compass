"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon, LoadingSpinner } from "./icons";

interface DeleteConfirmDialogProps {
  selectedCount: number;
  isDeleting: boolean;
  deleteError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  selectedCount,
  isDeleting,
  deleteError,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangleIcon />
            </div>
            <h3 className="mb-2 text-lg font-semibold">ソースを削除しますか？</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              選択した{selectedCount}件のソースと、それに関連するRAGデータが削除されます。
              この操作は取り消せません。
            </p>
            {deleteError && (
              <div className="mb-4 w-full rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">{deleteError}</p>
              </div>
            )}
            <div className="flex w-full gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onCancel}
                disabled={isDeleting}
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={onConfirm}
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
        </CardContent>
      </Card>
    </div>
  );
}
