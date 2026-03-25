import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

/** Mirrors `ListPageFilterBar` (mobile search + horizontal scroll row). */
export function ListPageFilterBarSkeleton({
  variant,
}: {
  variant: "es" | "companies" | "gakuchika";
}) {
  const tabCount = variant === "es" ? 3 : 4;
  const viewToggleSlots = variant === "gakuchika" ? 3 : 2;

  return (
    <div className="mb-8 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,251,0.94))] p-4 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <div className="mb-4 sm:hidden">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
      <div className="min-w-0">
        <div className="overflow-x-auto pb-1 sm:pb-0 [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max max-w-none items-center gap-3 sm:gap-3">
            <Skeleton className="hidden h-9 shrink-0 rounded-xl sm:block sm:w-56 md:w-64" />
            {Array.from({ length: tabCount }).map((_, i) => (
              <SkeletonPill key={i} className="h-9 w-[5.25rem] shrink-0 sm:w-24" />
            ))}
            <Skeleton className="h-9 w-[180px] shrink-0 rounded-md" />
            {variant === "es" ? (
              <Skeleton className="h-9 w-[150px] shrink-0 rounded-md sm:w-[170px]" />
            ) : null}
            {variant === "companies" || variant === "es" ? (
              <Skeleton className="h-9 w-[160px] shrink-0 rounded-md" />
            ) : null}
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/50 p-1">
              {Array.from({ length: viewToggleSlots }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-9 shrink-0 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
