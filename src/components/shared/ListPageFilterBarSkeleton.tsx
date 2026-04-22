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
    <div className="mb-8 min-w-0 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,251,0.94))] p-4 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <div className="min-w-0 pb-1">
        <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80">
          <Skeleton className="h-10 min-w-[10rem] max-w-[22rem] flex-1 rounded-xl" />
          <Skeleton className="h-10 w-[160px] shrink-0 rounded-md" />
          {variant === "es" ? (
            <div className="flex shrink-0 items-center gap-2.5">
              <Skeleton className="h-9 w-[170px] shrink-0 rounded-md" />
              <Skeleton className="h-9 w-[160px] shrink-0 rounded-md" />
            </div>
          ) : null}
          {variant === "companies" ? (
            <div className="flex shrink-0 items-center gap-2.5">
              <Skeleton className="h-10 w-[160px] shrink-0 rounded-md" />
            </div>
          ) : null}
          <div className="shrink-0">
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
