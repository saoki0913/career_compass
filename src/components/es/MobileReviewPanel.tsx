"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ReviewPanel } from "./ReviewPanel";
import type { CompanyReviewStatus } from "./ReviewPanel";

interface SectionReviewRequest {
  sectionTitle: string;
  sectionContent: string;
  sectionCharLimit?: number;
}

interface MobileReviewPanelProps {
  documentId: string;
  companyReviewStatus?: CompanyReviewStatus;
  companyId?: string;
  companyName?: string;
  onApplyRewrite?: (newContent: string, sectionTitle?: string | null) => void;
  onUndo?: () => void;
  sectionReviewRequest?: SectionReviewRequest | null;
  onClearSectionReview?: () => void;
  className?: string;
}

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

function isMobileViewport() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function MobileReviewPanel({
  documentId,
  companyReviewStatus = "no_company_selected",
  companyId,
  companyName,
  onApplyRewrite,
  onUndo,
  sectionReviewRequest,
  onClearSectionReview,
  className,
}: MobileReviewPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const headerDescription =
    companyReviewStatus === "ready_for_es_review" && companyName
      ? `設問を選択すると、ここで${companyName}に合わせたAI添削ができます`
      : "設問を選択すると、ここでAI添削ができます";

  useEffect(() => {
    if (sectionReviewRequest && isMobileViewport()) {
      const openId = window.setTimeout(() => setIsOpen(true), 0);
      return () => window.clearTimeout(openId);
    }
  }, [sectionReviewRequest]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setIsOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (open && !isMobileViewport()) {
      return;
    }
    setIsOpen(open);
    if (!open && sectionReviewRequest) {
      onClearSectionReview?.();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          className={cn(
            "fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary p-0 shadow-lg lg:hidden",
            className,
          )}
          size="icon"
        >
          <Sparkles className="size-5 text-primary-foreground" />
          <span className="sr-only">AI添削</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="flex h-[94vh] min-h-[70vh] flex-col overflow-hidden rounded-t-[30px] border-0 bg-background p-0 lg:hidden"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            AI添削
          </SheetTitle>
          <SheetDescription className="text-sm leading-6">
            {headerDescription}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ReviewPanel
            documentId={documentId}
            companyReviewStatus={companyReviewStatus}
            companyId={companyId}
            companyName={companyName}
            onApplyRewrite={onApplyRewrite}
            onUndo={onUndo}
            sectionReviewRequest={sectionReviewRequest}
            onClearSectionReview={onClearSectionReview}
            className="h-full"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
