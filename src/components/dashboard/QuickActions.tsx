import Link from "next/link";
import { cn } from "@/lib/utils";

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const DocumentEditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const MicIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 8v3m-4 0h8" />
    <rect x={9} y={2} width={6} height={12} rx={3} stroke="currentColor" strokeWidth={2} fill="none" />
  </svg>
);

const BookIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

type ActionDef = {
  key: string;
  title: string;
  subtitle: string;
  href?: string;
  actionType?: "interview" | "motivation";
  gradient: string;
  Icon: () => React.JSX.Element;
};

const ACTIONS: ActionDef[] = [
  { key: "add-company", title: "企業を追加", subtitle: "新しい企業を登録", href: "/companies/new", gradient: "from-rose-500 to-pink-500", Icon: PlusIcon },
  { key: "es-review", title: "ES作成/添削", subtitle: "書いて整える", href: "/es", gradient: "from-blue-500 to-indigo-500", Icon: DocumentEditIcon },
  { key: "interview", title: "面接対策", subtitle: "企業別に模擬面接", actionType: "interview", gradient: "from-emerald-500 to-green-600", Icon: MicIcon },
  { key: "gakuchika", title: "ガクチカ作成", subtitle: "経験を言語化する", href: "/gakuchika", gradient: "from-orange-500 to-amber-500", Icon: BookIcon },
  { key: "motivation", title: "志望動機作成", subtitle: "AIで志望動機を作成", actionType: "motivation", gradient: "from-teal-500 to-cyan-500", Icon: SparklesIcon },
];

interface QuickActionsProps {
  onInterviewClick: () => void;
  onMotivationClick: () => void;
  className?: string;
}

export function QuickActions({ onInterviewClick, onMotivationClick, className }: QuickActionsProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {ACTIONS.map((action) => {
        const card = (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-3 min-h-[72px]",
              "bg-gradient-to-br text-white",
              "shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5",
              action.gradient,
            )}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/25 mb-1.5">
              <action.Icon />
            </div>
            <p className="font-semibold text-sm leading-tight">{action.title}</p>
            <p className="text-white/70 text-[11px] mt-0.5">{action.subtitle}</p>
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
