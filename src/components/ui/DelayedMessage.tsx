"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type DelayedMessageProps = {
  delayMs: number;
  message: string;
  className?: string;
};

export function DelayedMessage({
  delayMs,
  message,
  className,
}: DelayedMessageProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!visible) {
    return null;
  }

  return (
    <p className={cn("text-xs text-muted-foreground", className)} aria-live="polite">
      {message}
    </p>
  );
}
