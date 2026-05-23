import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

const SKELETON_SCROLL_ROW_CLASS =
  "flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80";

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
    <div className={isSearch ? "mb-4 min-w-0 overflow-hidden sm:mb-5" : "mb-4 min-w-0 overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-white/92 p-3 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:mb-5 md:px-3 md:py-2.5"}>
      <div className="min-w-0">
        <div className={isSearch ? "grid w-full min-w-0 grid-cols-1 gap-2" : "grid w-full min-w-0 grid-cols-2 gap-2 md:flex md:flex-nowrap md:items-center md:gap-2 md:overflow-x-auto md:pb-1"}>
          <Skeleton className={isSearch ? "h-[52px] w-full rounded-[1.1rem]" : isCompanies ? "col-span-2 h-[52px] w-full rounded-[1.1rem] md:h-9 md:w-[12rem] md:flex-none md:rounded-xl lg:w-[14rem]" : "col-span-2 h-[52px] w-full rounded-[1.1rem] md:h-9 md:min-w-[11rem] md:max-w-[14rem] md:flex-[0_1_13rem] md:rounded-xl"} />
          {!isSearch ? <Skeleton className={isCompanies ? "h-12 w-full rounded-xl md:h-9 md:w-[150px] md:shrink-0 lg:w-[170px]" : "h-12 w-full shrink-0 rounded-xl md:h-9 md:w-[150px]"} /> : null}
          {Array.from({ length: extraFilterSlots }).map((_, i) => (
            <div
              key={i}
              className={isCompanies || variant === "tasks" || variant === "deadlines" || variant === "es" ? "min-w-0" : "col-span-2 min-w-0"}
            >
              <Skeleton
                className={
                  isCompanies
                    ? "h-12 w-full rounded-xl md:h-9 md:w-[130px] md:shrink-0 lg:w-[160px]"
                    : variant === "es" && i === 1
                      ? "h-12 w-full shrink-0 rounded-xl md:h-9 md:w-[132px] md:rounded-md lg:w-[160px]"
                      : "h-12 w-full shrink-0 rounded-xl md:h-9 md:w-[150px] md:rounded-md"
                }
              />
            </div>
          ))}
          {viewToggleSlots > 0 ? (
            <div className="col-span-2 w-full shrink-0 md:w-auto">
              <div className="flex h-11 w-full items-center gap-1 rounded-xl bg-muted/50 p-1 md:h-9 md:w-fit md:rounded-lg">
                {Array.from({ length: viewToggleSlots }).map((_, i) => (
                  <Skeleton key={i} className="h-9 flex-1 rounded-md md:h-7 md:w-9 md:flex-none" />
                ))}
              </div>
            </div>
          ) : null}
          {tabCount > 0 ? (
            <div className={`${SKELETON_SCROLL_ROW_CLASS} col-span-2 md:w-auto md:flex-none md:pb-0`}>
              {Array.from({ length: tabCount }).map((_, i) => (
                <SkeletonPill key={i} className="h-9 w-[5.25rem] shrink-0 md:h-8 md:w-20" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
