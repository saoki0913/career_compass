"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
  className?: string;
}

const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

/**
 * ChatInput - IME-aware chat input component
 *
 * UX Psychology: Expectation Bias
 * Japanese users expect Enter to NOT send during IME composition.
 * This component properly handles compositionstart/compositionend events.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  placeholder = "回答を入力...",
  disabled = false,
  isSending = false,
  className,
}: ChatInputProps) {
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea while maintaining stable layout
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";

    // Calculate new height with min/max constraints
    const minHeight = 48; // ~2 lines
    const maxHeight = 120; // ~5 lines
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't send if:
    // 1. Shift is pressed (for newline)
    // 2. Component state says we're composing (for older browsers)
    // 3. Native event says we're composing (for modern browsers)
    // 4. Currently sending or disabled
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !isComposing &&
      !e.nativeEvent.isComposing &&
      !isSending &&
      !disabled
    ) {
      e.preventDefault();
      if (value.trim()) {
        onSend();
      }
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    // Small delay to ensure composition is fully complete
    // This prevents the final Enter key from triggering send
    setTimeout(() => {
      setIsComposing(false);
    }, 10);
  };

  return (
    <div className={cn("border-t border-border bg-background", className)}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Fixed height container to prevent layout shift */}
        <div className="flex items-start gap-3 min-h-[60px]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={placeholder}
            disabled={disabled || isSending}
            className={cn(
              "flex-1 px-4 py-3 rounded-xl border border-input bg-background text-sm",
              "resize-none focus:outline-none focus:ring-2 focus:ring-ring",
              "min-h-[48px] max-h-[120px] transition-colors",
              (disabled || isSending) && "opacity-50 cursor-not-allowed"
            )}
            style={{ height: "48px" }}
          />
          <Button
            onClick={onSend}
            disabled={!value.trim() || isSending || disabled}
            size="icon"
            className="w-12 h-12 rounded-xl shrink-0"
          >
            {isSending ? <LoadingSpinner /> : <SendIcon />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Shift + Enter で改行、Enter で送信
        </p>
      </div>
    </div>
  );
}

export default ChatInput;
