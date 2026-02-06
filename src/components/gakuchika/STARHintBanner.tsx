"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface STARHintBannerProps {
  targetElement: string | null;
}

const ELEMENT_CONFIG = {
  situation: {
    label: "状況",
    icon: "📍",
    color: "bg-blue-50 border-blue-200 text-blue-900",
    iconBg: "bg-blue-100",
    tip: "時期・場所・規模など具体的な背景を含めると良いです",
  },
  task: {
    label: "課題",
    icon: "🎯",
    color: "bg-amber-50 border-amber-200 text-amber-900",
    iconBg: "bg-amber-100",
    tip: "なぜそれが課題だったか、自分の責任範囲を明確にしましょう",
  },
  action: {
    label: "行動",
    icon: "⚡",
    color: "bg-emerald-50 border-emerald-200 text-emerald-900",
    iconBg: "bg-emerald-100",
    tip: "なぜその方法を選んだか、工夫した点を伝えましょう",
  },
  result: {
    label: "結果",
    icon: "🌟",
    color: "bg-purple-50 border-purple-200 text-purple-900",
    iconBg: "bg-purple-100",
    tip: "数字での成果や、得た学び・気づきを含めましょう",
  },
} as const;

export function STARHintBanner({ targetElement }: STARHintBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!targetElement || !(targetElement in ELEMENT_CONFIG)) {
    return null;
  }

  const config = ELEMENT_CONFIG[targetElement as keyof typeof ELEMENT_CONFIG];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "rounded-lg border-l-4 p-3 mb-3",
          config.color
        )}
      >
        <div className="flex items-start gap-2">
          {/* Icon */}
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md text-base shrink-0",
              config.iconBg
            )}
          >
            {config.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                この質問は{" "}
                <span className="font-bold">{config.label}</span>{" "}
                に関するものです
              </p>

              {/* Expand/collapse button */}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-current/70 hover:text-current underline underline-offset-2 shrink-0 transition-colors"
              >
                {isExpanded ? "閉じる" : "ヒント"}
              </button>
            </div>

            {/* Expandable tip */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 pt-2 border-t border-current/10">
                    <p className="text-xs text-current/80">
                      💡 {config.tip}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
