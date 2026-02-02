"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  MessageSquare,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "ダッシュボード",
    subtitle: "全てを一目で把握",
    description:
      "登録企業数、ES作成状況、今週の締切を一画面で確認。迷わず次のアクションが分かります。",
    image: "/screenshots/dashboard.png",
    color: "from-blue-500 to-indigo-600",
    bgGlow: "bg-blue-500/20",
  },
  {
    id: "companies",
    icon: Building2,
    title: "企業管理",
    subtitle: "締切を絶対に見逃さない",
    description:
      "志望企業を一覧管理。ES提出や面接の締切は自動で抽出され、期限切れアラートで安心。",
    image: "/screenshots/companies.png",
    color: "from-emerald-500 to-teal-600",
    bgGlow: "bg-emerald-500/20",
  },
  {
    id: "gakuchika",
    icon: MessageSquare,
    title: "ガクチカ深掘り",
    subtitle: "AIが引き出す、あなたの強み",
    description:
      "対話形式でAIが質問。答えるだけで、面接で話せる具体的なエピソードが完成します。",
    image: "/screenshots/gakuchika-chat.png",
    color: "from-orange-500 to-red-500",
    bgGlow: "bg-orange-500/20",
  },
  {
    id: "es-review",
    icon: Sparkles,
    title: "AI添削",
    subtitle: "プロ級の品質に磨き上げ",
    description:
      "文字数、構成、具体性をAIが分析。改善ポイントを即座に提案し、通過率アップ。",
    image: "/screenshots/es-review.png",
    color: "from-violet-500 to-purple-600",
    bgGlow: "bg-violet-500/20",
  },
];

export function AppPreviewSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [direction, setDirection] = useState(1);

  const activeFeature = features[activeIndex];

  // Auto-play carousel
  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setDirection(1);
      setActiveIndex((prev) => (prev + 1) % features.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const goToSlide = (index: number) => {
    setDirection(index > activeIndex ? 1 : -1);
    setActiveIndex(index);
    setIsAutoPlaying(false);
  };

  const goToPrevious = () => {
    setDirection(-1);
    setActiveIndex((prev) => (prev - 1 + features.length) % features.length);
    setIsAutoPlaying(false);
  };

  const goToNext = () => {
    setDirection(1);
    setActiveIndex((prev) => (prev + 1) % features.length);
    setIsAutoPlaying(false);
  };

  return (
    <section className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
        {/* Dynamic glow based on active feature */}
        <motion.div
          key={activeFeature.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl",
            activeFeature.bgGlow
          )}
          aria-hidden="true"
        />
      </div>

      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Play className="h-3 w-3" />
              機能を詳しく見る
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              すべての機能を
              <span className="text-gradient">インタラクティブ</span>
              に体験
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              各機能をクリックして、詳細な画面と説明をご確認ください。
              <br className="hidden sm:block" />
              就活に必要なすべてが、ここに。
            </p>
          </motion.div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center max-w-7xl mx-auto">
          {/* Left: Feature Tabs */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            <div className="space-y-3">
              {features.map((feature, index) => {
                const isActive = index === activeIndex;
                const Icon = feature.icon;

                return (
                  <button
                    key={feature.id}
                    onClick={() => goToSlide(index)}
                    className={cn(
                      "w-full text-left p-4 lg:p-6 rounded-2xl transition-all duration-300",
                      "border-2 hover:shadow-lg",
                      isActive
                        ? "bg-card border-primary/30 shadow-lg shadow-primary/10"
                        : "bg-card/50 border-transparent hover:border-border/50 hover:bg-card"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div
                        className={cn(
                          "flex-shrink-0 p-3 rounded-xl transition-all duration-300",
                          isActive
                            ? `bg-gradient-to-br ${feature.color} text-white shadow-lg`
                            : "bg-secondary text-muted-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg">{feature.title}</h3>
                          {isActive && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className={cn(
                                "px-2 py-0.5 text-xs font-medium rounded-full text-white",
                                `bg-gradient-to-r ${feature.color}`
                              )}
                            >
                              表示中
                            </motion.span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-sm mb-2 transition-colors",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {feature.subtitle}
                        </p>
                        <AnimatePresence mode="wait">
                          {isActive && (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="text-sm text-muted-foreground leading-relaxed"
                            >
                              {feature.description}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Progress indicator for active */}
                      {isActive && isAutoPlaying && (
                        <div className="hidden lg:block flex-shrink-0 w-1 h-16 bg-secondary rounded-full overflow-hidden">
                          <motion.div
                            initial={{ height: "0%" }}
                            animate={{ height: "100%" }}
                            transition={{ duration: 5, ease: "linear" }}
                            className={cn(
                              "w-full rounded-full bg-gradient-to-b",
                              feature.color
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between mt-6 px-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrevious}
                  className="p-2 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                  aria-label="前へ"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={goToNext}
                  className="p-2 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                  aria-label="次へ"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <button
                onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  isAutoPlaying
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="h-4 w-4" />
                    自動再生中
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    自動再生
                  </>
                )}
              </button>

              {/* Dots */}
              <div className="flex items-center gap-2">
                {features.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      index === activeIndex
                        ? "w-6 bg-primary"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                    aria-label={`スライド ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right: Device Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="order-1 lg:order-2 relative"
          >
            {/* Browser Mockup */}
            <div className="relative mx-auto max-w-[640px]">
              {/* Glow effect */}
              <div
                className={cn(
                  "absolute -inset-4 rounded-3xl blur-2xl opacity-30 transition-colors duration-500",
                  `bg-gradient-to-br ${activeFeature.color}`
                )}
                aria-hidden="true"
              />

              {/* Browser Frame */}
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/50 bg-card">
                {/* Browser Header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border/50">
                  {/* Traffic lights */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>

                  {/* URL Bar */}
                  <div className="flex-1 mx-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 text-xs text-muted-foreground">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      <span>ukarun.app/{activeFeature.id}</span>
                    </div>
                  </div>
                </div>

                {/* Screenshot */}
                <div className="relative aspect-[16/10] bg-background overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeFeature.id}
                      initial={{
                        opacity: 0,
                        x: direction > 0 ? 100 : -100,
                        scale: 0.95,
                      }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{
                        opacity: 0,
                        x: direction > 0 ? -100 : 100,
                        scale: 0.95,
                      }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={activeFeature.image}
                        alt={`${activeFeature.title}の画面`}
                        fill
                        className="object-cover object-top"
                        priority
                      />
                    </motion.div>
                  </AnimatePresence>

                  {/* Feature label overlay */}
                  <motion.div
                    key={`label-${activeFeature.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="absolute bottom-4 left-4 right-4"
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg backdrop-blur-sm",
                        `bg-gradient-to-r ${activeFeature.color}`
                      )}
                    >
                      <activeFeature.icon className="h-4 w-4" />
                      {activeFeature.title}
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Reflection */}
              <div
                className="absolute -bottom-8 left-4 right-4 h-16 bg-gradient-to-b from-foreground/5 to-transparent rounded-b-3xl blur-sm"
                aria-hidden="true"
              />
            </div>
          </motion.div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-16"
        >
          <p className="text-muted-foreground mb-4">
            実際に触って体験してみませんか?
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
          >
            無料で試してみる
            <ChevronRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
