"use client";

import { Check, Info } from "lucide-react";

import { cn } from "@/lib/utils";

export type EsDraftCharLimit = 300 | 400 | 500;

const OPTIONS: Array<{ value: EsDraftCharLimit; description: string }> = [
  { value: 300, description: "簡潔に要点をまとめる" },
  { value: 400, description: "バランスよく伝える" },
  { value: 500, description: "より詳しく伝える" },
];

/**
 * ES 作成モーダル (GenerationModal の settingsSlot) で使う文字数選択 + 使用材料の表示。
 * 旧 EsDraftSettingsDialog の本体を抽出したもの。
 */
export function EsCharLimitField({
  value,
  onValueChange,
  materialItems,
}: {
  value: EsDraftCharLimit;
  onValueChange: (value: EsDraftCharLimit) => void;
  materialItems: Array<{ title: string; description?: string; ready?: boolean }>;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">文字数を選択してください</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onValueChange(option.value)}
                className={cn(
                  "relative rounded-2xl border px-4 py-4 text-center transition",
                  selected
                    ? "border-primary bg-primary/5 text-primary shadow-sm"
                    : "border-border/80 bg-background text-foreground hover:border-primary/50",
                )}
              >
                {selected ? (
                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
                <span className="block text-lg font-semibold">{option.value}字</span>
                <span className="mt-2 block text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">使用する材料</h3>
        <div className="rounded-2xl border border-border/80 bg-muted/10">
          {materialItems.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className={cn(
                "flex items-start gap-3 px-4 py-3 text-sm",
                index > 0 && "border-t border-border/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  item.ready === false ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground",
                )}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{item.title}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-foreground/85">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>現在のチャットで話した内容が ES に反映されます。生成後は内容を編集・調整できます。</p>
      </div>
    </div>
  );
}
