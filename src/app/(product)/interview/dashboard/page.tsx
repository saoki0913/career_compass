import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";

import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { CompanyHeatmap } from "@/components/interview/dashboard/CompanyHeatmap";
import { FormatHeatmap } from "@/components/interview/dashboard/FormatHeatmap";
import { RecurringIssuesList } from "@/components/interview/dashboard/RecurringIssuesList";
import { TrendChart } from "@/components/interview/dashboard/TrendChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  companies,
  interviewConversations,
  interviewFeedbackHistories,
} from "@/lib/db/schema";
import {
  buildInterviewDashboardPayload,
  type InterviewHistoryRow,
} from "@/lib/interview/dashboard";

export const dynamic = "force-dynamic";

const FETCH_LIMIT = 50;

async function loadDashboardData(userId: string) {
  const rows = await db
    .select({
      companyId: interviewFeedbackHistories.companyId,
      companyName: companies.name,
      interviewFormat: interviewConversations.interviewFormat,
      scores: interviewFeedbackHistories.scores,
      improvements: interviewFeedbackHistories.improvements,
      completedAt: interviewFeedbackHistories.createdAt,
    })
    .from(interviewFeedbackHistories)
    .leftJoin(companies, eq(companies.id, interviewFeedbackHistories.companyId))
    .leftJoin(
      interviewConversations,
      eq(interviewConversations.id, interviewFeedbackHistories.conversationId),
    )
    .where(eq(interviewFeedbackHistories.userId, userId))
    .orderBy(desc(interviewFeedbackHistories.createdAt))
    .limit(FETCH_LIMIT);

  const normalized: InterviewHistoryRow[] = rows.map((row) => ({
    companyId: row.companyId,
    companyName: row.companyName ?? null,
    interviewFormat: row.interviewFormat ?? null,
    scores: row.scores,
    improvements: row.improvements,
    completedAt: row.completedAt,
  }));

  return buildInterviewDashboardPayload(normalized);
}

export default async function InterviewDashboardPage() {
  const requestHeaders = await headers();
  const identity = await getHeadersIdentity(requestHeaders);

  if (!identity?.userId) {
    return (
      <div className="min-h-screen bg-background">
        <main>
          <LoginRequiredForAi
            title="成長ダッシュボードはログイン後に利用できます"
            description="ログインすると、過去の最終講評から 7 軸スコア推移や企業別・方式別の弱点、頻出する改善キーワードを自動で可視化します。"
          />
        </main>
      </div>
    );
  }

  const payload = await loadDashboardData(identity.userId);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">面接 成長ダッシュボード</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                過去の最終講評を企業 / 方式 / 軸 / 改善キーワードで集計し、弱点の偏りと変化を一目で把握できます。
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              集計セッション数: <span className="font-medium text-foreground">{payload.totalSessions}</span>
            </div>
          </div>
          <Link
            href="/companies"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            企業一覧から面接対策を開始する →
          </Link>
        </div>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">7 軸スコア推移</CardTitle>
            <CardDescription>過去 10 セッションを古い順に並べ、7 軸それぞれの変化を折れ線で表示します。</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart points={payload.trendSeries} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">企業別 平均スコア</CardTitle>
            <CardDescription>
              セッション数が多い上位 10 社について、7 軸の平均スコアを段階色で示します。色が暖色 (赤 / オレンジ) のセルは弱点軸です。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyHeatmap cells={payload.companyHeatmap} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">面接方式別 平均スコア</CardTitle>
            <CardDescription>
              通常 / ケース / 技術 / 自分史の 4 方式 × 7 軸で平均を集計します。サンプルがない方式はグレーで表示します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormatHeatmap cells={payload.formatHeatmap} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">直近 3 セッションの頻出 キーワード</CardTitle>
            <CardDescription>
              直近 3 回の最終講評の「改善点」から、出現回数の多いキーワードを TOP 5 で抽出します。繰り返し指摘されている論点の把握に使えます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecurringIssuesList issues={payload.recurringIssues} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
