import Link from "next/link";
import { cn } from "@/lib/utils";

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: "indigo" | "orange" | "emerald" | "rose";
}

interface QuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

const colorClasses = {
  indigo: "from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700",
  orange: "from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
  emerald: "from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700",
  rose: "from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700",
};

export function QuickActions({ actions, className }: QuickActionsProps) {
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {actions.map((action, index) => (
        <Link
          key={index}
          href={action.href}
          className={cn(
            "group relative overflow-hidden rounded-2xl p-5 text-white transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-gradient-to-br",
            colorClasses[action.color]
          )}
        >
          <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
            <div className="w-full h-full rounded-full bg-white/10 group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              {action.icon}
            </div>
            <h3 className="font-semibold">{action.title}</h3>
            <p className="mt-1 text-sm text-white/80">{action.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
