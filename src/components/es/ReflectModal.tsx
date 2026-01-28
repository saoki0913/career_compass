"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ReflectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUndo?: () => void;
  originalText: string;
  newText: string;
  isFullDocument?: boolean;
}

const AlertIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UndoIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
  </svg>
);

export function ReflectModal({
  isOpen,
  onClose,
  onConfirm,
  onUndo,
  originalText,
  newText,
  isFullDocument = false,
}: ReflectModalProps) {
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimer, setUndoTimer] = useState(10);

  useEffect(() => {
    if (showUndo) {
      const interval = setInterval(() => {
        setUndoTimer((prev) => {
          if (prev <= 1) {
            setShowUndo(false);
            return 10;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [showUndo]);

  const handleConfirm = () => {
    onConfirm();
    setShowUndo(true);
    setUndoTimer(10);
  };

  const handleUndo = () => {
    if (onUndo) {
      onUndo();
    }
    setShowUndo(false);
    setUndoTimer(10);
  };

  if (!isOpen && !showUndo) return null;

  const truncate = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Show undo notification instead of modal
  if (showUndo) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
        <div className="bg-background border border-border rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-md">
          <div className="flex-1">
            <p className="text-sm font-medium">リライトを反映しました</p>
            <p className="text-xs text-muted-foreground mt-1">
              {undoTimer}秒以内に元に戻せます
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleUndo}>
            <UndoIcon />
            <span className="ml-1">元に戻す</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-amber-500">
              <AlertIcon />
            </span>
            <h3 className="text-lg font-semibold">リライトを反映しますか？</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {isFullDocument && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>注意:</strong> 全文添削の反映はコピーのみ対応しています。
                ドキュメントを直接置き換えることはできません。
              </p>
            </div>
          )}

          {/* Before */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              変更前（現在のテキスト）
            </p>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-900 whitespace-pre-wrap line-through decoration-red-300">
                {truncate(originalText)}
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>

          {/* After */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              変更後（リライト結果）
            </p>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm text-emerald-900 whitespace-pre-wrap">
                {truncate(newText)}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            反映後、「元に戻す」ボタンで変更を取り消せます
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose} className="flex-1">
            キャンセル
          </Button>
          <Button onClick={handleConfirm} className="flex-1" disabled={isFullDocument}>
            {isFullDocument ? "コピーのみ可能" : "反映する"}
          </Button>
        </div>
      </div>
    </div>
  );
}
