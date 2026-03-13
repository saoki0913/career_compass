"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  Clock,
  FileText,
  MessageSquare,
  Shield,
} from "lucide-react";

const featurePreviews = [
  {
    icon: FileText,
    label: "ES添削",
    description: "改善点をスコア化",
    accentClass: "bg-primary/10 text-primary",
  },
  {
    icon: MessageSquare,
    label: "志望動機作成",
    description: "企業理解を文章に",
    accentClass: "bg-accent-coral/10 text-accent-coral",
  },
  {
    icon: Calendar,
    label: "締切管理",
    description: "複数社を一覧で",
    accentClass: "bg-accent-yellow/15 text-accent-yellow",
  },
] as const;

const heroSignals = [
  {
    icon: FileText,
    title: "ES添削・志望動機・ガクチカ・締切を1アプリに統合",
  },
  {
    icon: Clock,
    title: "下書きの段階から使える。途中でもOK",
  },
  {
    icon: Shield,
    title: "無料で今日から。30秒で登録完了",
  },
] as const;

const trustPoints = [
  { text: "クレジットカード不要" },
  { text: "Googleで30秒登録" },
  { text: "いつでも解約可能" },
] as const;

function HeroContent() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  return (
    <div className="flex flex-col justify-center px-4 py-10 lg:px-2 lg:py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-6"
      >
        <span className="landing-kicker">
          就活準備の「全部」が、ここにある
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="max-w-3xl text-5xl font-bold leading-[0.95] tracking-[-0.04em] text-foreground sm:text-6xl lg:text-[4.5rem]"
      >
        ESも、志望動機も、
        <br />
        締切も。これ1つで。
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="mt-6 max-w-2xl text-[17px] leading-8 text-muted-foreground sm:text-lg"
      >
        周りに相談できる人がいなくても大丈夫。
        <br className="hidden sm:block" />
        AIが添削して、質問に答えるだけで下書きが整う。
        <br className="hidden sm:block" />
        無料で今日から始められます。
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24 }}
        className="mt-8"
      >
        <div className="landing-panel overflow-hidden rounded-xl p-4">
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-0">
            {heroSignals.map((signal, index) => (
              <div
                key={signal.title}
                className={`flex items-start gap-3 sm:px-4 ${
                  index !== 0 ? "sm:border-l sm:border-border/50" : ""
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40 text-primary">
                  <signal.icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium leading-6 text-foreground">
                  {signal.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.32 }}
        className="mt-8 flex flex-col gap-3 sm:flex-row"
      >
        {isLoading ? (
          <Button size="lg" disabled className="h-12 min-w-[190px]">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
            読み込み中...
          </Button>
        ) : isAuthenticated ? (
          <>
            <Button
              size="lg"
              asChild
              className="h-12 min-w-[190px] landing-cta-btn animate-pulse-glow"
            >
              <Link href="/dashboard">
                ダッシュボードへ
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 min-w-[160px]"
            >
              <a href="#features">機能を見る</a>
            </Button>
          </>
        ) : isGuest ? (
          <>
            <Button
              size="lg"
              asChild
              className="h-12 min-w-[190px] landing-cta-btn animate-pulse-glow"
            >
              <Link href="/dashboard">
                続ける
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 min-w-[160px]"
            >
              <Link href="/login">ログイン</Link>
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              asChild
              className="h-12 min-w-[190px] landing-cta-btn animate-pulse-glow"
            >
              <Link href="/login">
                今すぐ無料で試す
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 min-w-[160px]"
            >
              <a href="#features">30秒で使える</a>
            </Button>
          </>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2"
      >
        {trustPoints.map((point) => (
          <div
            key={point.text}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary/35"
              aria-hidden="true"
            />
            <span>{point.text}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative px-4 py-8 lg:px-0 lg:py-16">
      <div className="mx-auto max-w-[720px]">
        {/* Main Dashboard Screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.18 }}
          className="landing-panel overflow-hidden rounded-2xl p-0"
        >
          {/* Browser chrome */}
          <div className="border-b border-border/50 bg-muted/20 px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
              <div className="h-2.5 w-2.5 rounded-full bg-primary/30" />
              <div className="ml-3 rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
                shukatsu-pass.app
              </div>
            </div>
          </div>

          {/* Screenshot */}
          <div className="relative aspect-[16/10] overflow-hidden bg-background">
            <Image
              src="/screenshots/dashboard.png"
              alt="就活Passダッシュボード - 今日やることが一目で分かる"
              fill
              priority
              className="object-cover object-top"
            />
          </div>
        </motion.div>

        {/* Feature Preview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="mt-4 grid grid-cols-3 gap-3"
        >
          {featurePreviews.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
              className="landing-panel flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-center shadow-none transition-shadow duration-300 hover:shadow-md"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${feature.accentClass}`}
              >
                <feature.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-foreground">
                {feature.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {feature.description}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background pb-14 pt-6 lg:pb-20 lg:pt-8">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
          <HeroContent />
          <HeroVisual />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.95 }}
        className="mt-6 flex justify-center"
      >
        <a
          href="#features"
          className="inline-flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <span>詳しく見る</span>
          <span className="landing-rule h-8 w-px" aria-hidden="true" />
        </a>
      </motion.div>
    </section>
  );
}
