"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ListPageEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
  };
}

export function ListPageEmptyState({
  icon,
  title,
  description,
  action,
}: ListPageEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        {description}
      </p>
      {action && (
        action.href ? (
          <Button asChild disabled={action.disabled}>
            <Link href={action.href}>
              {action.icon}
              <span className={action.icon ? "ml-2" : ""}>{action.label}</span>
            </Link>
          </Button>
        ) : (
          <Button onClick={action.onClick} disabled={action.disabled}>
            {action.icon}
            <span className={action.icon ? "ml-2" : ""}>{action.label}</span>
          </Button>
        )
      )}
    </div>
  );
}
