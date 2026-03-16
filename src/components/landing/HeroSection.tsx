"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";

const screenshots = [
  { src: "/screenshots/dashboard.png", alt: "ダッシュボード" },
  { src: "/screenshots/es-review.png", alt: "AI添削" },
  { src: "/screenshots/gakuchika-chat.png", alt: "ガクチカ深掘り" },
  { src: "/screenshots/companies.png", alt: "企業管理" },
];

const trustPoints = [
  "クレジットカード不要",
  "30秒で登録",
  "いつでも解約OK",
] as const;

export function HeroSection() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % screenshots.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden bg-background">
      <div className="mx-auto max-w-5xl px-4">
        {/* Text content - centered */}
        <div className="pt-20 pb-16 text-center lg:pt-28">
          {/* Kicker */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-sm font-medium text-muted-foreground"
          >
            ES添削 / ガクチカ / 締切管理
          </motion.p>

          {/* H1 */}
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-6 text-6xl font-bold leading-[0.9] tracking-[-0.045em] text-foreground sm:text-7xl lg:text-[5.5rem]"
          >
            就活を、ひとつに。
          </motion.h1>

          {/* Sub copy */}
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            途中のESも、まとまらないガクチカも、忘れそうな締切も。
            <br className="hidden sm:block" />
            入れるだけで、次にやることが見えてくる。
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            {isLoading ? (
              <Button size="lg" disabled className="h-12 min-w-[190px]">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                読み込み中...
              </Button>
            ) : isAuthenticated ? (
              <Button
                size="lg"
                asChild
                className="h-12 min-w-[190px] landing-cta-btn"
              >
                <Link href="/dashboard">
                  ダッシュボードへ
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : isGuest ? (
              <Button
                size="lg"
                asChild
                className="h-12 min-w-[190px] landing-cta-btn"
              >
                <Link href="/dashboard">
                  続ける
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button
                size="lg"
                asChild
                className="h-12 min-w-[190px] landing-cta-btn"
              >
                <Link href="/login">
                  今すぐ無料で試す
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 min-w-[160px]"
            >
              <a href="#features">機能を見る</a>
            </Button>
          </motion.div>

          {/* Trust points */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.36 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          >
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
          </motion.div>
        </div>

        {/* Screenshot crossfade */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="relative mx-auto max-w-5xl pb-16"
        >
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-2xl/5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="absolute inset-0"
              >
                <Image
                  src={screenshots[activeIndex].src}
                  alt={screenshots[activeIndex].alt}
                  fill
                  className="object-cover object-top"
                  priority={activeIndex === 0}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
