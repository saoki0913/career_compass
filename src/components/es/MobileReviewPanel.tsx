"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ReviewPanel } from "./ReviewPanel";
import type { SectionData } from "@/hooks/useESReview";

// Section review request from parent component
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
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

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

  // Auto-open when section review is requested
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && sectionReviewRequest) {
      onClearSectionReview?.();
    }
  };

  // Handle apply rewrite - close sheet after applying
  const handleApplyRewrite = (newContent: string, sectionTitle?: string | null) => {
    onApplyRewrite?.(newContent, sectionTitle);
    setIsOpen(false);
  };

  // Handle scroll to editor section - close sheet first, then scroll
  const handleScrollToEditorSection = (sectionTitle: string) => {
    setIsOpen(false);
    // Delay scroll until sheet close animation completes
    setTimeout(() => {
      onScrollToEditorSection?.(sectionTitle);
    }, 300);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          className={cn(
            "fixed bottom-4 right-4 z-40 rounded-full h-14 w-14 shadow-lg lg:hidden",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "flex items-center justify-center p-0",
            className
          )}
          size="icon"
        >
          <SparkleIcon />
          <span className="sr-only">AI添削</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[85vh] overflow-hidden flex flex-col p-0"
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SparkleIcon />
            AI添削
            {sectionReviewRequest && (
              <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                設問モード
              </span>
            )}
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
            onApplyRewrite={handleApplyRewrite}
            onUndo={onUndo}
            sectionReviewRequest={sectionReviewRequest}
            onClearSectionReview={onClearSectionReview}
            onScrollToEditorSection={handleScrollToEditorSection}
            className="h-full [&_>_div]:border-0 [&_>_div]:rounded-none [&_>_div]:shadow-none"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
