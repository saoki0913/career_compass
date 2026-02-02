"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import { ArrowRight, Shield, Clock, CreditCard } from "lucide-react";

const trustBadges = [
  { icon: CreditCard, text: "クレジットカード不要" },
  { icon: Clock, text: "30秒で登録完了" },
  { icon: Shield, text: "いつでも解約可能" },
];

export function CTASection() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section className="relative py-24 overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-primary/85" />

      {/* Decorative elements */}
      <div
        className="absolute top-0 left-0 w-96 h-96 rounded-full bg-white/5 blur-3xl -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-accent/20 blur-3xl translate-x-1/3 translate-y-1/3"
        aria-hidden="true"
      />

      <div className="relative container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center text-primary-foreground">
          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 opacity-0 animate-fade-up">
            就活の第一歩を、
            <br className="sm:hidden" />
            今日から。
          </h2>

          {/* Subtext */}
          <p className="text-lg sm:text-xl text-primary-foreground/80 mb-10 opacity-0 animate-fade-up delay-200">
            無料プランで今すぐ始められます。
            <br className="hidden sm:block" />
            あなたの就活を、ウカルンがサポートします。
          </p>

          {/* CTA Button */}
          <div className="opacity-0 animate-fade-up delay-300">
            {isLoading ? (
              <Button
                size="lg"
                disabled
                className="h-14 px-10 text-lg bg-white text-primary hover:bg-white/90"
              >
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                読み込み中...
              </Button>
            ) : isAuthenticated ? (
              <Button
                size="lg"
                asChild
                className="h-14 px-10 text-lg bg-white text-primary hover:bg-white/90 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
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
                className="h-14 px-10 text-lg bg-white text-primary hover:bg-white/90 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
              >
                <Link href="/login">
                  今すぐ無料で始める
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            )}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 mt-10 opacity-0 animate-fade-up delay-500">
            {trustBadges.map((badge) => (
              <div
                key={badge.text}
                className="flex items-center gap-2 text-sm text-primary-foreground/70"
              >
                <badge.icon className="h-4 w-4" />
                <span>{badge.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
