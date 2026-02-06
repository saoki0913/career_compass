"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { STARScores } from "./STARProgressBar";

interface STARScoreChangeProps {
  previousScores: STARScores | null;
  currentScores: STARScores;
  onDismiss?: () => void;
}

const ELEMENT_LABELS = {
  situation: "状況",
  task: "課題",
  action: "行動",
  result: "結果",
} as const;

export function STARScoreChange({
  previousScores,
  currentScores,
  onDismiss,
}: STARScoreChangeProps) {
  // Auto-dismiss after 3 seconds
  useEffect(() => {
    if (onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [onDismiss]);

  // Calculate deltas
  const deltas = previousScores
    ? {
        situation: currentScores.situation - previousScores.situation,
        task: currentScores.task - previousScores.task,
        action: currentScores.action - previousScores.action,
        result: currentScores.result - previousScores.result,
      }
    : {
        situation: currentScores.situation,
        task: currentScores.task,
        action: currentScores.action,
        result: currentScores.result,
      };

  // Check if any score increased
  const hasIncrease = Object.values(deltas).some((delta) => delta > 0);
  const changedElements = Object.entries(deltas)
    .filter(([, delta]) => delta > 0)
    .map(([key, delta]) => ({
      key,
      label: ELEMENT_LABELS[key as keyof typeof ELEMENT_LABELS],
      delta: Math.round(delta),
    }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.5 }}
        className={cn(
          "rounded-lg border p-3 shadow-md",
          hasIncrease
            ? "bg-success/10 border-success/30"
            : "bg-muted border-border"
        )}
      >
        <div className="flex items-center gap-2">
          {hasIncrease ? (
            <>
              {/* Success icon */}
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success/20 shrink-0">
                <svg
                  className="w-5 h-5 text-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              {/* Changed scores */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-success-foreground">
                  スコアが向上しました!
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {changedElements.map((element) => (
                    <motion.div
                      key={element.key}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.1 }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/20 text-success-foreground"
                    >
                      <span className="text-xs font-medium">
                        {element.label}
                      </span>
                      <span className="text-xs font-bold flex items-center gap-0.5">
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
                        </svg>
                        +{element.delta}%
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Neutral icon */}
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted-foreground/10 shrink-0">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>

              {/* Message */}
              <p className="text-sm text-muted-foreground">
                回答を記録しました
              </p>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
