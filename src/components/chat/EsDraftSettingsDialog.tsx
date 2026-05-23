"use client";

import { Check, Info, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type EsDraftCharLimit = 300 | 400 | 500;

type EsDraftSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  value: EsDraftCharLimit;
  onValueChange: (value: EsDraftCharLimit) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  materialItems: Array<{
    title: string;
    description?: string;
    ready?: boolean;
  }>;
};

const options: Array<{ value: EsDraftCharLimit; description: string }> = [
  { value: 300, description: "簡潔に要点をまとめる" },
  { value: 400, description: "バランスよく伝える" },
  { value: 500, description: "より詳しく伝える" },
];

export function EsDraftSettingsDialog({
  open,
  onOpenChange,
  title = "ES作成",
  description,
  value,
  onValueChange,
  onGenerate,
  isGenerating = false,
  materialItems,
}: EsDraftSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-3xl border-border/70 p-0 shadow-xl">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-xl">{title}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">文字数を選択してください</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {options.map((option) => {
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
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-foreground/85">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p>現在のチャットで話した内容がESに反映されます。生成後は内容を編集・調整できます。</p>
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 sm:min-w-44">
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="h-11 rounded-2xl bg-primary px-8 sm:min-w-56"
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            {isGenerating ? "生成中..." : "ESを生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
