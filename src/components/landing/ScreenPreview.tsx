import Image from "next/image";
import { cn } from "@/lib/utils";

type ScreenPreviewProps = {
  src: string;
  alt: string;
  label?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function ScreenPreview({
  src,
  alt,
  label,
  className,
  imageClassName,
  priority = false,
}: ScreenPreviewProps) {
  const unoptimized = src.endsWith(".svg");

  return (
    <div
      className={cn(
        "landing-screen relative overflow-hidden rounded-[30px] border border-white/65 bg-white/92 shadow-[0_42px_120px_-60px_rgba(15,23,42,0.42)] backdrop-blur",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-950 px-5 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-rose-400/90" />
          <span className="size-2 rounded-full bg-amber-300/90" />
          <span className="size-2 rounded-full bg-emerald-300/90" />
          {label ? <span className="ml-3 truncate">{label}</span> : null}
        </div>
      </div>
      <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_100%)]">
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-slate-200/70" />
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          unoptimized={unoptimized}
          sizes="(min-width: 1024px) 960px, 100vw"
          className={cn("object-cover object-top", imageClassName)}
        />
      </div>
    </div>
  );
}
