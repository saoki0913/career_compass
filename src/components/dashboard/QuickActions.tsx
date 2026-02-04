import Link from "next/link";
import { cn } from "@/lib/utils";

interface QuickAction {
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  color: "indigo" | "orange" | "emerald" | "rose" | "sky";
}

interface QuickActionsProps {
  actions: QuickAction[];
  className?: string;
  children?: React.ReactNode;
}

const colorClasses = {
  indigo: "from-indigo-600 to-indigo-700 shadow-indigo-500/25 hover:shadow-indigo-500/40",
  orange: "from-orange-500 to-orange-600 shadow-orange-500/25 hover:shadow-orange-500/40",
  emerald: "from-emerald-500 to-emerald-600 shadow-emerald-500/25 hover:shadow-emerald-500/40",
  rose: "from-rose-500 to-rose-600 shadow-rose-500/25 hover:shadow-rose-500/40",
  sky: "from-sky-500 to-sky-600 shadow-sky-500/25 hover:shadow-sky-500/40",
};

function QuickActionCard({
  action,
  className,
}: {
  action: QuickAction;
  className?: string;
}) {
  const content = (
    <>
      <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
        <div className="w-full h-full rounded-full bg-white/10 group-hover:scale-110 transition-transform duration-200" />
      </div>
      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-3 group-hover:bg-white/20 transition-colors duration-200">
          {action.icon}
        </div>
        <h3 className="font-semibold tracking-tight">{action.title}</h3>
        <p className="mt-1 text-sm opacity-85">{action.description}</p>
      </div>
    </>
  );

  const baseClasses = cn(
    "group relative overflow-hidden rounded-2xl p-5 text-white cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] bg-gradient-to-br shadow-md h-[136px] flex flex-col justify-start items-start text-left",
    colorClasses[action.color],
    className
  );

  if (action.onClick) {
    return (
      <button type="button" onClick={action.onClick} className={baseClasses}>
        {content}
      </button>
    );
  }

  return (
    <Link href={action.href || "#"} className={baseClasses}>
      {content}
    </Link>
  );
}

export function QuickActions({ actions, className, children }: QuickActionsProps) {
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {actions.map((action, index) => (
        <QuickActionCard key={index} action={action} />
      ))}
      {children}
    </div>
  );
}
