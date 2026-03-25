import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = ComponentPropsWithoutRef<"div"> & {
  /** Stagger shimmer wave across siblings (YouTube-style sequential glint). */
  shimmerDelayMs?: number;
  /** Optional delay for the subtle base pulse on `::before`. */
  shimmerPulseDelayMs?: number;
  /** `inverse`: brighter sweep on primary / gradient placeholders. */
  variant?: "default" | "inverse";
};

function Skeleton({
  className,
  shimmerDelayMs,
  shimmerPulseDelayMs,
  variant = "default",
  style,
  ...props
}: SkeletonProps) {
  const mergedStyle: CSSProperties = {
    ...style,
    ...(shimmerDelayMs != null
      ? ({ "--skeleton-delay": `${shimmerDelayMs}ms` } as CSSProperties)
      : {}),
    ...(shimmerPulseDelayMs != null
      ? ({ "--skeleton-pulse-delay": `${shimmerPulseDelayMs}ms` } as CSSProperties)
      : {}),
  };

  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton-shimmer rounded-md border border-white/55 bg-[linear-gradient(180deg,rgba(247,250,252,0.98),rgba(236,242,247,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(36,42,48,0.96),rgba(29,35,40,0.94))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        variant === "inverse" && "skeleton-shimmer-inverse",
        className
      )}
      style={mergedStyle}
      {...props}
    />
  );
}

function SkeletonCircle(props: SkeletonProps) {
  const { className, ...rest } = props;
  return <Skeleton className={cn("rounded-full", className)} {...rest} />;
}

function SkeletonPill(props: SkeletonProps) {
  const { className, ...rest } = props;
  return <Skeleton className={cn("rounded-full", className)} {...rest} />;
}

function SkeletonButton(props: SkeletonProps) {
  const { className, ...rest } = props;
  return <Skeleton className={cn("rounded-xl", className)} {...rest} />;
}

function SkeletonText({
  className,
  lineClassName,
  lines = 3,
  widths = ["100%", "88%", "64%"],
  staggerShimmerMs = 0,
  lineVariant = "default",
}: {
  className?: string;
  lineClassName?: string;
  lines?: number;
  widths?: Array<number | string>;
  /** Per-line delay increment for shimmer (ms). */
  staggerShimmerMs?: number;
  lineVariant?: SkeletonProps["variant"];
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => {
        const width = widths[index] ?? widths[widths.length - 1] ?? "100%";
        const lineStyle: CSSProperties = {
          width: typeof width === "number" ? `${width}px` : width,
        };

        return (
          <Skeleton
            key={index}
            variant={lineVariant}
            className={cn("h-3 rounded-full", lineClassName)}
            style={lineStyle}
            shimmerDelayMs={staggerShimmerMs > 0 ? index * staggerShimmerMs : undefined}
          />
        );
      })}
    </div>
  );
}

export { Skeleton, SkeletonButton, SkeletonCircle, SkeletonPill, SkeletonText };
