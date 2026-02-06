"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STARProgressBar, type STARScores } from "./STARProgressBar";
import { cn } from "@/lib/utils";

interface GakuchikaSummary {
  summary: string;
  key_points: string[];
  numbers: string[];
  strengths: string[];
}

interface CompletionSummaryProps {
  starScores: STARScores;
  summary: GakuchikaSummary | null;
  isLoading: boolean;
  gakuchikaId: string;
  onNewSession?: () => void;
}

// Skeleton components for loading states
function SkeletonText({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted rounded-md",
        className
      )}
    />
  );
}

function SkeletonBadge() {
  return (
    <div className="animate-pulse bg-muted rounded-full h-6 w-20" />
  );
}

export function CompletionSummary({
  starScores,
  summary,
  isLoading,
  gakuchikaId,
  onNewSession,
}: CompletionSummaryProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
            <svg
              className="w-10 h-10 text-success"
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
        </div>
        <h2 className="text-2xl font-bold text-foreground">深掘り完了!</h2>
        <p className="text-sm text-muted-foreground">
          ガクチカの要素が十分に集まりました
        </p>
      </div>

      {/* STAR Scores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">STAR評価</CardTitle>
        </CardHeader>
        <CardContent>
          <STARProgressBar scores={starScores} />
        </CardContent>
      </Card>

      {/* Summary Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">サマリー</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <SkeletonText className="h-4 w-full" />
              <SkeletonText className="h-4 w-5/6" />
              <SkeletonText className="h-4 w-4/6" />
            </div>
          ) : summary ? (
            <p className="text-sm text-foreground/90 leading-relaxed">
              {summary.summary}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              サマリーを生成できませんでした
            </p>
          )}
        </CardContent>
      </Card>

      {/* Key Points */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">キーポイント</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted mt-2 shrink-0" />
                  <SkeletonText className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : summary && summary.key_points.length > 0 ? (
            <ul className="space-y-2">
              {summary.key_points.map((point, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-foreground/90"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              キーポイントがありません
            </p>
          )}
        </CardContent>
      </Card>

      {/* Numbers & Achievements */}
      {summary && summary.numbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">数字・成果</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((i) => (
                  <SkeletonBadge key={i} />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.numbers.map((num, index) => (
                  <Badge
                    key={index}
                    variant="soft-info"
                    className="text-xs"
                  >
                    {num}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {summary && summary.strengths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">あなたの強み</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((i) => (
                  <SkeletonBadge key={i} />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.strengths.map((strength, index) => (
                  <Badge
                    key={index}
                    variant="soft-success"
                    className="text-xs"
                  >
                    {strength}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CTAs */}
      <div className="space-y-3 pt-4">
        <Link href={`/es?gakuchikaId=${gakuchikaId}`} className="block">
          <Button className="w-full h-12 text-base font-medium" size="lg">
            ESを作成する
          </Button>
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {onNewSession && (
            <Button
              variant="outline"
              className="h-10"
              onClick={onNewSession}
            >
              もう一度深掘りする
            </Button>
          )}
          <Link href="/gakuchika" className="block">
            <Button variant="outline" className="w-full h-10">
              一覧に戻る
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
