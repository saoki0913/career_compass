export type FilterBarLayoutKey = "default" | "companies" | "search" | "tasks";

export type FilterBarVariant = "default" | "companies" | "search" | "es";

export type FilterBarDensity = "default" | "tasks";

export type FilterBarSkeletonVariant = "es" | "companies" | "gakuchika" | "tasks" | "deadlines" | "search";

export function resolveFilterBarLayoutKey({
  density,
  variant,
}: {
  density?: FilterBarDensity;
  variant?: FilterBarVariant;
}): FilterBarLayoutKey {
  if (variant === "search") {
    return "search";
  }
  if (variant === "companies") {
    return "companies";
  }
  if (density === "tasks") {
    return "tasks";
  }
  return "default";
}

export function resolveSkeletonFilterBarLayoutKey(variant: FilterBarSkeletonVariant): FilterBarLayoutKey {
  if (variant === "search") {
    return "search";
  }
  if (variant === "companies" || variant === "gakuchika") {
    return "companies";
  }
  if (variant === "tasks") {
    return "tasks";
  }
  return "default";
}

export const FILTER_BAR_SHELL_CLASS =
  "mb-4 min-w-0 max-w-full overflow-visible sm:mb-5";

export const FILTER_BAR_SURFACE_CLASS =
  "rounded-[1.1rem] border border-slate-200/80 bg-white/92 p-3 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:rounded-xl lg:px-2 lg:py-1.5";

export const FILTER_BAR_INNER_CLASS = "min-w-0";

export const FILTER_BAR_CONTROL_ROW_CLASS: Record<FilterBarLayoutKey, string> = {
  default:
    "grid w-full min-w-0 grid-cols-2 gap-2 md:grid-cols-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-1.5 lg:overflow-visible",
  companies:
    "grid w-full min-w-0 grid-cols-2 gap-2 md:grid-cols-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-1.5 lg:overflow-visible",
  search: "grid w-full min-w-0 grid-cols-1 gap-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-1.5",
  tasks:
    "grid w-full min-w-0 grid-cols-2 gap-2 md:grid-cols-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-1.5 lg:overflow-visible",
};

export const FILTER_BAR_SEARCH_CLASS: Record<FilterBarLayoutKey, string> = {
  default: "relative col-span-2 min-w-0 lg:col-span-1 lg:min-w-[6.5rem] lg:max-w-[26rem] lg:flex-[1_1_8rem]",
  companies: "relative col-span-2 min-w-0 lg:col-span-1 lg:min-w-[6.5rem] lg:max-w-[26rem] lg:flex-[1_1_8rem]",
  search: "relative min-w-0 lg:max-w-[42rem] lg:flex-1",
  tasks: "relative col-span-2 min-w-0 lg:col-span-1 lg:min-w-[6.5rem] lg:max-w-[26rem] lg:flex-[1_1_8rem]",
};

export const FILTER_BAR_INPUT_CLASS =
  "h-[56px] w-full rounded-[1.1rem] border border-slate-200 bg-white pl-12 pr-4 text-[15px] shadow-[0_14px_34px_-28px_rgba(15,23,42,0.55)] transition-colors placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 lg:h-8 lg:rounded-lg lg:pl-8 lg:pr-2.5 lg:text-xs lg:shadow-none";

export const FILTER_BAR_SELECT_TRIGGER_CLASS =
  "h-12 min-w-0 shrink-0 rounded-xl text-[15px] lg:h-8 lg:w-[7rem] lg:rounded-lg lg:px-2 lg:text-xs";

export const FILTER_BAR_EXTRA_FILTER_CLASS =
  "grid min-w-0 grid-cols-1 gap-2 [&>*]:min-w-0 [&>*]:w-full lg:contents lg:[&>*]:h-8 lg:[&>*]:w-[7rem] lg:[&>*]:shrink-0 lg:[&>*]:rounded-lg lg:[&>*]:px-2 lg:[&>*]:text-xs";

export const FILTER_BAR_VIEW_TOGGLE_SLOT_CLASS =
  "col-span-2 min-w-0 shrink-0 lg:col-span-1 lg:w-auto";

export const FILTER_BAR_ACTIONS_CLASS =
  "col-span-2 flex shrink-0 items-center justify-end gap-2 lg:col-span-1 lg:ml-auto lg:gap-1.5";

export const FILTER_BAR_STATUS_ROW_CLASS =
  "col-span-2 flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 lg:col-span-1 lg:w-auto lg:flex-[0_1_auto] lg:gap-1 lg:overflow-visible lg:pb-0 lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden";

export const FILTER_BAR_STATUS_TAB_CLASS =
  "flex h-10 max-w-[9rem] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-all duration-200 lg:h-8 lg:max-w-[4.9rem] lg:min-w-0 lg:shrink lg:gap-1 lg:px-1.5 lg:text-[11px]";

export const FILTER_BAR_STATUS_COUNT_CLASS =
  "rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200 lg:px-1 lg:text-[10px]";

export const FILTER_BAR_ACTIVE_FILTER_MOBILE_CLASS =
  "shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary lg:hidden";

export const FILTER_BAR_ACTIVE_FILTER_SUMMARY_CLASS =
  "hidden h-8 shrink-0 items-center rounded-full border border-primary/20 bg-primary/5 px-2 text-[11px] font-semibold text-primary lg:inline-flex";

export const FILTER_BAR_SKELETON_PROFILES: Record<
  FilterBarSkeletonVariant,
  {
    extraFilterSlots: number;
    tabCount: number;
    viewToggleSlots: number;
  }
> = {
  companies: { extraFilterSlots: 1, tabCount: 4, viewToggleSlots: 3 },
  deadlines: { extraFilterSlots: 1, tabCount: 5, viewToggleSlots: 2 },
  es: { extraFilterSlots: 2, tabCount: 3, viewToggleSlots: 2 },
  gakuchika: { extraFilterSlots: 0, tabCount: 4, viewToggleSlots: 3 },
  search: { extraFilterSlots: 0, tabCount: 0, viewToggleSlots: 0 },
  tasks: { extraFilterSlots: 1, tabCount: 3, viewToggleSlots: 2 },
};
