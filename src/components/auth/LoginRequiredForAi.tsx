"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LoginRequiredForAiProps = {
  title: string;
  description?: string;
  loginHref?: string;
};

/**
 * ゲスト等が AI 機能ページに入ったときに表示するログイン誘導。
 */
export function LoginRequiredForAi({
  title,
  description = "この機能はログイン後にご利用いただけます。アカウントをお持ちでない方も、無料で登録できます。",
  loginHref = "/login",
}: LoginRequiredForAiProps) {
  return (
    <Card className="mx-auto w-full max-w-lg border-border/80 shadow-sm max-lg:max-w-none">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center max-lg:flex-col max-lg:items-stretch">
        <Button asChild className="rounded-full">
          <Link href={loginHref}>ログイン / 新規登録</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/">トップへ戻る</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
