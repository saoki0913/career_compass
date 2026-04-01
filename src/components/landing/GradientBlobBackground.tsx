import { cn } from "@/lib/utils";

type Blob = {
  /** CSS position classes, e.g. "top-0 left-[10%]" */
  position: string;
  /** Size classes, e.g. "w-[500px] h-[500px]" */
  size: string;
  /** "blue" | "blue-light" */
  variant?: "blue" | "blue-light";
  /** Extra opacity class, e.g. "opacity-60" */
  opacity?: string;
};

type GradientBlobBackgroundProps = {
  blobs: Blob[];
  className?: string;
};

export function GradientBlobBackground({
  blobs,
  className,
}: GradientBlobBackgroundProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          className={cn(
            "absolute rounded-full",
            blob.variant === "blue-light" ? "blob-blue-light" : "blob-blue",
            blob.position,
            blob.size,
            blob.opacity ?? "opacity-100",
          )}
        />
      ))}
    </div>
  );
}
