"use client";

import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FeatureStatus = "yes" | "no" | "partial";

interface ComparisonFeature {
  name: string;
  shupass: FeatureStatus;
  freeTools: FeatureStatus;
  jukatsujuku: FeatureStatus;
}

const features: ComparisonFeature[] = [
  {
    name: "ES添削",
    shupass: "yes",
    freeTools: "partial",
    jukatsujuku: "yes",
  },
  {
    name: "志望動機作成支援",
    shupass: "yes",
    freeTools: "partial",
    jukatsujuku: "yes",
  },
  {
    name: "ガクチカ深掘り",
    shupass: "yes",
    freeTools: "no",
    jukatsujuku: "partial",
  },
  {
    name: "締切管理",
    shupass: "yes",
    freeTools: "no",
    jukatsujuku: "partial",
  },
  {
    name: "Googleカレンダー連携",
    shupass: "yes",
    freeTools: "no",
    jukatsujuku: "no",
  },
  {
    name: "複数社の進捗管理",
    shupass: "yes",
    freeTools: "no",
    jukatsujuku: "partial",
  },
  {
    name: "相談相手がいなくても進められる",
    shupass: "yes",
    freeTools: "no",
    jukatsujuku: "yes",
  },
  {
    name: "すぐ無料で始められる",
    shupass: "yes",
    freeTools: "yes",
    jukatsujuku: "no",
  },
];

const priceLabels = {
  shupass: "¥0〜980",
  freeTools: "¥0",
  jukatsujuku: "¥30,000〜100,000",
};

function StatusIcon({ status }: { status: FeatureStatus }) {
  if (status === "yes") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/12">
        <Check className="h-4 w-4 text-success" />
      </div>
    );
  }
  if (status === "partial") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-warning/12">
        <Minus className="h-4 w-4 text-warning" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
      <X className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export function ComparisonSection() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-6xl lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-12">
          <div className="text-center lg:text-left">
            <span className="landing-kicker mb-5">比較</span>
            <h2 className="landing-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              高額な就活塾は不要。
              <br />
              でも無料ツールだけじゃ足りない。
            </h2>
          </div>
          <p className="mt-5 text-center text-lg leading-8 text-muted-foreground lg:mt-0 lg:text-left">
            ES添削だけで終わらず、志望動機・ガクチカ・締切管理まで。
            <br className="hidden sm:block" />
            月980円からすべてが使えます。
          </p>
        </div>

        <div className="landing-panel mx-auto max-w-5xl overflow-x-auto rounded-2xl p-3 sm:p-4">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="w-[30%] px-4 py-5 text-left text-sm font-medium text-muted-foreground">
                  比較項目
                </th>
                <th className="px-4 py-5 text-center">
                  <div className="inline-flex flex-col items-center gap-1 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
                    <span className="text-sm font-semibold text-primary">就活Pass</span>
                    <span className="text-xs text-muted-foreground">{priceLabels.shupass}</span>
                  </div>
                </th>
                <th className="px-4 py-5 text-center">
                  <div className="inline-flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-background px-4 py-3">
                    <span className="text-sm font-medium text-foreground">無料ES添削ツール</span>
                    <span className="text-xs text-muted-foreground">{priceLabels.freeTools}</span>
                  </div>
                </th>
                <th className="px-4 py-5 text-center">
                  <div className="inline-flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-background px-4 py-3">
                    <span className="text-sm font-medium text-foreground">就活塾</span>
                    <span className="text-xs text-muted-foreground">{priceLabels.jukatsujuku}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <tr
                  key={feature.name}
                  className={cn(
                    "border-b border-border/40 last:border-0",
                    index % 2 === 0 ? "bg-muted/20" : ""
                  )}
                >
                  <td className="px-4 py-4 text-sm font-medium text-foreground">{feature.name}</td>
                  <td className="bg-primary/[0.03] px-4 py-4">
                    <div className="flex justify-center">
                      <StatusIcon status={feature.shupass} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-center">
                      <StatusIcon status={feature.freeTools} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-center">
                      <StatusIcon status={feature.jukatsujuku} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-7 text-muted-foreground">
          手軽さは欲しいが、ES添削だけでは足りない。就活塾ほど重くは始めたくない。
          その間を埋める選択肢が就活Passです。
        </p>
      </div>
    </section>
  );
}
