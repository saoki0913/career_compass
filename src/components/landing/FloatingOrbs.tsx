import { cn } from "@/lib/utils";

type FloatingOrbsProps = {
  className?: string;
};

export function FloatingOrbs({ className }: FloatingOrbsProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      {/* Large gradient sphere - top right */}
      <div className="animate-float-slow absolute -right-8 -top-8 size-28 opacity-70 sm:size-36 lg:size-44 orb-gradient" />

      {/* Small gradient sphere - bottom left */}
      <div className="animate-float-medium absolute -bottom-4 -left-6 size-16 opacity-60 sm:size-20 lg:size-24 orb-gradient-sm" />

      {/* Glass cube - center right */}
      <div className="animate-float-fast absolute right-[15%] top-[55%] size-12 rotate-12 opacity-50 sm:size-16 lg:size-20 orb-glass" />

      {/* Gradient ring - top left */}
      <div className="animate-float-medium absolute left-[12%] top-[18%] size-14 opacity-40 sm:size-18 lg:size-22 ring-gradient" />

      {/* Small accent sphere - bottom right */}
      <div className="animate-float-slow absolute bottom-[20%] right-[25%] size-8 opacity-50 sm:size-10 lg:size-12 orb-gradient-sm" />
    </div>
  );
}
