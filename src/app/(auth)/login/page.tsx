"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function LoginPage() {
  const { isAuthenticated, isLoading, userPlan } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Already logged in, redirect based on plan status
      if (userPlan?.needsPlanSelection) {
        router.push("/plan-selection");
      } else {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, userPlan, router]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">ウカルンへようこそ</CardTitle>
        <CardDescription>
          AIと一緒に就活を成功させよう
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <GoogleSignInButton className="w-full" />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">または</span>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            ゲストとして続ける
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            ゲスト利用では一部機能が制限されます
          </p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          ログインすることで、
          <Link href="/terms" className="underline hover:text-foreground">
            利用規約
          </Link>
          と
          <Link href="/privacy" className="underline hover:text-foreground">
            プライバシーポリシー
          </Link>
          に同意したものとみなされます。
        </p>
      </CardContent>
    </Card>
  );
}
