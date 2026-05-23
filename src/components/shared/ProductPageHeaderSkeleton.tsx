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
        <div className="flex min-w-0 items-start gap-3">
          {showBackLink ? <Skeleton className="h-11 w-11 shrink-0 rounded-xl" /> : null}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-40 rounded-lg" />
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
          <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
            {Array.from({ length: actionCount }, (_, index) => (
              <SkeletonButton key={index} className="h-10 min-w-0 flex-1 sm:w-32 sm:flex-none" />
            ))}
          </div>
        ) : null)}
      </div>
    </div>
  );
}
