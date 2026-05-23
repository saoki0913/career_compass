"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConversationSummaryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

export function ConversationSummaryDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ConversationSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-6xl flex-col overflow-hidden rounded-3xl border-border/70 p-0 shadow-xl">
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5 text-left">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-2 text-sm leading-6">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
