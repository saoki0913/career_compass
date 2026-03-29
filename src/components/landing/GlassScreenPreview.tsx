import Image from "next/image";
import { cn } from "@/lib/utils";

type GlassScreenPreviewProps = {
  src: string;
  alt: string;
  videoSrc?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  /** CSS perspective container value, e.g. "2000px" */
  perspective?: string;
  /** CSS rotateY in degrees */
  rotateY?: number;
  /** CSS rotateX in degrees */
  rotateX?: number;
};

export function GlassScreenPreview({
  src,
  alt,
  videoSrc,
  className,
  imageClassName,
  priority = false,
  perspective,
  rotateY = 0,
  rotateX = 0,
}: GlassScreenPreviewProps) {
  const unoptimized = src.endsWith(".svg");

  const hasTransform = rotateY !== 0 || rotateX !== 0;

  const inner = (
    <div
      className={cn("glass-card p-1.5 sm:p-2", className)}
      style={
        hasTransform
          ? {
              transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
              transformStyle: "preserve-3d",
            }
          : undefined
      }
    >
      {/* Light title bar with colored dots */}
      <div className="flex items-center gap-2 border-b border-slate-200/50 bg-white/60 px-4 py-2 rounded-t-[20px] backdrop-blur">
        <span className="size-2.5 rounded-full bg-[#FF5F56]" />
        <span className="size-2.5 rounded-full bg-[#FFBD2E]" />
        <span className="size-2.5 rounded-full bg-[#27C93F]" />
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-b-[20px] bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_100%)]">
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-slate-200/40" />
        {videoSrc ? (
          <video
            autoPlay
            loop
            muted
            playsInline
            poster={src}
            className={cn(
              "h-full w-full object-cover object-top",
              imageClassName,
            )}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            unoptimized={unoptimized}
            sizes="(min-width: 1024px) 960px, 100vw"
            className={cn("object-cover object-top", imageClassName)}
          />
        )}
      </div>
    </div>
  );

  if (perspective) {
    return (
      <div style={{ perspective, transformStyle: "preserve-3d" }}>{inner}</div>
    );
  }

  return inner;
}
