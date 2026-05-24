import type { ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductFloatingActionButtonBaseProps = {
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
  title?: string;
};

type ProductFloatingActionButtonProps =
  | (ProductFloatingActionButtonBaseProps & {
      href: string;
      onClick?: never;
    })
  | (ProductFloatingActionButtonBaseProps & {
      href?: never;
      onClick: () => void;
    });

export function ProductFloatingActionButton({
  label,
  href,
  onClick,
  disabled,
  icon = <Plus className="h-6 w-6" aria-hidden="true" />,
  className,
  title,
}: ProductFloatingActionButtonProps) {
  const classes = cn(
    "fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-5 z-40 h-14 w-14 rounded-full border border-slate-900/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] p-0 text-white shadow-[0_20px_48px_-18px_rgba(15,23,42,0.72)] hover:bg-[linear-gradient(180deg,rgba(2,6,23,1),rgba(15,23,42,0.98))] focus-visible:ring-slate-900/30 sm:hidden",
    "group-has-[[data-mobile-sidebar=open]]/product-shell:pointer-events-none group-has-[[data-mobile-sidebar=open]]/product-shell:opacity-0",
    className,
  );

  if (href && !disabled) {
    return (
      <Button asChild size="icon" className={classes} aria-label={label} title={title ?? label}>
        <Link href={href}>{icon}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      className={classes}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </Button>
  );
}
