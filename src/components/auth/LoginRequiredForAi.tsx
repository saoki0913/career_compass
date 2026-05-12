"use client";

import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LoginRequiredForAiProps = {
  title: string;
  description: string;
  fallbackAction?: {
    label: string;
    href: string;
  };
  loginHref?: string;
};

export function LoginRequiredForAi({
  title,
  description,
  fallbackAction,
  loginHref = "/login",
}: LoginRequiredForAiProps) {
  return (
    <Card className="mx-auto w-full max-w-lg border-border/60 shadow-sm">
      <CardContent className="flex flex-col items-center px-6 py-8 text-center sm:px-8 sm:py-10">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" aria-hidden />
        </span>

        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            Google アカウントで 30 秒で登録
          </span>
          <span>カード不要</span>
        </div>

        <Button asChild size="lg" className="mt-6 w-full max-w-xs rounded-full">
          <Link href={loginHref}>無料で始める</Link>
        </Button>

        {fallbackAction ? (
          <Link
            href={fallbackAction.href}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {fallbackAction.label}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
