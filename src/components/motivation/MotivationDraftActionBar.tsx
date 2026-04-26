"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export function MotivationDraftActionBar({
  charLimit,
  onCharLimitChange,
  onGenerate,
  isGenerating,
  disabled,
  helperText,
  compact = false,
  layout = "stack",
  showTitle = true,
}: {
  charLimit: 300 | 400 | 500;
  onCharLimitChange: (limit: 300 | 400 | 500) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled: boolean;
  helperText: string;
  compact?: boolean;
  layout?: "stack" | "inline";
  showTitle?: boolean;
}) {
  const isInline = layout === "inline";
  const controls = (
    <>
      <p className="text-xs font-medium text-muted-foreground xl:shrink-0">文字数</p>
      <div className="grid grid-cols-3 gap-2">
        {([300, 400, 500] as const).map((limit) => (
          <button
            key={limit}
            type="button"
            onClick={() => onCharLimitChange(limit)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
              charLimit === limit
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-secondary",
            )}
          >
            {limit}字
          </button>
        ))}
      </div>
    </>
  );

  if (isInline) {
    return (
      <ConversationActionBar
        helperText={helperText}
        actionLabel="志望動機ESを作成"
        pendingLabel="作成中..."
        onAction={onGenerate}
        disabled={disabled}
        isPending={isGenerating}
        controls={controls}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "gap-2",
          compact ? "flex flex-col" : "flex items-start justify-between",
        )}
      >
        <div className="min-w-0">
          {showTitle ? <p className="text-sm font-semibold text-foreground">志望動機ESを作成</p> : null}
          <p className={cn("text-xs leading-5 text-muted-foreground", !showTitle && "text-sm leading-5")}>
            {helperText}
          </p>
        </div>

        <>
          <div className="flex flex-col gap-2 md:flex-row md:items-center xl:justify-self-end">{controls}</div>
          <Button
            onClick={onGenerate}
            disabled={disabled || isGenerating}
            className={cn("rounded-2xl shadow-sm", compact ? "h-11 w-full" : "h-11 min-w-[180px]")}
          >
            {isGenerating ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">作成中...</span>
              </>
            ) : (
              "志望動機ESを作成"
            )}
          </Button>
        </>
      </div>
    </div>
  );
}
