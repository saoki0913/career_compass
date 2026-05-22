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

const ACTION_TONES: Record<string, { pill: string; icon: string }> = {
  purple: {
    pill: "border-[#6d5dfc]/65 bg-[#f6f4ff] text-[#4033d6] hover:bg-[#eeeaff] focus-visible:ring-[#6d5dfc]/35",
    icon: "bg-[#4033d6]/10",
  },
  orange: {
    pill: "border-[#ff8a1f]/65 bg-[#fff5eb] text-[#e15d00] hover:bg-[#ffe8d2] focus-visible:ring-[#ff8a1f]/35",
    icon: "bg-[#e15d00]/10",
  },
  green: {
    pill: "border-[#19bf77]/65 bg-[#edfff7] text-[#04975f] hover:bg-[#dcfcea] focus-visible:ring-[#19bf77]/35",
    icon: "bg-[#04975f]/10",
  },
  pink: {
    pill: "border-[#ff3a74]/65 bg-[#fff0f5] text-[#e41452] hover:bg-[#ffe0eb] focus-visible:ring-[#ff3a74]/35",
    icon: "bg-[#e41452]/10",
  },
  blue: {
    pill: "border-[#20a7e8]/65 bg-[#eef9ff] text-[#087fc2] hover:bg-[#dcf2ff] focus-visible:ring-[#20a7e8]/35",
    icon: "bg-[#087fc2]/10",
  },
};

interface QuickActionsProps {
  onInterviewClick: () => void;
  onMotivationClick: () => void;
  className?: string;
}

export function QuickActions({ onInterviewClick, onMotivationClick, className }: QuickActionsProps) {
  return (
    <div className={cn(
      "grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 lg:gap-2 lg:overflow-visible",
      className,
    )} data-testid="dashboard-quick-actions">
      {ACTIONS.map((action) => {
        const tone = ACTION_TONES[action.tone];
        const Icon = action.Icon;
        const content = (
          <>
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-7 sm:w-7 sm:rounded-md lg:h-6 lg:w-6", tone.icon)}>
              <Icon className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" strokeWidth={2.2} />
            </span>
            <span className="whitespace-nowrap text-sm font-semibold leading-tight sm:text-sm lg:text-xs">{action.title}</span>
          </>
        );
        const actionClassName = cn(
          "flex h-[68px] w-full items-center justify-center gap-2.5 rounded-xl border-[1.5px] px-3 text-center shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-14 sm:w-auto sm:min-w-[132px] sm:flex-1 sm:flex-row sm:gap-2 sm:rounded-lg sm:px-3.5 sm:text-left lg:h-9 lg:min-w-0 lg:flex-none lg:gap-1.5 lg:px-3",
          tone.pill,
        );
        const spanClass = action.key === "motivation" ? "col-span-2 sm:col-span-1" : "";

        if (action.actionType) {
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.actionType === "interview" ? onInterviewClick : onMotivationClick}
              className={cn(actionClassName, "cursor-pointer", spanClass)}
              data-testid={`dashboard-quick-action-${action.key}`}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={action.key}
            href={action.href!}
            className={cn(actionClassName, spanClass)}
            data-testid={`dashboard-quick-action-${action.key}`}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
