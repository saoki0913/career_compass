"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import { ArrowRight, Clock, CreditCard, Shield } from "lucide-react";

const trustBadges = [
  { icon: CreditCard, text: "クレジットカード不要" },
  { icon: Clock, text: "30秒で登録完了" },
  { icon: Shield, text: "いつでも解約可能" },
] as const;

export function CTASection() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="overflow-hidden rounded-2xl border border-primary/15 bg-card px-6 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl text-center text-foreground lg:text-left">
              <p className="text-sm font-medium text-primary/80">
                クレジットカード不要・30秒で登録完了
              </p>

              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                今日から就活、
                <br className="hidden sm:block" />
                迷わなくなる
              </h2>

              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                ES、志望動機、ガクチカ、締切管理。
                <br className="hidden sm:block" />
                すべて無料で試せます。
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 lg:justify-start">
                {trustBadges.map((badge) => (
                  <div
                    key={badge.text}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <badge.icon className="h-3.5 w-3.5 text-primary" />
                    <span>{badge.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[220px] lg:items-stretch">
              {isLoading ? (
                <Button
                  size="lg"
                  disabled
                  className="h-14"
                >
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                  読み込み中...
                </Button>
              ) : isAuthenticated ? (
                <Button
                  size="lg"
                  asChild
                  className="h-14 px-10 text-lg"
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
                  className="h-14 px-10 text-lg landing-cta-btn animate-pulse-glow"
                >
                  <Link href="/login">
                    今すぐ無料で試す
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-14 px-10 text-base"
              >
                <a href="#pricing">料金を見る</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
