export type ProductPageHeaderVariant = "list" | "form" | "detail" | "workspace" | "compact";

export const PRODUCT_PAGE_HEADER_SPACING: Record<ProductPageHeaderVariant, string> = {
  list: "mb-4 sm:mb-5",
  form: "mb-5 sm:mb-6",
  detail: "mb-4 border-b border-border/50 pb-4",
  workspace: "mb-3",
  compact: "mb-4",
};

export const PRODUCT_PAGE_HEADER_ROW_CLASS: Record<ProductPageHeaderVariant, string> = {
  list: "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 lg:items-center",
  form: "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 lg:items-center",
  detail: "flex flex-col gap-3 min-[1180px]:flex-row min-[1180px]:items-center min-[1180px]:justify-between",
  workspace: "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
  compact: "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 lg:items-center",
};

export const PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET = "pl-[3.75rem] sm:pl-[4.25rem] lg:pl-0";

export const PRODUCT_PAGE_TITLE_CLASS: Record<ProductPageHeaderVariant, string> = {
  list: "min-w-0 break-words text-[1.375rem] font-bold leading-[1.18] text-foreground",
  form: "min-w-0 break-words text-[1.375rem] font-bold leading-[1.18] text-foreground",
  detail: "min-w-0 break-words text-[1.5rem] font-bold leading-[1.18] text-foreground",
  workspace: "min-w-0 break-words text-[1.375rem] font-bold leading-[1.18] text-foreground",
  compact: "min-w-0 break-words text-[1.375rem] font-bold leading-[1.18] text-foreground",
};

export const CONVERSATION_WORKSPACE_OUTER_PADDING =
  "px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-4";

export const CONVERSATION_WORKSPACE_HEADER_ROW =
  "mb-3 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between";

export const PRODUCT_BACK_BUTTON_TOUCH_CLASS =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:h-9 lg:w-9 lg:rounded-xl";

export const PRODUCT_BACK_BUTTON_VISUAL_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/92 text-slate-700 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.5)] transition-colors group-hover:bg-slate-50 group-hover:text-slate-950 lg:h-8 lg:w-8 lg:rounded-lg";
