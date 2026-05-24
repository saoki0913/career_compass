import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

const SKELETON_SCROLL_ROW_CLASS =
  "flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80";

const SKELETON_CONTROL_ROW_CLASS =
  "grid w-full min-w-0 grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-2 lg:overflow-x-auto lg:pb-1";

/** Mirrors the responsive `ListPageFilterBar` layout. */
export function ListPageFilterBarSkeleton({
  variant,
}: {
  variant: "es" | "companies" | "gakuchika" | "tasks" | "deadlines" | "search";
}) {
  const tabCount =
    variant === "search"
      ? 0
      : variant === "es"
        ? 3
        : variant === "tasks"
          ? 3
          : variant === "companies" || variant === "gakuchika"
            ? 4
            : 5;
  const viewToggleSlots =
    variant === "search"
      ? 0
      : variant === "gakuchika"
        ? 3
        : variant === "companies"
          ? 3
          : variant === "deadlines" || variant === "tasks" || variant === "es"
            ? 2
            : 0;
  const hasExtraFilter =
    variant === "es" ||
    variant === "companies" ||
    variant === "tasks" ||
    variant === "deadlines";
  const extraFilterSlots = variant === "es" ? 2 : hasExtraFilter ? 1 : 0;

  const isSearch = variant === "search";
  const isCompanies = variant === "companies";

  return (
    <div className={isSearch ? "mb-4 min-w-0 overflow-hidden sm:mb-5" : "mb-4 min-w-0 overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-white/92 p-3 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:mb-5 lg:px-3 lg:py-2.5"}>
      <div className="min-w-0 space-y-2">
        <div className={isSearch ? "grid w-full min-w-0 grid-cols-1 gap-2" : SKELETON_CONTROL_ROW_CLASS}>
          <Skeleton className={isSearch ? "h-[52px] w-full rounded-[1.1rem]" : isCompanies ? "col-span-2 h-[52px] w-full rounded-[1.1rem] lg:h-9 lg:w-[14rem] lg:flex-none lg:rounded-xl xl:w-[16rem]" : "col-span-2 h-[52px] w-full rounded-[1.1rem] lg:h-9 lg:min-w-[11rem] lg:max-w-[15rem] lg:flex-[0_1_14rem] lg:rounded-xl"} />
          {!isSearch ? <Skeleton className={isCompanies ? "h-12 w-full rounded-xl lg:h-9 lg:w-[170px] lg:shrink-0" : "h-12 w-full shrink-0 rounded-xl lg:h-9 lg:w-[150px]"} /> : null}
          {Array.from({ length: extraFilterSlots }).map((_, i) => (
            <div
              key={i}
              className={isCompanies || variant === "tasks" || variant === "deadlines" || variant === "es" ? "min-w-0" : "col-span-2 min-w-0"}
            >
              <Skeleton
                className={
                  isCompanies
                    ? "h-12 w-full rounded-xl lg:h-9 lg:w-[160px] lg:shrink-0"
                    : variant === "es" && i === 1
                      ? "h-12 w-full shrink-0 rounded-xl lg:h-9 lg:w-[160px] lg:rounded-md"
                      : "h-12 w-full shrink-0 rounded-xl lg:h-9 lg:w-[150px] lg:rounded-md"
                }
              />
            </div>
          ))}
          {viewToggleSlots > 0 ? (
            <div className="col-span-2 w-full shrink-0 lg:w-auto">
              <div className="flex h-11 w-full items-center gap-1 rounded-xl bg-muted/50 p-1 lg:h-9 lg:w-fit lg:rounded-lg">
                {Array.from({ length: viewToggleSlots }).map((_, i) => (
                  <Skeleton key={i} className="h-9 flex-1 rounded-md lg:h-7 lg:w-9 lg:flex-none" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {tabCount > 0 ? (
          <div className={SKELETON_SCROLL_ROW_CLASS}>
            {Array.from({ length: tabCount }).map((_, i) => (
              <SkeletonPill key={i} className="h-9 w-[5.25rem] shrink-0 lg:h-8 lg:w-20" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
