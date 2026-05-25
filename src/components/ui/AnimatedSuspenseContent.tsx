"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type AnimatedSuspenseContentProps = {
  children: ReactNode;
  className?: string;
};

export function AnimatedSuspenseContent({
  children,
  className,
}: AnimatedSuspenseContentProps) {
  const [entered, setEntered] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!entered) return;
    const timer = setTimeout(() => setSettled(true), 250);
    return () => clearTimeout(timer);
  }, [entered]);

  return (
    <div
      className={cn(
        !settled && "transition-all duration-200 ease-out motion-reduce:transition-none",
        !settled && (entered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"),
        className,
      )}
    >
      {children}
    </div>
  );
}

