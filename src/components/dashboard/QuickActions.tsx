import Link from "next/link";
import { BookOpen, FilePenLine, Heart, Mic, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ActionDef = {
  key: string;
  title: string;
  href?: string;
  actionType?: "interview" | "motivation";
  tone: string;
  Icon: LucideIcon;
};

const ACTIONS: ActionDef[] = [
  { key: "add-company", title: "企業を追加", href: "/companies/new", tone: "purple", Icon: Plus },
  { key: "es-review", title: "ES作成/添削", href: "/es", tone: "orange", Icon: FilePenLine },
  { key: "interview", title: "面接対策", actionType: "interview", tone: "green", Icon: Mic },
  { key: "gakuchika", title: "ガクチカ作成", href: "/gakuchika", tone: "pink", Icon: BookOpen },
  { key: "motivation", title: "志望動機作成", actionType: "motivation", tone: "blue", Icon: Heart },
];

const ACTION_TONES: Record<string, { inline: string; card: string; icon: string }> = {
  purple: {
    inline: "border-[#6d5dfc]/50 bg-[#f6f4ff] text-[#4033d6] hover:bg-[#eeeaff]",
    card: "bg-[#4d2fe9] text-white shadow-[0_14px_26px_rgba(77,47,233,0.24)]",
    icon: "bg-white/18",
  },
  orange: {
    inline: "border-[#ff8a1f]/55 bg-[#fff5eb] text-[#e15d00] hover:bg-[#ffe8d2]",
    card: "bg-[#ff6607] text-white shadow-[0_14px_26px_rgba(255,102,7,0.24)]",
    icon: "bg-white/18",
  },
  green: {
    inline: "border-[#19bf77]/55 bg-[#edfff7] text-[#04975f] hover:bg-[#dcfcea]",
    card: "bg-[#08a86f] text-white shadow-[0_14px_26px_rgba(8,168,111,0.22)]",
    icon: "bg-white/18",
  },
  pink: {
    inline: "border-[#ff3a74]/55 bg-[#fff0f5] text-[#e41452] hover:bg-[#ffe0eb]",
    card: "bg-[#f7084f] text-white shadow-[0_14px_26px_rgba(247,8,79,0.22)]",
    icon: "bg-white/18",
  },
  blue: {
    inline: "border-[#20a7e8]/55 bg-[#eef9ff] text-[#087fc2] hover:bg-[#dcf2ff]",
    card: "bg-[#119bd8] text-white shadow-[0_14px_26px_rgba(17,155,216,0.22)]",
    icon: "bg-white/18",
  },
};

interface QuickActionsProps {
  onInterviewClick: () => void;
  onMotivationClick: () => void;
  className?: string;
  inline?: boolean;
}

export function QuickActions({ onInterviewClick, onMotivationClick, className, inline }: QuickActionsProps) {
  return (
    <div className={cn(
      inline ? "flex items-center gap-1.5" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5",
      className,
    )}>
      {ACTIONS.map((action) => {
        const tone = ACTION_TONES[action.tone];
        const Icon = action.Icon;
        const card = (
          <div
            className={cn(
              "group relative isolate flex items-center overflow-hidden transition-all hover:-translate-y-0.5",
              inline
                ? "h-8 gap-1.5 rounded-lg border px-2.5 text-xs font-semibold shadow-sm"
                : "min-h-24 gap-3 rounded-2xl px-5 py-4",
              inline ? tone.inline : tone.card,
            )}
          >
            {!inline && (
              <span className="absolute -right-8 -top-12 h-28 w-28 rounded-full bg-white/10" aria-hidden="true" />
            )}
            <div className={cn(
              "flex shrink-0 items-center justify-center rounded-md",
              inline ? "h-5 w-5" : "h-10 w-10",
              inline ? "bg-white/70" : tone.icon,
            )}>
              <Icon className={cn(inline ? "h-3.5 w-3.5" : "h-5 w-5")} aria-hidden="true" strokeWidth={2.2} />
            </div>
            <p className={cn(
              "font-semibold leading-tight whitespace-nowrap",
              inline ? "text-[11px]" : "text-lg",
            )}>{action.title}</p>
          </div>
        );

        if (action.actionType) {
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.actionType === "interview" ? onInterviewClick : onMotivationClick}
              className="cursor-pointer text-left"
            >
              {card}
            </button>
          );
        }

        return (
          <Link key={action.key} href={action.href!}>
            {card}
          </Link>
        );
      })}
    </div>
  );
}
