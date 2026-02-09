"use client";

import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type FeatureStatus = "yes" | "no" | "partial";

interface ComparisonFeature {
  name: string;
  ukarun: FeatureStatus;
  freeTools: FeatureStatus;
  jukatsujuku: FeatureStatus;
}

const features: ComparisonFeature[] = [
  {
    name: "ES添削（AI）",
    ukarun: "yes",
    freeTools: "partial",
    jukatsujuku: "yes",
  },
  {
    name: "添削スタイル 8種",
    ukarun: "yes",
    freeTools: "no",
    jukatsujuku: "no",
  },
  {
    name: "締切自動管理",
    ukarun: "yes",
    freeTools: "no",
    jukatsujuku: "partial",
  },
  {
    name: "企業研究（RAG）",
    ukarun: "yes",
    freeTools: "no",
    jukatsujuku: "no",
  },
  {
    name: "ガクチカ深掘りAI",
    ukarun: "yes",
    freeTools: "no",
    jukatsujuku: "yes",
  },
  {
    name: "Googleカレンダー連携",
    ukarun: "yes",
    freeTools: "no",
    jukatsujuku: "no",
  },
  {
    name: "月額料金",
    ukarun: "yes",
    freeTools: "yes",
    jukatsujuku: "no",
  },
];

const priceLabels = {
  ukarun: "¥0〜980",
  freeTools: "¥0",
  jukatsujuku: "¥30,000〜100,000",
};

function StatusIcon({ status }: { status: FeatureStatus }) {
  if (status === "yes") {
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-success/10">
        <Check className="h-4 w-4 text-success" />
      </div>
    );
  }
  if (status === "partial") {
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-warning/10">
        <Minus className="h-4 w-4 text-warning" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted">
      <X className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export function ComparisonSection() {
  return (
    <section className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            なぜ
            <span className="text-gradient">ウカルン</span>
            なのか？
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            無料ツールの手軽さ × 就活塾の本格さ。
            <br className="hidden sm:block" />
            ウカルンなら、その両方が手に入ります。
          </p>
        </div>

        {/* Comparison table */}
        <div className="max-w-4xl mx-auto overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground w-1/4">
                  機能
                </th>
                <th className="py-4 px-4 text-center">
                  <div className="inline-flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-primary">
                      ウカルン
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {priceLabels.ukarun}
                    </span>
                  </div>
                </th>
                <th className="py-4 px-4 text-center">
                  <div className="inline-flex flex-col items-center gap-1">
                    <span className="text-sm font-medium text-foreground">
                      無料ES添削ツール
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {priceLabels.freeTools}
                    </span>
                  </div>
                </th>
                <th className="py-4 px-4 text-center">
                  <div className="inline-flex flex-col items-center gap-1">
                    <span className="text-sm font-medium text-foreground">
                      就活塾
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {priceLabels.jukatsujuku}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <tr
                  key={feature.name}
                  className={cn(
                    "border-b border-border/30",
                    index % 2 === 0 ? "bg-card/50" : ""
                  )}
                >
                  <td className="py-4 px-4 text-sm font-medium">
                    {feature.name}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      <StatusIcon status={feature.ukarun} />
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      <StatusIcon status={feature.freeTools} />
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      <StatusIcon status={feature.jukatsujuku} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom tagline */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          ウカルンは
          <span className="font-medium text-foreground">
            添削 + 締切管理 + 企業研究
          </span>
          を月額¥980で統合。就活塾の
          <span className="font-medium text-foreground">1/30以下</span>
          の価格です。
        </p>
      </div>
    </section>
  );
}
