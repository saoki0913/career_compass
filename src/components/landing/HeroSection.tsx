"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Calendar,
  MessageSquare,
  LayoutDashboard,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Feature data for carousel
const features = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "ダッシュボード",
    image: "/screenshots/dashboard.png",
    color: "text-blue-500",
    bgColor: "bg-blue-500",
  },
  {
    id: "companies",
    icon: Building2,
    label: "企業管理",
    image: "/screenshots/companies.png",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500",
  },
  {
    id: "gakuchika",
    icon: MessageSquare,
    label: "ガクチカ深掘り",
    image: "/screenshots/gakuchika-chat.png",
    color: "text-orange-500",
    bgColor: "bg-orange-500",
  },
  {
    id: "es-review",
    icon: Sparkles,
    label: "AI添削",
    image: "/screenshots/es-review.png",
    color: "text-violet-500",
    bgColor: "bg-violet-500",
  },
];

// Feature Tab component
interface FeatureTabProps {
  feature: (typeof features)[0];
  isActive: boolean;
  onClick: () => void;
  isAutoPlaying: boolean;
}

function FeatureTab({
  feature,
  isActive,
  onClick,
  isAutoPlaying,
}: FeatureTabProps) {
  const Icon = feature.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2.5 rounded-full transition-all duration-300",
        "border shadow-sm hover:shadow-md",
        isActive
          ? "bg-card border-primary/30 shadow-lg"
          : "bg-card/50 border-border/50 hover:bg-card hover:border-border"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 transition-colors",
          isActive ? feature.color : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "text-sm font-medium transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {feature.label}
      </span>

      {/* Progress indicator */}
      {isActive && isAutoPlaying && (
        <motion.div
          className={cn(
            "absolute bottom-0 left-0 h-0.5 rounded-full",
            feature.bgColor
          )}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 4, ease: "linear" }}
        />
      )}
    </button>
  );
}

// Hero Content (Left Column)
function HeroContent() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  return (
    <div className="flex flex-col justify-center px-4 lg:px-8 xl:px-12 py-12 lg:py-0">
      {/* Logo + Brand */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-4 mb-8"
      >
        <div className="relative">
          {/* Glow effect behind logo */}
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-150" aria-hidden="true" />
          <Image
            src="/icon.png"
            alt="Career Compass"
            width={56}
            height={56}
            className="relative rounded-xl shadow-lg"
          />
        </div>
        <span className="text-3xl font-extrabold text-foreground tracking-tight">
          Career Compass
        </span>
      </motion.div>

      {/* Headline - Short and powerful */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
      >
        <span className="text-gradient">ESも締切も、</span>
        <br />
        <span className="text-foreground">AIが見逃さない。</span>
      </motion.h1>

      {/* One-line description */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-lg text-muted-foreground mb-8 max-w-md"
      >
        ES添削・締切管理・ガクチカ深掘り。
        <br className="hidden sm:block" />
        就活の面倒をAIがまとめてサポート。
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex flex-col sm:flex-row gap-3 mb-8"
      >
        {isLoading ? (
          <Button size="lg" disabled className="min-w-[180px]">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
            読み込み中...
          </Button>
        ) : isAuthenticated ? (
          <Button
            size="lg"
            asChild
            className="min-w-[180px] h-12 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
          >
            <Link href="/dashboard">
              ダッシュボードへ
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              asChild
              className="min-w-[180px] h-12 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
            >
              <Link href="/login">
                今すぐ始める
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="min-w-[140px] h-12 text-base border-2 hover:bg-secondary/80 hover:-translate-y-0.5 transition-all"
            >
              <Link href="/dashboard">
                {isGuest ? "続ける" : "ゲストで試す"}
              </Link>
            </Button>
          </>
        )}
      </motion.div>

      {/* Trust indicators - simplified inline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"
      >
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span>無料で始められる</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span>30秒で登録</span>
        </div>
      </motion.div>
    </div>
  );
}

// Hero Products (Right Column) - Interactive carousel
function HeroProducts() {
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
    }, 4000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, activeIndex]);

  const handleTabClick = (index: number) => {
    setDirection(index > activeIndex ? 1 : -1);
    setActiveIndex(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  return (
    <div className="relative flex flex-col items-center justify-center py-8 lg:py-0">
      {/* Decorative gradient blob */}
      <motion.div
        key={activeFeature.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full blur-3xl transition-colors duration-500",
          activeFeature.bgColor + "/10"
        )}
        aria-hidden="true"
      />

      {/* Feature Tabs - above the screenshot */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex flex-wrap justify-center gap-2 mb-6"
      >
        {features.map((feature, index) => (
          <FeatureTab
            key={feature.id}
            feature={feature}
            isActive={index === activeIndex}
            onClick={() => handleTabClick(index)}
            isAutoPlaying={isAutoPlaying && index === activeIndex}
          />
        ))}
      </motion.div>

      {/* Browser Mockup with Screenshot */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-xl"
      >
        {/* Browser Frame */}
        <div className="rounded-2xl overflow-hidden border border-border/30 bg-card shadow-2xl shadow-black/10">
          {/* Browser Header */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-secondary/60 border-b border-border/30">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
            <div className="flex-1 mx-3">
              <div className="max-w-[160px] mx-auto px-3 py-1 rounded-md bg-background/60 text-[10px] text-muted-foreground text-center truncate">
                ukarun.app
              </div>
            </div>
          </div>

          {/* Screenshot with animation */}
          <div className="relative aspect-[16/10] bg-background overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeFeature.id}
                initial={{
                  opacity: 0,
                  x: direction > 0 ? 60 : -60,
                }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x: direction > 0 ? -60 : 60,
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                <Image
                  src={activeFeature.image}
                  alt={`${activeFeature.label}の画面`}
                  fill
                  className="object-cover object-top"
                  priority={activeIndex === 0}
                />
              </motion.div>
            </AnimatePresence>

            {/* Feature label overlay */}
            <motion.div
              key={`label-${activeFeature.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="absolute bottom-3 left-3"
            >
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium shadow-lg backdrop-blur-sm",
                  activeFeature.bgColor
                )}
              >
                <activeFeature.icon className="h-3.5 w-3.5" />
                {activeFeature.label}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Reflection effect */}
        <div
          className="absolute -bottom-6 left-4 right-4 h-12 bg-gradient-to-b from-foreground/5 to-transparent rounded-b-3xl blur-sm"
          aria-hidden="true"
        />
      </motion.div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] overflow-hidden">
      {/* Subtle background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-background to-accent/3" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Main grid layout */}
      <div className="container mx-auto px-4 h-full">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 min-h-[90vh] items-center">
          {/* Left: Text content */}
          <HeroContent />

          {/* Right: Interactive product carousel */}
          <HeroProducts />
        </div>
      </div>

      {/* Scroll indicator - subtle, at bottom center */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground"
      >
        <span className="text-xs font-medium">スクロールして詳細を見る</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-5 h-8 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-1 h-2 rounded-full bg-muted-foreground/50"
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
