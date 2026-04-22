"use client";

/**
 * Phase 2 Stage 7: Weakness drill panel.
 *
 * Feedback 表示直下に展開され、以下 4 ステップの stepper を提供する:
 *   1. なぜ弱かったか (why_weak)
 *   2. 改善パターン (improvement_pattern)
 *   3. 模範回答 (model_rewrite)
 *   4. もう一度挑戦 (retry_answer → drill/score → delta 表示)
 *
 * Delta 表示:
 *   +1 以上 → 緑 + ↑
 *   0      → グレー
 *   -1 以下 → 赤 + ↓
 *
 * `startInterviewDrill` / `scoreInterviewDrill` は `src/lib/interview/client-api.ts` に置く。
 * 親 (Feedback 表示側) からは `companyId` と weakest 情報 (question / answer / axis / score /
 * evidence / originalScores) を props で受け取る。
 */

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  scoreInterviewDrill,
  startInterviewDrill,
  type InterviewDrillScoreResult,
  type InterviewDrillStartResult,
} from "@/lib/interview/client-api";

type DrillStep = "idle" | "loading_start" | "ready" | "scoring" | "complete" | "error";

export type DrillPanelProps = {
  companyId: string;
  weakestTurnId: string;
  weakestQuestion: string;
  weakestAnswer: string;
  weakestAxis: string;
  originalScore: number;
  weakestEvidence?: string[];
  originalScores?: Record<string, number>;
  originalFeedbackId?: string | null;
  interviewFormat?: string;
  interviewerType?: string;
  strictnessMode?: string;
};

const SEVEN_AXES: Array<{ key: string; label: string }> = [
  { key: "company_fit", label: "企業適合度" },
  { key: "role_fit", label: "職種適合度" },
  { key: "specificity", label: "具体性" },
  { key: "logic", label: "論理性" },
  { key: "persuasiveness", label: "説得力" },
  { key: "consistency", label: "一貫性" },
  { key: "credibility", label: "信頼性" },
];

function deltaClassName(delta: number): string {
  if (delta >= 1) return "text-emerald-600";
  if (delta <= -1) return "text-rose-600";
  return "text-slate-500";
}

function deltaGlyph(delta: number): string {
  if (delta >= 1) return "↑";
  if (delta <= -1) return "↓";
  return "–";
}

