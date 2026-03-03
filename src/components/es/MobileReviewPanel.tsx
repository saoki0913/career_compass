"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ReviewPanel } from "./ReviewPanel";
import type { SectionData } from "@/hooks/useESReview";

interface SectionReviewRequest {
  sectionTitle: string;
  sectionContent: string;
  sectionCharLimit?: number;
}

interface MobileReviewPanelProps {
  documentId: string;
  content: string;
  sections?: string[];
  sectionData?: SectionData[];
  hasCompanyRag?: boolean;
  companyId?: string;
  companyName?: string;
  isPaid?: boolean;
  onApplyRewrite?: (newContent: string, sectionTitle?: string | null) => void;
  onUndo?: () => void;
  sectionReviewRequest?: SectionReviewRequest | null;
  onClearSectionReview?: () => void;
  onScrollToEditorSection?: (sectionTitle: string) => void;
  className?: string;
}

const SparkleIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

function isMobileViewport() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function MobileReviewPanel({
  documentId,
  content,
  sections,
  sectionData,
  hasCompanyRag = false,
  companyId,
  companyName,
  isPaid = false,
  onApplyRewrite,
  onUndo,
  sectionReviewRequest,
  onClearSectionReview,
  onScrollToEditorSection,
  className,
}: MobileReviewPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

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
            "fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full p-0 shadow-lg lg:hidden",
            className,
          )}
          size="icon"
        >
          <SparkleIcon />
          <span className="sr-only">AI添削</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="flex h-[88vh] min-h-[60vh] flex-col overflow-hidden p-0 lg:hidden">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SparkleIcon />
            AI添削
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ReviewPanel
            documentId={documentId}
            content={content}
            sections={sections}
            sectionData={sectionData}
            hasCompanyRag={hasCompanyRag}
            companyId={companyId}
            companyName={companyName}
            isPaid={isPaid}
            onApplyRewrite={onApplyRewrite}
            onUndo={onUndo}
            sectionReviewRequest={sectionReviewRequest}
            onClearSectionReview={onClearSectionReview}
            onScrollToEditorSection={onScrollToEditorSection}
            className="h-full [&_>_div]:rounded-none [&_>_div]:border-0 [&_>_div]:shadow-none"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
