import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

/** Mirrors the responsive `ListPageFilterBar` layout. */
export function ListPageFilterBarSkeleton({
  variant,
}: {
  variant: "es" | "companies" | "gakuchika";
}) {
  const tabCount = variant === "es" ? 3 : 4;
  const viewToggleSlots = variant === "gakuchika" ? 3 : 2;

  return (
    <div className="mb-8 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,251,0.94))] p-4 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <div className="pb-1">
        <div className="flex min-w-full flex-wrap items-center gap-2.5">
          <Skeleton className="h-10 w-full rounded-xl sm:w-[22rem] sm:shrink-0" />
          <Skeleton className="h-10 w-full rounded-md sm:w-[160px] sm:shrink-0" />
          {variant === "es" ? (
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0">
              <Skeleton className="h-9 w-[150px] rounded-md sm:w-[170px]" />
              <Skeleton className="h-9 w-[160px] rounded-md" />
            </div>
          ) : null}
          {variant === "companies" ? (
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0">
              <Skeleton className="h-10 w-[160px] rounded-md" />
            </div>
          ) : null}
          <div className="w-full sm:w-auto sm:shrink-0">
            <div className="flex w-fit items-center gap-1 rounded-lg bg-muted/50 p-1">
              {Array.from({ length: viewToggleSlots }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-9 shrink-0 rounded-md" />
              ))}
            </div>
          </div>
          {Array.from({ length: tabCount }).map((_, i) => (
            <SkeletonPill key={i} className="h-9 w-[5.25rem] shrink-0 sm:w-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
