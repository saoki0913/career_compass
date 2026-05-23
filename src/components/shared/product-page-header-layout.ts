export type ProductPageHeaderVariant = "list" | "form" | "detail" | "workspace" | "compact";

export const PRODUCT_PAGE_HEADER_SPACING: Record<ProductPageHeaderVariant, string> = {
  list: "mb-8",
  form: "mb-8",
  detail: "mb-5 border-b border-border/50 pb-5",
  workspace: "mb-4",
  compact: "mb-6",
};

export const PRODUCT_PAGE_HEADER_ROW_CLASS: Record<ProductPageHeaderVariant, string> = {
  list: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
  form: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
  detail: "flex flex-col gap-4 min-[1180px]:flex-row min-[1180px]:items-start min-[1180px]:justify-between",
  workspace: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
  compact: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
};

export const PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET = "pl-14 lg:pl-0";

export const PRODUCT_PAGE_TITLE_CLASS =
  "min-w-0 break-words text-2xl font-bold tracking-tight text-foreground";

export const PRODUCT_BACK_BUTTON_TOUCH_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export const PRODUCT_BACK_BUTTON_VISUAL_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors group-hover:bg-muted/70 group-hover:text-foreground";
