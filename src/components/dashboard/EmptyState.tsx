import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-2xl" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-secondary to-muted flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      </div>
      <h3 className="mt-6 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && (
        <Button asChild className="mt-6" size="lg">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
