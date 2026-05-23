import type { ReactNode } from "react";
import { ProductBackButton } from "@/components/shared/ProductBackButton";
import {
  PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET,
  PRODUCT_PAGE_HEADER_ROW_CLASS,
  PRODUCT_PAGE_HEADER_SPACING,
  PRODUCT_PAGE_TITLE_CLASS,
  type ProductPageHeaderVariant,
} from "@/components/shared/product-page-header-layout";
import { cn } from "@/lib/utils";

type ProductPageHeaderBackLink = {
  href: string;
  label: string;
};

type ProductPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  backLink?: ProductPageHeaderBackLink;
  variant?: ProductPageHeaderVariant;
  descriptionMode?: "desktop" | "always";
  avoidSidebarToggle?: boolean;
  className?: string;
};

const descriptionClassByMode = {
  desktop: "mt-1 hidden text-sm leading-6 text-muted-foreground sm:block",
  always: "mt-1 text-sm leading-6 text-muted-foreground",
} satisfies Record<NonNullable<ProductPageHeaderProps["descriptionMode"]>, string>;

export function ProductPageHeader({
  title,
  description,
  badge,
  metadata,
  actions,
  backLink,
  variant = "list",
  descriptionMode = "desktop",
  avoidSidebarToggle = true,
  className,
}: ProductPageHeaderProps) {
  return (
    <div className={cn(PRODUCT_PAGE_HEADER_SPACING[variant], className)}>
      <div
        className={cn(
          PRODUCT_PAGE_HEADER_ROW_CLASS[variant],
          avoidSidebarToggle && PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {backLink ? <ProductBackButton href={backLink.href} label={backLink.label} /> : null}
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className={PRODUCT_PAGE_TITLE_CLASS}>{title}</h1>
              {badge}
            </div>
            {description ? <p className={descriptionClassByMode[descriptionMode]}>{description}</p> : null}
            {metadata ? <div className="mt-2 flex flex-wrap items-center gap-2">{metadata}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}
