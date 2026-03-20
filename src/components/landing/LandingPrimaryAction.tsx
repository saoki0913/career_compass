"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

type LandingPrimaryActionProps = {
  size?: "sm" | "lg";
  className?: string;
  guestHref?: string;
  guestLabel?: string;
  authenticatedHref?: string;
  authenticatedLabel?: string;
  unauthenticatedHref?: string;
  unauthenticatedLabel?: string;
};

export function LandingPrimaryAction({
  size = "lg",
  className,
  guestHref = "/dashboard",
  guestLabel = "続ける",
  authenticatedHref = "/dashboard",
  authenticatedLabel = "ダッシュボードへ",
  unauthenticatedHref = "/login",
  unauthenticatedLabel = "今すぐ無料で試す",
}: LandingPrimaryActionProps) {
  const { isAuthenticated, isGuest, isLoading } = useAuth();
  const sizeClasses = size === "sm" ? "h-9" : "h-12 min-w-[190px]";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (isLoading) {
    return (
      <Button size={size} disabled className={`${sizeClasses} ${className ?? ""}`.trim()}>
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
        読み込み中...
      </Button>
    );
  }

  if (isAuthenticated) {
    return (
      <Button size={size} asChild className={`${sizeClasses} ${className ?? ""}`.trim()}>
        <Link href={authenticatedHref}>
          {authenticatedLabel}
          <ArrowRight className={`ml-1.5 ${iconSize}`} />
        </Link>
      </Button>
    );
  }

  if (isGuest) {
    return (
      <Button size={size} asChild className={`${sizeClasses} ${className ?? ""}`.trim()}>
        <Link href={guestHref}>
          {guestLabel}
          <ArrowRight className={`ml-1.5 ${iconSize}`} />
        </Link>
      </Button>
    );
  }

  return (
    <Button size={size} asChild className={`${sizeClasses} ${className ?? ""}`.trim()}>
      <Link href={unauthenticatedHref}>
        {unauthenticatedLabel}
        <ArrowRight className={`ml-1.5 ${iconSize}`} />
      </Link>
    </Button>
  );
}
