"use client";

import { Card, CardContent } from "@/components/ui/card";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Sparkles,
  Calendar,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Feature Pill component
interface FeaturePillProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color?: string;
  delay?: number;
}

function FeaturePill({
  icon: Icon,
  label,
  color = "text-primary",
  delay = 0,
}: FeaturePillProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50 shadow-sm"
    >
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </motion.div>
  );
}

export default function LoginPage() {
  const { isAuthenticated, isLoading, userPlan } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Already logged in, redirect based on status
      if (userPlan?.needsPlanSelection) {
        router.push("/plan-selection");
      } else if (userPlan?.needsOnboarding) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, userPlan, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center">
        {/* Logo + Brand (static during loading) */}
        <div className="flex items-center gap-4 mb-8">
          <div className="relative">
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
        </div>

        <Card className="w-full max-w-sm border-border/50 shadow-xl shadow-black/5">
          <CardContent className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Logo + Brand */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-4 mb-6"
      >
        <div className="relative">
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

      {/* Value Proposition */}
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-lg text-center mb-8 text-muted-foreground"
      >
        ESも締切も、AIが見逃さない。
      </motion.p>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="w-full max-w-sm"
      >
        <Card className="border-border/50 shadow-xl shadow-black/5">
          <CardContent className="pt-6 pb-6">
            {/* Primary CTA: Google Login */}
            <GoogleSignInButton className="w-full h-12 text-base" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex flex-wrap justify-center gap-2 mt-8"
      >
        <FeaturePill
          icon={Sparkles}
          label="AI添削"
          color="text-violet-500"
          delay={0.5}
        />
        <FeaturePill
          icon={Calendar}
          label="締切管理"
          color="text-blue-500"
          delay={0.6}
        />
        <FeaturePill
          icon={MessageSquare}
          label="ガクチカ深掘り"
          color="text-orange-500"
          delay={0.7}
        />
      </motion.div>

      {/* Guest Option */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8"
      >
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          ゲストとして試す
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <p className="mt-2 text-xs text-center text-muted-foreground/70">
          一部機能が制限されます
        </p>
      </motion.div>

      {/* Legal */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="mt-8 text-xs text-center text-muted-foreground/60 max-w-xs"
      >
        ログインすることで、
        <Link href="/terms" className="underline hover:text-foreground">
          利用規約
        </Link>
        と
        <Link href="/privacy" className="underline hover:text-foreground">
          プライバシーポリシー
        </Link>
        に同意したものとみなされます。
      </motion.p>
    </div>
  );
}
