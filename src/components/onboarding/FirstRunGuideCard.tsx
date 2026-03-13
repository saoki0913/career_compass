"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "career_compass_first_run_guide_dismissed";

export function FirstRunGuideCard({
  isVisible,
}: {
  isVisible: boolean;
}) {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true"
  );

  if (!isVisible || dismissed) {
    return null;
  }

  return (
    <Card className="mb-6 border-primary/25 bg-gradient-to-br from-primary/10 via-background to-emerald-50/80 shadow-sm">
      <CardHeader className="gap-3 pb-3">
        <div className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          最初の3分でできること
        </div>
        <CardTitle className="text-xl leading-tight">
          まずは1社登録して、締切を自動で集めましょう
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          就活Passは、企業ごとの締切・ES・選考状況をまとめて管理するアプリです。最初に1社登録すると、
          締切管理と次にやることの提案が始まります。
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-background/80 p-4">
            <p className="text-xs font-semibold text-primary">1</p>
            <p className="mt-1 font-medium">企業を1社追加</p>
            <p className="mt-1 text-sm text-muted-foreground">志望企業を登録して管理を始めます。</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 p-4">
            <p className="text-xs font-semibold text-primary">2</p>
            <p className="mt-1 font-medium">締切を確認</p>
            <p className="mt-1 text-sm text-muted-foreground">ESや面接の締切を一覧で把握できます。</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 p-4">
            <p className="text-xs font-semibold text-primary">3</p>
            <p className="mt-1 font-medium">ES作成やAI添削へ進む</p>
            <p className="mt-1 text-sm text-muted-foreground">必要な作業をそのまま次の行動につなげます。</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild className="sm:min-w-52">
            <Link href="/companies/new">最初の企業を登録する</Link>
          </Button>
          <Button variant="ghost" onClick={() => {
            window.localStorage.setItem(STORAGE_KEY, "true");
            setDismissed(true);
          }}>
            あとで見る
          </Button>
          <Button variant="link" asChild className="justify-start px-0 sm:ml-auto">
            <Link href="/onboarding">プロフィールを整える</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
