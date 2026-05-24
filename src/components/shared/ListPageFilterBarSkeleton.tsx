import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";
import {
  FILTER_BAR_CONTROL_ROW_CLASS,
  FILTER_BAR_EXTRA_FILTER_CLASS,
  FILTER_BAR_INNER_CLASS,
  FILTER_BAR_SEARCH_CLASS,
  FILTER_BAR_SHELL_CLASS,
  FILTER_BAR_SKELETON_PROFILES,
  FILTER_BAR_STATUS_ROW_CLASS,
  FILTER_BAR_SURFACE_CLASS,
  FILTER_BAR_VIEW_TOGGLE_SLOT_CLASS,
  resolveSkeletonFilterBarLayoutKey,
  type FilterBarSkeletonVariant,
} from "@/components/shared/list-page-filter-bar-layout";
import { cn } from "@/lib/utils";

/** Mirrors the responsive `ListPageFilterBar` layout. */
export function ListPageFilterBarSkeleton({
  variant,
}: {
  variant: FilterBarSkeletonVariant;
}) {
  const layoutKey = resolveSkeletonFilterBarLayoutKey(variant);
  const profile = FILTER_BAR_SKELETON_PROFILES[variant];
  const isSearch = variant === "search";

  return (
    <div className={cn(FILTER_BAR_SHELL_CLASS, !isSearch && FILTER_BAR_SURFACE_CLASS)}>
      <div className={FILTER_BAR_INNER_CLASS}>
        <div className={FILTER_BAR_CONTROL_ROW_CLASS[layoutKey]}>
          <Skeleton
            className={cn(
              FILTER_BAR_SEARCH_CLASS[layoutKey],
              "h-[56px] w-full rounded-[1.1rem] lg:h-8 lg:rounded-lg",
            )}
          />
          {!isSearch ? <Skeleton className="h-12 w-full shrink-0 rounded-xl lg:h-8 lg:w-[7rem] lg:rounded-lg" /> : null}
          {profile.extraFilterSlots > 0 ? (
            <div
              className={cn(
                FILTER_BAR_EXTRA_FILTER_CLASS,
                profile.extraFilterSlots > 1 ? "col-span-2 grid-cols-2" : "col-span-1",
              )}
            >
              {Array.from({ length: profile.extraFilterSlots }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full shrink-0 rounded-xl lg:h-8 lg:w-[7rem] lg:rounded-lg" />
              ))}
            </div>
          ) : null}
          {profile.viewToggleSlots > 0 ? (
            <div className={FILTER_BAR_VIEW_TOGGLE_SLOT_CLASS}>
              <div className="flex h-12 w-full items-center gap-1 rounded-xl bg-muted/50 p-1 lg:h-8 lg:w-fit lg:rounded-lg lg:p-0.5">
                {Array.from({ length: profile.viewToggleSlots }).map((_, i) => (
                  <Skeleton key={i} className="h-10 flex-1 rounded-md lg:h-7 lg:w-[1.625rem] lg:flex-none" />
                ))}
              </div>
            </div>
          ) : null}
          {profile.tabCount > 0 ? (
            <div className={FILTER_BAR_STATUS_ROW_CLASS}>
              {Array.from({ length: profile.tabCount }).map((_, i) => (
                <SkeletonPill key={i} className="h-10 w-[5.25rem] shrink-0 lg:h-8 lg:w-[4.8rem] lg:min-w-0 lg:shrink" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
