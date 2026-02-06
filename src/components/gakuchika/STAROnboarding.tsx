"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface STAROnboardingProps {
  onDismiss: () => void;
}

const STAR_EXPLANATIONS = [
  {
    key: "situation",
    letter: "S",
    title: "状況",
    titleEn: "Situation",
    description: "いつ、どこで、何をしていたか",
    example: "大学2年次、サークルの部長として50人の組織を運営していた時期",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    key: "task",
    letter: "T",
    title: "課題",
    titleEn: "Task",
    description: "何が問題で、あなたは何を任されたか",
    example: "新入生の定着率が低く、入会後1ヶ月で3割が辞めてしまう課題があった",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  {
    key: "action",
    letter: "A",
    title: "行動",
    titleEn: "Action",
    description: "課題に対してあなたは何をしたか",
    example: "退会理由をヒアリングし、新入生向けメンター制度を立ち上げた",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  {
    key: "result",
    letter: "R",
    title: "結果",
    titleEn: "Result",
    description: "どんな成果が出たか、何を学んだか",
    example: "定着率が90%に向上。人を動かすには信頼関係が重要だと学んだ",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
] as const;

export function STAROnboarding({ onDismiss }: STAROnboardingProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <Card className="shadow-2xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl sm:text-3xl">
                STARフレームワークとは？
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                ガクチカを魅力的に伝えるための4つの要素
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* STAR cards */}
              <div className="space-y-3">
                {STAR_EXPLANATIONS.map((element, index) => (
                  <motion.div
                    key={element.key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card
                      className={cn(
                        "border-l-4 shadow-sm",
                        element.borderColor,
                        element.bgColor
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Letter badge */}
                          <div
                            className={cn(
                              "flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg shrink-0",
                              "bg-white shadow-sm border-2",
                              element.borderColor,
                              element.color
                            )}
                          >
                            {element.letter}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <h3
                                className={cn(
                                  "font-bold text-base",
                                  element.color
                                )}
                              >
                                {element.title}
                              </h3>
                              <span className="text-xs text-muted-foreground">
                                {element.titleEn}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 mb-2">
                              {element.description}
                            </p>
                            <div className="bg-white/60 rounded-md p-2 border border-border/50">
                              <p className="text-xs text-muted-foreground mb-0.5">
                                例:
                              </p>
                              <p className="text-xs text-foreground/90">
                                {element.example}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Info message */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-info/10 border border-info/20 rounded-lg p-4"
              >
                <p className="text-sm text-info-foreground">
                  <span className="font-medium">これから始まる深掘り会話では、</span>
                  <br />
                  AIがこの4つの要素について質問していきます。
                  <br />
                  各要素の充実度がリアルタイムで表示されるので、バランスよく回答しましょう。
                </p>
              </motion.div>

              {/* Dismiss button */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  onClick={onDismiss}
                  className="w-full h-12 text-base font-medium"
                  size="lg"
                >
                  理解しました
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
