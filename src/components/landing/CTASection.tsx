"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const trustPoints = [
  "クレジットカード不要",
  "30秒で登録",
  "いつでも解約OK",
] as const;

export function CTASection() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section className="py-40">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-[3.25rem]">
          就活を、ひとつに。
        </h2>

        <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl">
          今すぐ無料で始めましょう。
        </p>

        <div className="mt-10">
          {isLoading ? (
            <Button size="lg" disabled className="h-14 px-10 text-lg">
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              読み込み中...
            </Button>
          ) : isAuthenticated ? (
            <Button
              size="lg"
              asChild
              className="h-14 px-10 text-lg landing-cta-btn"
            >
              <Link href="/dashboard">
                ダッシュボードへ
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              asChild
              className="h-14 px-10 text-lg landing-cta-btn"
            >
              <Link href="/login">
                無料で始める
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {trustPoints.map((point) => (
            <span
              key={point}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span
                className="h-1 w-1 rounded-full bg-muted-foreground/40"
                aria-hidden="true"
              />
              {point}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
