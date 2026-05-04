import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

const SKELETON_SCROLL_ROW_CLASS =
  "flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80";

/** Mirrors the responsive `ListPageFilterBar` layout. */
export function ListPageFilterBarSkeleton({
  variant,
}: {
  variant: "es" | "companies" | "gakuchika" | "tasks" | "deadlines";
}) {
  const tabCount =
    variant === "es"
      ? 3
      : variant === "tasks"
        ? 3
        : variant === "companies" || variant === "gakuchika"
          ? 4
          : 5;
  const viewToggleSlots =
    variant === "gakuchika"
      ? 3
      : variant === "deadlines" || variant === "tasks" || variant === "companies"
        ? 2
        : 0;
  const hasExtraFilter =
    variant === "es" ||
    variant === "companies" ||
    variant === "tasks" ||
    variant === "deadlines";

  return (
    <div className="mb-8 min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-xl">
      <div className="min-w-0 space-y-2">
        <div className={SKELETON_SCROLL_ROW_CLASS}>
          <Skeleton className="h-10 min-w-[14rem] max-w-[22rem] flex-[1_0_16rem] rounded-xl" />
          <Skeleton className="h-10 w-[160px] shrink-0 rounded-md" />
          {variant === "es" ? (
            <div className="flex shrink-0 items-center gap-2.5">
              <Skeleton className="h-9 w-[170px] shrink-0 rounded-md" />
              <Skeleton className="h-9 w-[160px] shrink-0 rounded-md" />
            </div>
          ) : null}
          {hasExtraFilter && variant !== "es" ? (
            <div className="flex shrink-0 items-center gap-2.5">
              <Skeleton className="h-10 w-[160px] shrink-0 rounded-md" />
            </div>
          ) : null}
          {viewToggleSlots > 0 ? (
            <div className="shrink-0">
              <div className="flex w-fit items-center gap-1 rounded-lg bg-muted/50 p-1">
                {Array.from({ length: viewToggleSlots }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-9 shrink-0 rounded-md" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className={SKELETON_SCROLL_ROW_CLASS}>
          {Array.from({ length: tabCount }).map((_, i) => (
            <SkeletonPill key={i} className="h-9 w-[5.25rem] shrink-0 sm:w-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
