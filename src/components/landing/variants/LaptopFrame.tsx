import { cn } from "@/lib/utils";

type LaptopFrameProps = {
  children: React.ReactNode;
  className?: string;
};

export function LaptopFrame({ children, className }: LaptopFrameProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Screen bezel */}
      <div className="rounded-t-2xl border border-slate-300/60 bg-slate-800 p-[6px] shadow-[0_40px_100px_-30px_rgba(15,23,42,0.3)]">
        {/* Webcam dot */}
        <div className="mb-1 flex justify-center">
          <div className="size-1.5 rounded-full bg-slate-600" />
        </div>

        {/* Screen content */}
        <div className="overflow-hidden rounded-lg bg-white">
          {children}
        </div>
      </div>

      {/* Keyboard base */}
      <div className="relative">
        <div className="mx-auto h-3 w-[105%] rounded-b-xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-[0_2px_8px_rgba(0,0,0,0.15)]" />
        {/* Bottom lip */}
        <div className="mx-auto -mt-px h-1 w-[80%] rounded-b-lg bg-slate-400/60" />
      </div>
    </div>
  );
}
