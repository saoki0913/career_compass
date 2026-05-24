import type { ReactNode } from "react";
import { Skeleton, SkeletonButton, SkeletonText } from "@/components/ui/skeleton";
import {
  PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET,
  PRODUCT_PAGE_HEADER_ROW_CLASS,
  PRODUCT_PAGE_HEADER_SPACING,
  type ProductPageHeaderVariant,
} from "@/components/shared/product-page-header-layout";
import { cn } from "@/lib/utils";

type ProductPageHeaderSkeletonProps = {
  variant?: ProductPageHeaderVariant;
  actionCount?: 0 | 1 | 2;
  showBadge?: boolean;
  showDescription?: boolean;
  descriptionMode?: "desktop" | "always";
  showBackLink?: boolean;
  actionsSkeleton?: ReactNode;
  showMobilePrimaryAction?: boolean;
  avoidSidebarToggle?: boolean;
  className?: string;
};

export function ProductPageHeaderSkeleton({
  variant = "list",
  actionCount = 1,
  showBadge = true,
  showDescription = true,
  descriptionMode = "desktop",
  showBackLink = false,
  actionsSkeleton,
  showMobilePrimaryAction = false,
  avoidSidebarToggle = true,
  className,
}: ProductPageHeaderSkeletonProps) {
  return (
    <div className={cn(PRODUCT_PAGE_HEADER_SPACING[variant], className)}>
      <div
        className={cn(
          PRODUCT_PAGE_HEADER_ROW_CLASS[variant],
          avoidSidebarToggle && PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET,
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          {showBackLink ? <Skeleton className="h-12 w-12 shrink-0 rounded-2xl lg:h-9 lg:w-9 lg:rounded-xl" /> : null}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <Skeleton className="h-7 w-36 rounded-lg lg:w-40" />
              {showBadge ? <Skeleton className="h-6 w-24 rounded-full" /> : null}
            </div>
            {showDescription ? (
              <SkeletonText
                lines={1}
                widths={["min(18rem,100%)"]}
                lineClassName="h-4"
                className={descriptionMode === "desktop" ? "hidden sm:block" : undefined}
              />
            ) : null}
          </div>
        </div>
        {actionsSkeleton ?? (actionCount > 0 ? (
          <div className={cn("col-start-2 row-start-1 flex min-w-0 shrink-0 flex-wrap justify-end gap-2 justify-self-end lg:w-auto", showMobilePrimaryAction && "max-sm:hidden")}>
            {Array.from({ length: actionCount }, (_, index) => (
              <SkeletonButton key={index} className="h-11 min-w-0 flex-1 rounded-xl lg:h-9 lg:w-28 lg:flex-none" />
            ))}
          </div>
        ) : null)}
      </div>
      {showMobilePrimaryAction ? (
        <Skeleton className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-5 z-40 h-14 w-14 rounded-full sm:hidden" />
      ) : null}
    </div>
  );
}