export function DrillPanel(props: DrillPanelProps) {
  const [step, setStep] = useState<DrillStep>("idle");
  const [startResult, setStartResult] = useState<InterviewDrillStartResult | null>(null);
  const [scoreResult, setScoreResult] = useState<InterviewDrillScoreResult | null>(null);
  const [retryAnswer, setRetryAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleStart = async () => {
    setStep("loading_start");
    setErrorMessage("");
    try {
      const result = await startInterviewDrill(props.companyId, {
        weakestTurnId: props.weakestTurnId,
        weakestQuestion: props.weakestQuestion,
        weakestAnswer: props.weakestAnswer,
        weakestAxis: props.weakestAxis,
        originalScore: props.originalScore,
        weakestEvidence: props.weakestEvidence ?? [],
        originalScores: props.originalScores,
        originalFeedbackId: props.originalFeedbackId ?? null,
        interviewFormat: props.interviewFormat,
        interviewerType: props.interviewerType,
        strictnessMode: props.strictnessMode,
      });
      setStartResult(result);
      setStep("ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ドリルの開始に失敗しました。");
      setStep("error");
    }
  };

  const handleScore = async () => {
    if (!startResult || !retryAnswer.trim()) return;
    setStep("scoring");
    setErrorMessage("");
    try {
      const result = await scoreInterviewDrill(props.companyId, {
        attemptId: startResult.attemptId,
        retryAnswer: retryAnswer.trim(),
      });
      setScoreResult(result);
      setStep("complete");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "再採点に失敗しました。");
      setStep("error");
    }
  };

  const handleReset = () => {
    setStep("idle");
    setStartResult(null);
    setScoreResult(null);
    setRetryAnswer("");
    setErrorMessage("");
  };

  // 初期状態: ドリル未開始。
  if (step === "idle" || step === "loading_start") {
    return (
      <Card data-testid="drill-panel" className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base">最弱回答を書き直して再採点する</CardTitle>
          <CardDescription>
            「{props.weakestAxis}」で {props.originalScore}/5 だった回答を書き直し、改善度を
            delta スコアで体感できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleStart}
            disabled={step === "loading_start"}
            data-testid="drill-start-button"
          >
            {step === "loading_start" ? "ドリルを準備中..." : "最弱回答をドリルする"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "error") {
    return (
      <Card data-testid="drill-panel" className="border-rose-200 bg-rose-50/40">
        <CardHeader>
          <CardTitle className="text-base text-rose-700">ドリルの実行に失敗しました</CardTitle>
          <CardDescription>{errorMessage || "時間をおいてもう一度お試しください。"}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleReset}>
            最初からやり直す
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ready / scoring / complete: 4 ステップ stepper を表示。
  return (
    <Card data-testid="drill-panel" className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base">最弱回答ドリル (4 ステップ)</CardTitle>
        <CardDescription>
          弱かった軸: <Badge variant="outline">{props.weakestAxis}</Badge>
          {" "}/ 当時のスコア: {props.originalScore}/5
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: why weak */}
        <section data-testid="drill-step-why-weak">
          <h3 className="font-semibold text-sm text-slate-700 mb-1">1. なぜ弱かったか</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{startResult?.whyWeak}</p>
        </section>

        {/* Step 2: improvement pattern */}
        <section data-testid="drill-step-pattern">
          <h3 className="font-semibold text-sm text-slate-700 mb-1">2. 改善パターン</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {startResult?.improvementPattern}
          </p>
        </section>

        {/* Step 3: model rewrite */}
        <section data-testid="drill-step-model">
          <h3 className="font-semibold text-sm text-slate-700 mb-1">3. 模範回答 (参考)</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3 border">
            {startResult?.modelRewrite}
          </p>
        </section>

        {/* Step 4: retry answer + delta */}
        <section data-testid="drill-step-retry">
          <h3 className="font-semibold text-sm text-slate-700 mb-1">4. もう一度挑戦</h3>
          <p className="text-sm text-slate-500 mb-2">
            retry_question: {startResult?.retryQuestion}
          </p>
          <textarea
            value={retryAnswer}
            onChange={(event) => setRetryAnswer(event.target.value)}
            placeholder="先ほどの回答を 150-250 字で書き直してみましょう..."
            rows={6}
            disabled={step === "scoring" || step === "complete"}
            data-testid="drill-retry-textarea"
            className="w-full rounded-md border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50"
          />
          {step !== "complete" ? (
            <div className="mt-3 flex gap-2">
              <Button
                onClick={handleScore}
                disabled={!retryAnswer.trim() || step === "scoring"}
                data-testid="drill-score-button"
              >
                {step === "scoring" ? "採点中..." : "採点する"}
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                やり直す
              </Button>
            </div>
          ) : null}
        </section>

        {/* Delta 結果 */}
        {scoreResult ? (
          <section data-testid="drill-delta-result" className="rounded-md border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">採点結果 (delta)</h3>
            <p className="text-sm text-slate-600 mb-3">{scoreResult.rationale}</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {SEVEN_AXES.map((axis) => {
                const delta = scoreResult.deltaScores[axis.key] ?? 0;
                const retryValue = scoreResult.retryScores[axis.key] ?? 0;
                return (
                  <li key={axis.key} className="flex items-center justify-between">
                    <span className="text-slate-700">{axis.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-slate-500">{retryValue}/5</span>
                      <span
                        className={`font-semibold ${deltaClassName(delta)}`}
                        data-testid={`drill-delta-${axis.key}`}
                      >
                        {deltaGlyph(delta)} {delta > 0 ? `+${delta}` : delta}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <Button variant="outline" onClick={handleReset}>
                新しいドリルを始める
              </Button>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default DrillPanel;
